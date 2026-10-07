/**
 * import-tmdb.ts — resumable curated bulk TMDB importer (movies AND tv).
 *
 * HONEST LIMITS: importing ALL of TMDB (millions of titles) via the public API
 * is infeasible (~40 req/10s rate limits, paginated discover caps ~500 pages,
 * and ToS). This is a CURATED bulk importer only:
 * trending/popular/top-rated + genre discover, paginated, rate-limited
 * (4 req/s), resumable via import_state, upserting into movies/series.
 *
 * Usage (tsx):
 *   npx tsx scripts/import-tmdb.ts --media=both --source=popular --pages=5 --region=US --limit=200 --resume
 *   npx tsx scripts/import-tmdb.ts --media=tv --source=trending --pages=3 --limit=60
 *   npx tsx scripts/import-tmdb.ts --media=movie --source=genre:28 --pages=5 --limit=100 --region=US
 *
 * Local SQLite via openLocalDb() (DB_FILE or ./data/local.db).
 * D1 path: apply migrations via wrangler then run this script against a
 * local SQLite snapshot, or adapt the upsert SQL to `wrangler d1 execute`
 * (see docs/DEPLOY.md appendix — D1 has no long-lived connection for
 * thousands of paced requests, so curated local import + SQL export is
 * the supported route).
 */
import { createRequire } from "node:module";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import { dbExecute } from "../src/lib/db/adapter.js";
import type { AppDb } from "../src/lib/db/adapter.js";
import * as schema from "../src/lib/db/schema.js";

/**
 * Node-only SQLite opener (ESM-safe). Scripts run in Node via tsx, so static
 * node:module + createRequire is fine here — unlike Astro/Workers bundles.
 */
function openLocalDb(): AppDb {
  const require = createRequire(import.meta.url);
  const Database = require("better-sqlite3") as typeof import("better-sqlite3");
  const file =
    (typeof process !== "undefined" ? process.env.DB_FILE : undefined) ??
    "./data/local.db";
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzleSqlite(sqlite, { schema }) as AppDb;
}
import { effectiveWithoutDb } from "../src/lib/settings.js";
import { getMovieMetaSafe } from "../src/lib/tmdb/client.js";
import { getTvMetaSafe } from "../src/lib/tmdb/series.js";
import type { ShowMeta } from "../src/lib/tmdb/series.js";
import type { MovieMeta } from "../src/lib/tmdb/types.js";
import { slugifyTitle, dbMovieId } from "../src/lib/cache.js";

const TMDB_BASE = "https://api.themoviedb.org/3";

// ---------------------------------------------------------------------------
// Pure options + arg parsing (unit-tested, no I/O)
// ---------------------------------------------------------------------------

export type ImportMedia = "movie" | "tv" | "both";
export type ImportSource = "trending" | "popular" | "top_rated" | "genre";

export interface ImportOptions {
  media: ImportMedia;
  source: ImportSource;
  /** Set when --source=genre:ID. */
  genreId: number | null;
  /** Max list pages to fetch per media type. */
  pages: number;
  region: string;
  /** Total titles cap across all media types. Default 200. */
  limit: number;
  resume: boolean;
}

export const IMPORT_DEFAULTS: ImportOptions = {
  media: "both",
  source: "popular",
  genreId: null,
  pages: 10,
  region: "US",
  limit: 200,
  resume: false,
};

function getFlagValue(argv: string[], name: string): string | null {
  const eq = `--${name}=`;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a.startsWith(eq)) return a.slice(eq.length).trim();
    if (a === `--${name}`) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) return next.trim();
      return "";
    }
  }
  return null;
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
}

/**
 * Parse CLI args (pass process.argv.slice(2)). Pure, throws on invalid
 * media/source/pages/limit so the CLI can exit non-zero with usage.
 */
