/**
 * enrich-tmdb.ts — add TMDB facts to seed frontmatter.
 *
 * The seeds already carry the editorial fields (title, rating, verdict,
 * cast, director). This script fills the factual gaps a reader and a crawler
 * both benefit from: release date, production companies, countries, spoken
 * languages, certification, franchise, budget and worldwide box office.
 *
 * Rules:
 *   - Only positive, non-empty TMDB values are written. A missing budget is
 *     left missing, never turned into "$0" or an invented number.
 *   - Existing frontmatter wins. A value the editor already wrote is never
 *     overwritten unless --force is passed.
 *   - The media type is resolved from the IMDb id through TMDB /find, because
 *     film ids and TV ids share the same number space. An ambiguous answer is
 *     skipped, not guessed.
 *   - The script is idempotent: a second run changes nothing.
 *
 * Usage:
 *   npx tsx scripts/enrich-tmdb.ts --dry
 *   npx tsx scripts/enrich-tmdb.ts
 *   npx tsx scripts/enrich-tmdb.ts --dir=seeds/extramovies --force
 *
 * TMDB_API_KEY is read from .env (or the environment). The key is never
 * printed. Get a key at https://www.themoviedb.org/settings/api.
 */
import { promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseFrontmatter, stringifyFrontmatter } from '../src/lib/portability.js';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const DEFAULT_DIR = 'seeds/extramovies';
const DEFAULT_REGION = 'US';
const REQUEST_GAP_MS = 260;

type MediaType = 'movie' | 'tv';

interface Details {
  id?: number;
  release_date?: string;
  first_air_date?: string;
  production_companies?: Array<{ name?: string }>;
  production_countries?: Array<{ name?: string }>;
  spoken_languages?: Array<{ english_name?: string; name?: string }>;
  belongs_to_collection?: { name?: string } | null;
  budget?: number;
  revenue?: number;
  release_dates?: { results?: Array<{ iso_3166_1?: string; release_dates?: Array<{ certification?: string }> }> };
  content_ratings?: { results?: Array<{ iso_3166_1?: string; rating?: string }> };
}

interface FindResult {
  movie_results?: Array<{ id?: number }>;
  tv_results?: Array<{ id?: number }>;
}

