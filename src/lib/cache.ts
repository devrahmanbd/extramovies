/**
 * Cache strategy for movie data layer.
 *
 * NOTE (coordination with foundation agent): the current Drizzle schema
 * (`src/lib/db/schema.ts`, foundation-owned) models:
 *   - movies: keyed by text `id`, no full-meta JSONB, no fetched_at
 *     (has createdAt only)
 *   - streaming_availability: one row per (movieId, region, provider),
 *     with updatedAt (serves as fetched_at)
 *   - research_sources: provenance log with fetchedAt + kind
 *     ('tmdb' | 'omdb' | 'openrouter' | 'manual')
 *
 * This module therefore:
 *   1. keeps full MovieMeta / ProvidersNormalized in a process-level
 *      MemoryMovieCache (never refetch on every page view);
 *   2. persists what fits the real schema via row mappers
 *      (movieToDbRow / providersToDbRows / provenanceRow) executed through
 *      the driver-agnostic `execute` port (works on D1 + better-sqlite3);
 *   3. proposes (not imposes) additive columns for full-meta round-tripping —
 *      see PROPOSED_META_CACHE_DDL. Foundation agent decides.
 *
 * Policy:
 *   - MOVIE_TTL_MS     default 30 days (metadata is stable)
 *   - STREAMING_TTL_MS default 7 days  (availability churns)
 *   - Stale-while-revalidate: serve stale cache on upstream failure.
 */
import type { MovieMeta, ProvidersNormalized, RegionCode } from "./tmdb/types";
import { DEFAULT_REGION } from "./tmdb/types";

export const MOVIE_TTL_MS =
  Number(process.env.MOVIE_TTL_DAYS ?? 30) * 24 * 60 * 60 * 1000;
export const STREAMING_TTL_MS =
  Number(process.env.STREAMING_TTL_DAYS ?? 7) * 24 * 60 * 60 * 1000;

export interface CacheRecord<T> {
  value: T;
  fetchedAt: string; // ISO
}

export function isFresh(fetchedAt: string, ttlMs: number, now = Date.now()): boolean {
  const t = Date.parse(fetchedAt);
  if (Number.isNaN(t)) return false;
  return now - t < ttlMs;
}

export interface MovieCacheStore {
  getMovie(tmdbId: number, region: RegionCode): Promise<CacheRecord<MovieMeta> | null>;
  setMovie(movie: MovieMeta): Promise<void>;
  getProviders(
    tmdbId: number,
    region: RegionCode
  ): Promise<CacheRecord<ProvidersNormalized> | null>;
  setProviders(p: ProvidersNormalized): Promise<void>;
}

function keyMovie(tmdbId: number, region: string): string {
  return `movie:${tmdbId}:${region.toUpperCase()}`;
}
function keyProviders(tmdbId: number, region: string): string {
  return `providers:${tmdbId}:${region.toUpperCase()}`;
}

/** In-memory store: default for dev/test and fallback when DB is unreachable. */
export class MemoryMovieCache implements MovieCacheStore {
  private movies = new Map<string, CacheRecord<MovieMeta>>();
  private providers = new Map<string, CacheRecord<ProvidersNormalized>>();

  async getMovie(tmdbId: number, region: RegionCode) {
    return this.movies.get(keyMovie(tmdbId, region)) ?? null;
  }
  async setMovie(movie: MovieMeta) {
    this.movies.set(keyMovie(movie.tmdbId, movie.region), {
      value: movie,
      fetchedAt: movie.fetchedAt,
    });
  }
  async getProviders(tmdbId: number, region: RegionCode) {
    return this.providers.get(keyProviders(tmdbId, region)) ?? null;
  }
  async setProviders(p: ProvidersNormalized) {
    this.providers.set(keyProviders(p.tmdbId, p.region), {
      value: p,
      fetchedAt: p.fetchedAt,
    });
  }
  clear() {
    this.movies.clear();
    this.providers.clear();
  }
}

/** Shared process-level cache. Replace via setCacheStore in prod wiring. */
let activeStore: MovieCacheStore = new MemoryMovieCache();

export function getCacheStore(): MovieCacheStore {
  return activeStore;
}
export function setCacheStore(store: MovieCacheStore): void {
  activeStore = store;
}