export function parseImportArgs(argv: string[]): ImportOptions {
  const mediaRaw = getFlagValue(argv, "media") || IMPORT_DEFAULTS.media;
  const media = mediaRaw.trim().toLowerCase() as ImportMedia;
  if (media !== "movie" && media !== "tv" && media !== "both") {
    throw new Error(
      `invalid --media=${mediaRaw} (expected movie|tv|both)`
    );
  }

  const sourceRaw =
    getFlagValue(argv, "source") || IMPORT_DEFAULTS.source;
  const sourceLower = sourceRaw.trim().toLowerCase();
  let source: ImportSource = "popular";
  let genreId: number | null = null;
  if (sourceLower.startsWith("genre:")) {
    source = "genre";
    const idPart = sourceLower.slice("genre:".length).trim();
    const id = Number(idPart);
    if (!idPart || !Number.isSafeInteger(id) || id <= 0) {
      throw new Error(
        `invalid --source=${sourceRaw} (expected genre:<TMDB_ID>, e.g. genre:28)`
      );
    }
    genreId = id;
  } else if (
    sourceLower === "trending" ||
    sourceLower === "popular" ||
    sourceLower === "top_rated"
  ) {
    source = sourceLower;
  } else {
    throw new Error(
      `invalid --source=${sourceRaw} (expected trending|popular|top_rated|genre:ID)`
    );
  }

  const pagesRaw = getFlagValue(argv, "pages");
  let pages = IMPORT_DEFAULTS.pages;
  if (pagesRaw !== null && pagesRaw !== "") {
    const n = Number(pagesRaw);
    if (!Number.isSafeInteger(n) || n < 1 || n > 500) {
      throw new Error(`invalid --pages=${pagesRaw} (expected 1..500)`);
    }
    pages = n;
  }

  const regionRaw = getFlagValue(argv, "region") || IMPORT_DEFAULTS.region;
  let region = regionRaw.trim().toUpperCase() || "US";
  if (!/^[A-Z]{2}$/.test(region)) region = "US";

  const limitRaw = getFlagValue(argv, "limit");
  let limit = IMPORT_DEFAULTS.limit;
  if (limitRaw !== null && limitRaw !== "") {
    const n = Number(limitRaw);
    if (!Number.isSafeInteger(n) || n < 1 || n > 5000) {
      throw new Error(`invalid --limit=${limitRaw} (expected 1..5000)`);
    }
    limit = n;
  }

  const resume = hasFlag(argv, "resume") && getFlagValue(argv, "resume") !== "false";

  return { media, source, genreId, pages, region, limit, resume };
}

// ---------------------------------------------------------------------------
// Pure resume + rate-limit math (unit-tested)
// ---------------------------------------------------------------------------

/** TMDB courtesy rate: 4 requests/second (well under ~40 req/10s). */
export const IMPORT_REQ_PER_SEC = 4;

/** Milliseconds between requests for a given rate. Pure. */
export function delayMsForRate(perSec: number): number {
  if (!Number.isFinite(perSec) || perSec <= 0) return 250;
  return Math.max(1, Math.ceil(1000 / perSec));
}

/**
 * How long to wait before the next request given the last request time.
 * Pure (inject nowMs for tests).
 */
export function waitMsForThrottle(
  lastMs: number,
  nowMs: number,
  perSec: number = IMPORT_REQ_PER_SEC
): number {
  const gap = delayMsForRate(perSec);
  if (!Number.isFinite(lastMs) || lastMs <= 0) return 0;
  const elapsed = nowMs - lastMs;
  return Math.max(0, gap - elapsed);
}

/** Canonical import_state key, e.g. 'movie:popular', 'tv:genre:28'. Pure. */
export function buildSourceKey(
  mediaSingle: "movie" | "tv",
  source: ImportSource,
  genreId?: number | null
): string {
  if (source === "genre") return `${mediaSingle}:genre:${genreId ?? 0}`;
  return `${mediaSingle}:${source}`;
}

/**
 * First page to fetch. `savedPage` = last COMPLETED page in import_state.
 * Without --resume always restarts at 1; with --resume continues at +1.
 * Pure.
 */
export function resolveStartPage(
  savedPage: number | null | undefined,
  resume: boolean
): number {
  if (!resume) return 1;
  if (savedPage === null || savedPage === undefined) return 1;
  if (!Number.isSafeInteger(savedPage) || savedPage < 0) return 1;
  return savedPage + 1;
}

/** True while page fetching should continue. Pure. */
export function shouldFetchPage(
  page: number,
  maxPages: number,
  totalPages: number | null | undefined
): boolean {
  if (!Number.isSafeInteger(page) || page < 1) return false;
  if (page > maxPages) return false;
  if (
    totalPages !== null &&
    totalPages !== undefined &&
    Number.isSafeInteger(totalPages) &&
    page > totalPages
  )
    return false;
  return true;
}