interface RunReport {
  enriched: number;
  unchanged: number;
  skipped: number;
  errors: string[];
  fields: Map<string, number>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Load .env without a dotenv dependency. Existing env vars win. */
function loadEnv(): void {
  let raw = '';
  try {
    raw = readFileSync('.env', 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1]!;
    let value = match[2]!.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function apiKey(): string {
  const key = process.env.TMDB_API_KEY?.trim();
  if (!key) {
    throw new Error('TMDB_API_KEY is missing. Add it to .env (server-side only).');
  }
  return key;
}

/** One TMDB GET. The key stays in the query string and never reaches a log. */
async function tmdb<T>(pathname: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${TMDB_BASE}${pathname}`);
  url.searchParams.set('api_key', apiKey());
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after') ?? '1');
      await sleep(Number.isFinite(retry) && retry > 0 ? retry * 1000 : 1000);
      continue;
    }
    if (!res.ok) throw new Error(`TMDB ${pathname}: HTTP ${res.status}`);
    return (await res.json()) as T;
  }
  throw new Error(`TMDB ${pathname}: rate limited after 3 attempts`);
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function positiveInt(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

/** JSON array in the spaced style the seeds already use: ["A", "B"]. */
function jsonArray(values: string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(', ')}]`;
}

function regionOf(extras: Record<string, unknown>): string {
  const raw = str(extras.region) ?? DEFAULT_REGION;
  return raw.toUpperCase().slice(0, 2);
}

/**
 * Resolve the title's media type and TMDB id. The IMDb id is authoritative
 * across the film/TV namespaces; a title match is the fallback. An answer
 * that matches both namespaces without a pinned id is ambiguous and skipped.
 */
async function resolveSubject(
  extras: Record<string, unknown>,
): Promise<{ mediaType: MediaType; id: number } | null> {
  const imdbId = str(extras.imdb_id) ?? str(extras.movie_imdb);
  const tmdbId = positiveInt(extras.tmdb_id) ?? positiveInt(extras.movie_id);
  const pinned = extras.media_type === 'movie' || extras.media_type === 'tv' ? extras.media_type : null;
  if (pinned && tmdbId) return { mediaType: pinned, id: tmdbId };

  if (imdbId) {
    const found = await tmdb<FindResult>(`/find/${encodeURIComponent(imdbId)}`, {
      external_source: 'imdb_id',
      language: 'en-US',
    });
    const movie = found.movie_results?.[0]?.id;
    const tv = found.tv_results?.[0]?.id;
    if (movie && !tv) return { mediaType: 'movie', id: movie };
    if (tv && !movie) return { mediaType: 'tv', id: tv };
    if (movie && tv && tmdbId) {
      if (movie === tmdbId) return { mediaType: 'movie', id: tmdbId };
      if (tv === tmdbId) return { mediaType: 'tv', id: tmdbId };
    }
    if (movie && tv) return null;
  }

  if (tmdbId) {
    try {
      const movie = await tmdb<Details>(`/movie/${tmdbId}`, { language: 'en-US' });
      if (movie.id) return { mediaType: 'movie', id: movie.id };
    } catch {
      /* try the TV namespace */
    }
    try {
      const tv = await tmdb<Details>(`/tv/${tmdbId}`, { language: 'en-US' });
      if (tv.id) return { mediaType: 'tv', id: tv.id };
    } catch {
      /* unknown */
    }
  }
  return null;
}

async function detailsFor(mediaType: MediaType, id: number): Promise<Details> {
  if (mediaType === 'movie') {
    return tmdb<Details>(`/movie/${id}`, {
      language: 'en-US',
      append_to_response: 'release_dates',
    });
  }
  return tmdb<Details>(`/tv/${id}`, {
    language: 'en-US',
    append_to_response: 'content_ratings',
  });
}

/**
 * The seed's region only. A UK "15" is not a US "R", so a missing local
 * certification stays missing rather than borrowing another country's label.
 */
function certificationFor(details: Details, mediaType: MediaType, region: string): string | undefined {
  if (mediaType === 'movie') {
    const rows = details.release_dates?.results ?? [];
    const local = rows.find((row) => row.iso_3166_1 === region);
    for (const release of local?.release_dates ?? []) {
      const value = str(release.certification);
      if (value) return value;
    }
    return undefined;
  }
  const rows = details.content_ratings?.results ?? [];
  const local = rows.find((row) => row.iso_3166_1 === region);
  return str(local?.rating);
}

/** Only the facts TMDB actually carries. Empty/zero values are omitted. */
function buildPatch(
  details: Details,
  mediaType: MediaType,
  region: string,
): Record<string, string | number> {
  const patch: Record<string, string | number> = {};
  const releaseDate = mediaType === 'movie' ? details.release_date : details.first_air_date;
  if (typeof releaseDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
    patch.movie_release_date = releaseDate;
  }

  const studios = (details.production_companies ?? [])
    .map((company) => str(company.name))
    .filter((name): name is string => Boolean(name));
  if (studios.length > 0) patch.movie_studio = jsonArray(studios);

  const countries = (details.production_countries ?? [])
    .map((country) => str(country.name))
    .filter((name): name is string => Boolean(name));
  if (countries.length > 0) patch.movie_country = jsonArray(countries);

  const languages = (details.spoken_languages ?? [])
    .map((language) => str(language.english_name) ?? str(language.name))
    .filter((name): name is string => Boolean(name));
  if (languages.length > 0) patch.movie_language = jsonArray(languages);

  const certification = certificationFor(details, mediaType, region);
  if (certification) patch.movie_certification = certification;

  if (mediaType === 'movie') {
    const collection = str(details.belongs_to_collection?.name);
    if (collection) patch.movie_collection = collection;
  }

  if (typeof details.budget === 'number' && Number.isFinite(details.budget) && details.budget > 0) {
    patch.movie_budget = Math.round(details.budget);
  }
  if (typeof details.revenue === 'number' && Number.isFinite(details.revenue) && details.revenue > 0) {
    patch.movie_revenue = Math.round(details.revenue);
  }

  patch.media_type = mediaType;
  return patch;
}

function isFilled(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

async function enrichFile(
  file: string,
  opts: { dry: boolean; force: boolean },
  report: RunReport,
): Promise<void> {
  const raw = await fs.readFile(file, 'utf8');
  const { data, body } = parseFrontmatter(raw);
  const slug = str(data.slug) ?? path.basename(file, '.md');

  let subject: { mediaType: MediaType; id: number } | null = null;
  try {
    subject = await resolveSubject(data);
    await sleep(REQUEST_GAP_MS);
    if (!subject) {
      report.skipped += 1;
      console.log(`[enrich] skip ${slug}: media type could not be resolved`);
      return;
    }
    const details = await detailsFor(subject.mediaType, subject.id);
    await sleep(REQUEST_GAP_MS);
    const patch = buildPatch(details, subject.mediaType, regionOf(data));

    let changed = 0;
    const next: Record<string, unknown> = { ...data };
    for (const [key, value] of Object.entries(patch)) {
      if (!opts.force && isFilled(next[key])) continue;
      if (next[key] === value) continue;
      next[key] = value;
      changed += 1;
      report.fields.set(key, (report.fields.get(key) ?? 0) + 1);
    }

    if (changed === 0) {
      report.unchanged += 1;
      return;
    }
    if (!opts.dry) {
      await fs.writeFile(file, stringifyFrontmatter(next, body), 'utf8');
    }
    report.enriched += 1;
    console.log(
      `[enrich] ${opts.dry ? 'would update' : 'updated'} ${slug}: ${Object.keys(patch).join(', ')}`,
    );
  } catch (error) {
    report.errors.push(`${slug}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main(): Promise<void> {
  loadEnv();
  const args = process.argv.slice(2);
  const dirArg = args.find((arg) => arg.startsWith('--dir='));
  const dir = dirArg ? dirArg.slice('--dir='.length) : DEFAULT_DIR;
  const dry = args.includes('--dry');
  const force = args.includes('--force');
  const report: RunReport = {
    enriched: 0,
    unchanged: 0,
    skipped: 0,
    errors: [],
    fields: new Map(),
  };

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(dir, entry.name))
    .sort();

  console.log(`[enrich] ${files.length} seed(s) in ${dir}${dry ? ' (dry run)' : ''}`);
  for (const file of files) await enrichFile(file, { dry, force }, report);

  console.log(
    `[enrich] done: ${report.enriched} updated, ${report.unchanged} unchanged, ` +
      `${report.skipped} skipped, ${report.errors.length} error(s)`,
  );
  for (const [field, count] of [...report.fields.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`[enrich] ${field}: ${count}`);
  }
  for (const error of report.errors) console.error(`[enrich] ERROR ${error}`);
  if (report.errors.length > 0) process.exitCode = 1;
}

if ((process.argv[1] ?? '').endsWith('enrich-tmdb.ts')) {
  main().catch((error) => {
    console.error('[enrich] FAILED:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