export function resolveRegion(input?: string | null): RegionCode {
  const r = (input ?? process.env.DEFAULT_REGION ?? DEFAULT_REGION)
    .toString()
    .trim()
    .toUpperCase();
  return /^[A-Z]{2}$/.test(r) ? r : DEFAULT_REGION;
}

// ---------- DB row mappers (match foundation schema, no schema import) ----------

/** Canonical movie-row id used by this layer (stable across regions). */
export function dbMovieId(tmdbId: number): string {
  return `tmdb:${tmdbId}`;
}

export interface DbMovieRow {
  id: string;
  tmdb_id: number;
  title: string;
  slug: string;
  year: number | null;
  directors: string; // JSON array
  poster: string | null;
  synopsis: string | null;
  runtime_min: number | null;
  genres: string; // JSON array
}

export function slugifyTitle(title: string, tmdbId: number): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
  return `${slug || "movie"}-${tmdbId}`;
}

/** Map full MovieMeta onto the foundation `movies` table row. */
export function movieToDbRow(movie: MovieMeta): DbMovieRow {
  return {
    id: dbMovieId(movie.tmdbId),
    tmdb_id: movie.tmdbId,
    title: movie.title,
    slug: slugifyTitle(movie.title, movie.tmdbId),
    year: movie.year,
    directors: JSON.stringify(movie.credits.directors.map((d) => d.name)),
    poster: movie.posterUrl,
    synopsis: movie.overview || null,
    runtime_min: movie.runtimeMinutes,
    genres: JSON.stringify(movie.genres.map((g) => g.name)),
  };
}

export type ProviderQuality = "streaming" | "rent" | "buy" | "free";

export interface DbAvailabilityRow {
  movie_id: string;
  region: string;
  provider: string;
  url: string | null;
  quality: ProviderQuality;
}

/** Map normalized providers onto `streaming_availability` rows (one per provider). */
export function providersToDbRows(p: ProvidersNormalized): DbAvailabilityRow[] {
  const movieId = dbMovieId(p.tmdbId);
  const rows: DbAvailabilityRow[] = [];
  const push = (quality: ProviderQuality, names: { providerName: string }[]) => {
    for (const e of names) {
      rows.push({
        movie_id: movieId,
        region: p.region,
        provider: e.providerName,
        url: p.link,
        quality,
      });
    }
  };
  push("streaming", p.streaming);
  push("rent", p.rent);
  push("buy", p.buy);
  push("free", p.free);
  return rows;
}

export interface DbProvenanceRow {
  id: string;
  movie_id: string;
  kind: "tmdb" | "omdb" | "openrouter" | "manual";
  snippet: string | null;
}

/** Provenance log entry for `research_sources` (carries fetched_at). */
export function provenanceRow(
  tmdbId: number,
  kind: DbProvenanceRow["kind"],
  fetchedAt: string,
  snippet?: string
): DbProvenanceRow {
  return {
    id: `${kind}:${tmdbId}:${Date.parse(fetchedAt) || Date.now()}`,
    movie_id: dbMovieId(tmdbId),
    kind,
    snippet: snippet ?? null,
  };
}

// ---------- Proposal for foundation agent (additive, non-breaking) ----------
/**
 * PROPOSED_META_CACHE_DDL — optional, foundation-owned decision.
 * If the CMS needs full MovieMeta round-tripping from DB (credits, ratings,
 * images, OMDb enrichment) plus fetched_at on movies, the smallest additive
 * change is a sidecar table keyed like streaming_availability:
 *
 *   CREATE TABLE IF NOT EXISTS movie_meta_cache (
 *     tmdb_id INTEGER NOT NULL,
 *     region TEXT NOT NULL DEFAULT 'US',
 *     payload TEXT NOT NULL,          -- JSON-encoded MovieMeta
 *     fetched_at TEXT NOT NULL,       -- ISO timestamp
 *     PRIMARY KEY (tmdb_id, region)
 *   );
 *
 * Until then, full meta lives in MemoryMovieCache; movies /
 * streaming_availability / research_sources carry the durable subset.
 */
export const PROPOSED_META_CACHE_DDL = `
CREATE TABLE IF NOT EXISTS movie_meta_cache (
  tmdb_id INTEGER NOT NULL,
  region TEXT NOT NULL DEFAULT '${DEFAULT_REGION}',
  payload TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (tmdb_id, region)
);`.trim();