/**
 * Exit-code policy: keep partial progress always, but exit non-zero on
 * persistent failures (3+ failures, or any failure with zero successes).
 * Pure.
 */
export function shouldFailExit(succeeded: number, failed: number): boolean {
  if (failed <= 0) return false;
  if (succeeded <= 0) return true;
  return failed >= 3;
}

// ---------------------------------------------------------------------------
// Row mapping (pure, unit-tested via mapping tests)
// ---------------------------------------------------------------------------

/** Canonical series id (same `tmdb:{id}` shape as movies — see schema docs). */
export function dbSeriesId(tmdbId: number): string {
  return `tmdb:${tmdbId}`;
}

export interface SeriesDbRow {
  id: string;
  tmdb_id: number;
  media_type: string;
  title: string;
  original_title: string | null;
  overview: string | null;
  first_air_date: string | null;
  year: number | null;
  runtime_min: number | null;
  seasons: number | null;
  episodes: number | null;
  status: string | null;
  genres: string;
  poster: string | null;
  backdrop: string | null;
  creators: string;
  cast: string;
  vote_average: number | null;
  vote_count: number | null;
  popularity: number | null;
  imdb_id: string | null;
  fetched_at: string;
  updated_at: string;
}

/** Map ShowMeta onto the `series` table row. Pure, never throws. */
export function seriesToDbRow(show: ShowMeta): SeriesDbRow {
  const now = new Date().toISOString();
  let genres = "[]";
  let creators = "[]";
  let cast = "[]";
  try {
    genres = JSON.stringify((show.genres ?? []).map((g) => g.name));
  } catch {
    genres = "[]";
  }
  try {
    creators = JSON.stringify(
      (show.credits?.creators ?? []).map((c) => c.name)
    );
  } catch {
    creators = "[]";
  }
  try {
    cast = JSON.stringify((show.credits?.topCast ?? []).map((c) => c.name));
  } catch {
    cast = "[]";
  }
  return {
    id: dbSeriesId(show.tmdbId),
    tmdb_id: show.tmdbId,
    media_type: "tv",
    title: show.title || "Untitled",
    original_title: show.originalTitle ?? null,
    overview: show.overview ?? null,
    first_air_date: show.firstAirDate ?? null,
    year: show.year ?? null,
    runtime_min: show.runtimeMinutes ?? null,
    seasons: show.seasons ?? null,
    episodes: show.episodes ?? null,
    status: show.status ?? null,
    genres,
    poster: show.posterUrl ?? null,
    backdrop: show.backdropUrl ?? null,
    creators,
    cast,
    vote_average: show.voteAverage ?? null,
    vote_count: show.voteCount ?? null,
    popularity: show.popularity ?? null,
    imdb_id: show.imdbId ?? null,
    fetched_at: show.fetchedAt ?? now,
    updated_at: now,
  };
}

// ---------------------------------------------------------------------------
// Network (list pages) + paced execution
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function listPath(
  mediaSingle: "movie" | "tv",
  source: ImportSource,
  genreId: number | null,
  region: string
): { path: string; params: Record<string, string> } {
  const lang = { language: "en-US" };
  if (source === "trending")
    return {
      path: `/trending/${mediaSingle}/week`,
      params: { ...lang },
    };
  if (source === "popular")
    return {
      path: `/${mediaSingle}/popular`,
      params: { ...lang, region },
    };
  if (source === "top_rated")
    return {
      path: `/${mediaSingle}/top_rated`,
      params: { ...lang, region },
    };
  return {
    path: `/discover/${mediaSingle}`,
    params: {
      ...lang,
      sort_by: "popularity.desc",
      include_adult: "false",
      with_genres: String(genreId ?? 0),
      watch_region: region,
    },
  };
}

/** Fetch one list page -> TMDB ids + total_pages. Throws on HTTP failure. */
export async function fetchListPage(
  mediaSingle: "movie" | "tv",
  source: ImportSource,
  genreId: number | null,
  page: number,
  region: string,
  apiKey: string
): Promise<{ ids: number[]; totalPages: number | null }> {
  const { path, params } = listPath(mediaSingle, source, genreId, region);
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("page", String(page));
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`TMDB ${path} p${page} failed: ${res.status}`);
  }
  const json = (await res.json()) as {
    results?: Array<{ id?: unknown }>;
    total_pages?: unknown;
  };
  const ids: number[] = [];
  if (json && Array.isArray(json.results)) {
    for (const r of json.results) {
      if (
        r &&
        typeof r === "object" &&
        typeof (r as { id?: unknown }).id === "number" &&
        Number.isSafeInteger((r as { id: number }).id)
      ) {
        ids.push((r as { id: number }).id);
      }
    }
  }
  const totalPages =
    typeof json?.total_pages === "number" &&
    Number.isSafeInteger(json.total_pages) &&
    (json.total_pages as number) > 0
      ? (json.total_pages as number)
      : null;
  return { ids, totalPages };
}

