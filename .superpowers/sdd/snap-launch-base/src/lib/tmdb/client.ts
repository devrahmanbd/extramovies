import type {
  Credits,
  Genre,
  MovieMeta,
  PersonCredit,
  RegionCode,
  TmdbCredits,
  TmdbFindResult,
  TmdbMovieDetails,
} from "./types";
import { DEFAULT_REGION, safeMovieDefaults } from "./types";

const TMDB_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p";

import { effectiveWithoutDb } from '../settings';

/** Override (dashboard value) for tests / settings-injected callers. */
let tmdbKeyOverride: string | null = null;

/** Dashboard sets this after loading settings; takes precedence over env. */
export function setTmdbKeyOverride(key: string | null): void {
  tmdbKeyOverride = key && key.trim() ? key.trim() : null;
}

function apiKey(): string {
  if (tmdbKeyOverride) return tmdbKeyOverride;
  // Effective resolution (DB -> env -> '') lives in src/lib/settings.ts;
  // without DB in this module we resolve env -> default here.
  const key = effectiveWithoutDb('tmdb.api_key');
  if (!key) throw new Error("TMDB key is not configured — set it at /admin/settings → APIs (server-side only).");
  return key;
}

export function imageUrl(
  path: string | null | undefined,
  size: "w342" | "w500" | "w780" | "w1280" | "original" = "w500"
): string | null {
  if (!path) return null;
  return `${IMAGE_BASE}/${size}${path}`;
}

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", apiKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`TMDB ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export function mapCredits(raw: TmdbCredits): Credits {
  const directors: PersonCredit[] = (raw.crew ?? [])
    .filter((c) => c.job === "Director")
    .map((c) => ({
      id: c.id,
      name: c.name,
      job: "Director",
      profileUrl: imageUrl(c.profile_path, "w342"),
    }));
  const topCast: PersonCredit[] = [...(raw.cast ?? [])]
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, 10)
    .map((c) => ({
      id: c.id,
      name: c.name,
      character: c.character,
      profileUrl: imageUrl(c.profile_path, "w342"),
    }));
  return { directors, topCast };
}

export function mapDetailsToMeta(
  details: TmdbMovieDetails,
  credits: Credits,
  region: RegionCode
): MovieMeta {
  const releaseDate = details.release_date || null;
  const year = releaseDate ? Number(releaseDate.slice(0, 4)) : null;
  return {
    tmdbId: details.id,
    imdbId: details.imdb_id ?? null,
    title: details.title || "Untitled",
    originalTitle: details.original_title || details.title || "Untitled",
    overview: details.overview ?? "",
    tagline: details.tagline ?? null,
    releaseDate,
    year: Number.isFinite(year) ? (year as number) : null,
    runtimeMinutes: details.runtime ?? null,
    genres: (details.genres ?? []) as Genre[],
    posterUrl: imageUrl(details.poster_path, "w500"),
    backdropUrl: imageUrl(details.backdrop_path, "w780"),
    voteAverage: details.vote_average ?? null,
    voteCount: details.vote_count ?? null,
    popularity: details.popularity ?? null,
    credits,
    omdb: null, // enriched later by omdb.ts when IMDb ID present
    manualEntry: false,
    fetchedAt: new Date().toISOString(),
    region: region.toUpperCase(),
  };
}

/** Full detail fetch: details + credits, mapped to MovieMeta. Throws on TMDB failure. */
export async function getMovieMeta(
  tmdbId: number,
  region: RegionCode = DEFAULT_REGION
): Promise<MovieMeta> {
  const r = region.toUpperCase();
  const [details, creditsRaw] = await Promise.all([
    tmdbFetch<TmdbMovieDetails>(`/movie/${tmdbId}`, { language: "en-US" }),
    tmdbFetch<TmdbCredits>(`/movie/${tmdbId}/credits`, { language: "en-US" }),
  ]);
  return mapDetailsToMeta(details, mapCredits(creditsRaw), r);
}

/** Safe wrapper: returns safe defaults instead of throwing on malformed API. */
export async function getMovieMetaSafe(
  tmdbId: number,
  region: RegionCode = DEFAULT_REGION
): Promise<{ movie: MovieMeta; ok: boolean; error?: string }> {
  try {
    const movie = await getMovieMeta(tmdbId, region);
    return { movie, ok: true };
  } catch (err) {
    return {
      movie: safeMovieDefaults(tmdbId, region),
      ok: false,
      error: err instanceof Error ? err.message : "TMDB request failed",
    };
  }
}

/** Resolve TMDB movie ID from an IMDb ID via /find endpoint. Returns null if not found. */
export async function findTmdbIdByImdbId(imdbId: string): Promise<number | null> {
  const clean = imdbId.trim();
  if (!/^tt\d+$/.test(clean)) return null;
  try {
    const res = await tmdbFetch<TmdbFindResult>(`/find/${clean}`, {
      external_source: "imdb_id",
    });
    const first = res.movie_results?.[0];
    return first ? first.id : null;
  } catch {
    return null; // fail-soft: caller falls back to manual entry shape
  }
}

/** Search by title (first page). Returns raw details list for disambiguation. */
export async function searchMoviesByTitle(
  title: string,
  page = 1
): Promise<TmdbMovieDetails[]> {
  const q = title.trim();
  if (!q) return [];
  try {
    const res = await tmdbFetch<{ results?: TmdbMovieDetails[] }>(
      "/search/movie",
      { query: q, page: String(page), include_adult: "false", language: "en-US" }
    );
    return res.results ?? [];
  } catch {
    return [];
  }
}
