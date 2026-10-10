/**
 * Store-unification machinery: published admin rows (data/reviews.json)
 * override DEMO rows by slug, filtered by site namespace.
 *
 * Sync file reads (server-only module); missing/corrupt file → DEMO only.
 * Extracted from seo/content.ts to keep that file under its 500-line rule.
 */
import fs from "node:fs";
import path from "node:path";
import type { Review } from "../../pages/api/admin/_store";
import type { PublicReview } from "./content";

/**
 * This deploy's site key (`SITE_ID` env, e.g. extramovies/cinemavilla).
 * Unset = show everything (dev default, backward compatible).
 */
export function siteId(): string | null {
  try {
    const v =
      typeof process !== "undefined" ? (process.env.SITE_ID ?? "").trim() : "";
    return v !== "" ? v : null;
  } catch {
    return null;
  }
}

/** True when a review's site list allows the current deploy. */
export function visibleHere(sites: string[] | undefined): boolean {
  const id = siteId();
  if (id === null) return true;
  if (!Array.isArray(sites) || sites.length === 0) return true;
  return sites.includes(id);
}

function storeDbPath(): string {
  return (
    process.env.REVIEWS_DB_PATH ?? path.join(process.cwd(), "data", "reviews.json")
  );
}

interface StoreCache {
  file: string;
  mtimeMs: number;
  rows: Review[];
}

let storeCache: StoreCache | null = null;

function readStoreRows(): Review[] {
  const file = storeDbPath();
  try {
    const stat = fs.statSync(file);
    if (storeCache && storeCache.file === file && storeCache.mtimeMs === stat.mtimeMs) {
      return storeCache.rows;
    }
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    const rows = Array.isArray(parsed) ? (parsed as Review[]) : [];
    storeCache = { file, mtimeMs: stat.mtimeMs, rows };
    return rows;
  } catch {
    return [];
  }
}

function toFiniteNumber(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Map an admin-store row onto the public contract. Null when unusable. */
function storeToPublic(r: Review): PublicReview | null {
  if (!r || r.status !== "published") return null;
  const slug = typeof r.slug === "string" ? r.slug.trim() : "";
  const title = typeof r.title === "string" ? r.title.trim() : "";
  const markdown = typeof r.markdown === "string" ? r.markdown : "";
  const excerpt = typeof r.excerpt === "string" && r.excerpt.trim() ? r.excerpt.trim() : "";
  if (!slug || !title || !markdown || !excerpt) return null;
  const movie = r.movie ?? {};
  const tmdbId = toFiniteNumber(movie.movieId);
  return {
    slug,
    reviewTitle: title,
    movieTitle: typeof movie.title === "string" && movie.title.trim() ? movie.title.trim() : title,
    year: toFiniteNumber(movie.year),
    genres: Array.isArray(movie.genres) ? movie.genres.filter((g): g is string => typeof g === "string") : [],
    runtimeMinutes: null,
    rating: typeof r.rating === "number" && Number.isFinite(r.rating) ? r.rating : 0,
    verdict: excerpt,
    excerpt,
    bodyMarkdown: markdown,
    posterUrl: typeof movie.poster === "string" ? movie.poster : null,
    backdropUrl: null,
    director: typeof movie.director === "string" ? movie.director : null,
    cast: Array.isArray(movie.cast) ? movie.cast.filter((c): c is string => typeof c === "string") : [],
    publishedAt: r.publishedAt ?? r.updatedAt,
    updatedAt: r.updatedAt,
    authorName: "The Editor",
    ...(r.platformPick === true ? { platformPick: true as const } : {}),
    providers: null,
    ...(r.customWatch ? { customWatch: r.customWatch } : {}),
    ...("sites" in r && Array.isArray(r.sites)
      ? { sites: r.sites.filter((s): s is string => typeof s === "string") }
      : {}),
    tmdbId: tmdbId !== null && Number.isInteger(tmdbId) && tmdbId > 0 ? tmdbId : null,
  };
}

/**
 * Merge a store row over its DEMO counterpart, per field. The store wins
 * everywhere it has a value; the DEMO fills fields the store shape cannot
 * carry (verdict, backdrop, providers, author, featured).
 */
function mergeDemo(demo: PublicReview, r: Review): PublicReview {
  const movie = r.movie ?? {};
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const strs = (v: unknown): string[] | null =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : null;
  const tmdbId = toFiniteNumber(movie.movieId);
  return {
    ...demo,
    reviewTitle: str(r.title) ?? demo.reviewTitle,
    movieTitle: str(movie.title) ?? demo.movieTitle,
    year: toFiniteNumber(movie.year) ?? demo.year,
    genres: strs(movie.genres) ?? demo.genres,
    rating: num(r.rating) ?? demo.rating,
    verdict: str(r.excerpt) ? (str(r.excerpt) as string) : demo.verdict,
    excerpt: str(r.excerpt) ?? demo.excerpt,
    bodyMarkdown: str(r.markdown) ?? demo.bodyMarkdown,
    posterUrl: str(movie.poster) ?? demo.posterUrl,
    director: str(movie.director) ?? demo.director,
    cast: strs(movie.cast) ?? demo.cast,
    publishedAt: r.publishedAt ?? demo.publishedAt,
    updatedAt: r.updatedAt ?? demo.updatedAt,
    platformPick:
      "platformPick" in r && typeof r.platformPick === "boolean"
        ? r.platformPick
        : (demo.platformPick ?? false),
    ...(r.customWatch ? { customWatch: r.customWatch } : {}),
    ...("sites" in r && Array.isArray(r.sites)
      ? { sites: r.sites.filter((s): s is string => typeof s === "string") }
      : {}),
    tmdbId:
      tmdbId !== null && Number.isInteger(tmdbId) && tmdbId > 0
        ? tmdbId
        : demo.tmdbId,
  };
}

/**
 * Merge published store rows over DEMO rows by slug. Draft rows suppress
 * their DEMO twin on this site only; site filtering applies throughout.
 * File order never decides visibility. Returns unsorted (caller sorts).
 */
export function mergeStoreReviews(demos: PublicReview[]): PublicReview[] {
  const rows = readStoreRows();
  const suppressed = new Set<string>();
  for (const row of rows) {
    if (!row || row.status === "published") continue;
    const slug = typeof row.slug === "string" ? row.slug.trim() : "";
    if (slug) suppressed.add(slug);
  }
  const bySlug = new Map<string, PublicReview>();
  for (const demo of demos) {
    if (!suppressed.has(demo.slug) && visibleHere(demo.sites)) {
      bySlug.set(demo.slug, demo);
    }
  }
  for (const row of rows) {
    if (!row || row.status !== "published") continue;
    const slug = typeof row.slug === "string" ? row.slug.trim() : "";
    if (!slug) continue;
    const rowSites = Array.isArray((row as { sites?: unknown }).sites)
      ? (row.sites as string[])
      : undefined;
    if (!visibleHere(rowSites)) continue;
    const base = bySlug.get(slug);
    if (base) {
      bySlug.set(slug, mergeDemo(base, row));
    } else {
      const pub = storeToPublic(row);
      if (pub) bySlug.set(pub.slug, pub);
    }
  }
  return [...bySlug.values()];
}