// ---------------------------------------------------------------------------
// DB upserts (driver-agnostic `execute`, works on D1 + better-sqlite3)
// ---------------------------------------------------------------------------

const SERIES_DDL = `
CREATE TABLE IF NOT EXISTS series (
  id TEXT PRIMARY KEY,
  tmdb_id INTEGER UNIQUE,
  media_type TEXT NOT NULL DEFAULT 'tv',
  title TEXT NOT NULL,
  original_title TEXT,
  overview TEXT,
  first_air_date TEXT,
  year INTEGER,
  runtime_min INTEGER,
  seasons INTEGER,
  episodes INTEGER,
  status TEXT,
  genres TEXT,
  poster TEXT,
  backdrop TEXT,
  creators TEXT,
  cast TEXT,
  vote_average REAL,
  vote_count INTEGER,
  popularity REAL,
  imdb_id TEXT,
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS import_state (
  source TEXT PRIMARY KEY,
  page INTEGER NOT NULL DEFAULT 0,
  total_pages INTEGER,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);`.trim();

async function ensureTables(db: AppDb): Promise<void> {
  const exec = async (q: import("drizzle-orm").SQL) => await dbExecute(db, q);
  // Split DDL (D1 + better-sqlite3 both prefer single statements).
  for (const stmt of SERIES_DDL.split(";")) {
    const trimmed = stmt.trim();
    if (!trimmed) continue;
    await exec(sql.raw(trimmed));
  }
}

async function loadImportState(
  db: AppDb,
  source: string
): Promise<{ page: number; totalPages: number | null } | null> {
  try {
    const list = await dbExecute(
      db,
      sql`SELECT page, total_pages FROM import_state WHERE source = ${source} LIMIT 1`
    );
    const first = list[0] as
      | { page?: unknown; total_pages?: unknown }
      | undefined;
    if (!first) return null;
    const page =
      typeof first.page === "number" && Number.isSafeInteger(first.page)
        ? first.page
        : 0;
    const totalPages =
      typeof first.total_pages === "number" &&
      Number.isSafeInteger(first.total_pages)
        ? first.total_pages
        : null;
    return { page, totalPages };
  } catch {
    return null;
  }
}

async function saveImportState(
  db: AppDb,
  source: string,
  page: number,
  totalPages: number | null
): Promise<void> {
  const now = new Date().toISOString();
  await dbExecute(
    db,
    sql`INSERT INTO import_state (source, page, total_pages, updated_at)
        VALUES (${source}, ${page}, ${totalPages}, ${now})
        ON CONFLICT(source) DO UPDATE SET page=excluded.page, total_pages=excluded.total_pages, updated_at=excluded.updated_at`
  );
}

async function upsertMovie(
  db: AppDb,
  movie: MovieMeta
): Promise<void> {
  // Reuse the foundation row mapper shape (cache.movieToDbRow equivalent,
  // inlined to avoid cross-module drift).
  const id = dbMovieId(movie.tmdbId);
  const slug = slugifyTitle(movie.title || "Untitled", movie.tmdbId);
  const directors = JSON.stringify(
    (movie.credits?.directors ?? []).map((d) => d.name)
  );
  const genres = JSON.stringify((movie.genres ?? []).map((g) => g.name));
  await dbExecute(
    db,
    sql`INSERT INTO movies (id, tmdb_id, title, slug, year, directors, poster, synopsis, runtime_min, genres)
        VALUES (${id}, ${movie.tmdbId}, ${movie.title || "Untitled"}, ${slug}, ${movie.year}, ${directors}, ${movie.posterUrl}, ${movie.overview || null}, ${movie.runtimeMinutes}, ${genres})
        ON CONFLICT(id) DO UPDATE SET title=excluded.title, slug=excluded.slug, year=excluded.year, directors=excluded.directors, poster=excluded.poster, synopsis=excluded.synopsis, runtime_min=excluded.runtime_min, genres=excluded.genres`
  );
}

async function upsertSeries(
  db: AppDb,
  show: ShowMeta
): Promise<void> {
  const row = seriesToDbRow(show);
  await dbExecute(
    db,
    sql`INSERT INTO series (id, tmdb_id, media_type, title, original_title, overview, first_air_date, year, runtime_min, seasons, episodes, status, genres, poster, backdrop, creators, cast, vote_average, vote_count, popularity, imdb_id, fetched_at, updated_at)
        VALUES (${row.id}, ${row.tmdb_id}, ${row.media_type}, ${row.title}, ${row.original_title}, ${row.overview}, ${row.first_air_date}, ${row.year}, ${row.runtime_min}, ${row.seasons}, ${row.episodes}, ${row.status}, ${row.genres}, ${row.poster}, ${row.backdrop}, ${row.creators}, ${row.cast}, ${row.vote_average}, ${row.vote_count}, ${row.popularity}, ${row.imdb_id}, ${row.fetched_at}, ${row.updated_at})
        ON CONFLICT(id) DO UPDATE SET title=excluded.title, original_title=excluded.original_title, overview=excluded.overview, first_air_date=excluded.first_air_date, year=excluded.year, runtime_min=excluded.runtime_min, seasons=excluded.seasons, episodes=excluded.episodes, status=excluded.status, genres=excluded.genres, poster=excluded.poster, backdrop=excluded.backdrop, creators=excluded.creators, cast=excluded.cast, vote_average=excluded.vote_average, vote_count=excluded.vote_count, popularity=excluded.popularity, imdb_id=excluded.imdb_id, fetched_at=excluded.fetched_at, updated_at=excluded.updated_at`
  );
}

// ---------------------------------------------------------------------------
// Main import loop
// ---------------------------------------------------------------------------

export interface ImportSummary {
  attempted: number;
  succeeded: number;
  failed: number;
  failures: string[];
  sources: string[];
}

async function runImport(opts: ImportOptions): Promise<ImportSummary> {
  const apiKey = effectiveWithoutDb("tmdb.api_key").trim();
  if (!apiKey) {
    throw new Error(
      "TMDB_API_KEY is not configured — set TMDB_API_KEY env or /admin/settings → APIs."
    );
  }
  const region = (opts.region || "US").toUpperCase();
  const db = openLocalDb();
  await ensureTables(db);

  const medias: Array<"movie" | "tv"> =
    opts.media === "both" ? ["movie", "tv"] : [opts.media];
  const summary: ImportSummary = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    failures: [],
    sources: [],
  };

  let lastReq = 0;
  const paced = async <T>(fn: () => Promise<T>): Promise<T> => {
    const wait = waitMsForThrottle(lastReq, Date.now(), IMPORT_REQ_PER_SEC);
    if (wait > 0) await sleep(wait);
    try {
      return await fn();
    } finally {
      lastReq = Date.now();
    }
  };

  let remaining = opts.limit;
  for (const mediaSingle of medias) {
    if (remaining <= 0) break;
    const sourceKey = buildSourceKey(mediaSingle, opts.source, opts.genreId);
    summary.sources.push(sourceKey);
    const saved = await loadImportState(db, sourceKey);
    const startPage = resolveStartPage(saved?.page ?? null, opts.resume);
    console.log(
      `[import:tmdb] ${sourceKey}: start page ${startPage}` +
        (saved ? ` (saved page=${saved.page}, total_pages=${saved.totalPages ?? "?"})` : " (fresh)") +
        ` region=${region} pages<=${opts.pages} remaining=${remaining}`
    );

    let totalPages: number | null = saved?.totalPages ?? null;
    let fetchedPages = 0;
    let page = startPage;
    while (remaining > 0 && fetchedPages < opts.pages) {
      if (!shouldFetchPage(page, startPage + opts.pages - 1, totalPages)) break;
      let list: { ids: number[]; totalPages: number | null };
      try {
        list = await paced(() =>
          fetchListPage(mediaSingle, opts.source, opts.genreId, page, region, apiKey)
        );
      } catch (err) {
        const msg = `${sourceKey} p${page} list failed: ${err instanceof Error ? err.message : String(err)}`;
        console.error(`[import:tmdb] ${msg}`);
        summary.failed += 1;
        summary.failures.push(msg);
        break;
      }
      if (list.totalPages !== null) totalPages = list.totalPages;
      const ids = list.ids.slice(0, remaining);
      console.log(
        `[import:tmdb] ${sourceKey} p${page}/${totalPages ?? "?"}: ${ids.length} titles`
      );
      for (const id of ids) {
        if (remaining <= 0) break;
        summary.attempted += 1;
        try {
          if (mediaSingle === "movie") {
            const res = await paced(() => getMovieMetaSafe(id, region));
            await upsertMovie(db, res.movie);
            if (!res.ok) {
              summary.failed += 1;
              summary.failures.push(`${sourceKey} movie:${id} detail soft-fail: ${res.error ?? "unknown"}`);
            } else {
              summary.succeeded += 1;
            }
          } else {
            const res = await paced(() => getTvMetaSafe(id, region));
            await upsertSeries(db, res.show);
            if (!res.ok) {
              summary.failed += 1;
              summary.failures.push(`${sourceKey} tv:${id} detail soft-fail: ${res.error ?? "unknown"}`);
            } else {
              summary.succeeded += 1;
            }
          }
        } catch (err) {
          summary.failed += 1;
          const msg = `${sourceKey} ${mediaSingle}:${id} FAILED: ${err instanceof Error ? err.message : String(err)}`;
          console.error(`[import:tmdb] ${msg}`);
          summary.failures.push(msg);
        }
        remaining -= 1;
        if (summary.attempted % 20 === 0) {
          console.log(
            `[import:tmdb] progress attempted=${summary.attempted} ok=${summary.succeeded} fail=${summary.failed} remaining=${remaining}`
          );
        }
      }
      // Page completed (even with per-title soft-fails) — advance the cursor.
      await saveImportState(db, sourceKey, page, totalPages);
      fetchedPages += 1;
      page += 1;
      if (totalPages !== null && page > totalPages) break;
    }
  }
  return summary;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(
      [
        "import-tmdb — curated TMDB bulk import (movies AND tv, resumable).",
        "",
        "  npx tsx scripts/import-tmdb.ts --media=both --source=popular --pages=5 --region=US --limit=200 --resume",
        "",
        "Flags:",
        "  --media=movie|tv|both        (default both)",
        "  --source=trending|popular|top_rated|genre:ID  (default popular)",
        "  --pages=N                  max list pages per media (default 10, 1..500)",
        "  --region=US                2-letter region (default US)",
        "  --limit=N                  total titles cap (default 200, 1..5000)",
        "  --resume                   continue from import_state cursor",
        "",
        "Honest limits: curated import only — NOT all of TMDB (see header).",
      ].join("\n")
    );
    return;
  }
  let opts: ImportOptions;
  try {
    opts = parseImportArgs(argv);
  } catch (err) {
    console.error(`[import:tmdb] ${err instanceof Error ? err.message : String(err)}`);
    console.error("[import:tmdb] use --help for usage.");
    process.exit(2);
    return;
  }
  console.log(
    `[import:tmdb] media=${opts.media} source=${opts.source}${opts.source === "genre" ? `:${opts.genreId}` : ""} pages=${opts.pages} region=${opts.region} limit=${opts.limit} resume=${opts.resume} rate=${IMPORT_REQ_PER_SEC}/s`
  );
  try {
    const summary = await runImport(opts);
    console.log(
      `[import:tmdb] done attempted=${summary.attempted} ok=${summary.succeeded} fail=${summary.failed} sources=${summary.sources.join(",")}`
    );
    if (summary.failures.length > 0) {
      console.error(`[import:tmdb] failures (${summary.failures.length}):`);
      for (const f of summary.failures.slice(0, 25)) console.error(`  - ${f}`);
      if (summary.failures.length > 25)
        console.error(`  … +${summary.failures.length - 25} more`);
    }
    console.log("[import:tmdb] partial progress kept in movies/series + import_state.");
    if (shouldFailExit(summary.succeeded, summary.failed)) {
      console.error("[import:tmdb] persistent failures — exiting 1 (resume with --resume).");
      process.exit(1);
    }
  } catch (err) {
    console.error(`[import:tmdb] FATAL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

if ((process.argv[1] ?? "").endsWith("import-tmdb.ts")) {
  main().catch((e) => {
    console.error("[import:tmdb] FATAL:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
