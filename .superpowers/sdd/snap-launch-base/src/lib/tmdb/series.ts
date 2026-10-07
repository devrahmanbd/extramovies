/**
 * TV series TMDB layer — server-only, fail-soft, never throws on malformed API.
 *
 * HONEST LIMITS: importing ALL of TMDB (millions of titles) via the public API
 * is infeasible (~40 req/10s, paginated discover caps, ToS). This module
 * supports CURATED bulk import only (trending/popular/top-rated + genre
 * discover) via scripts/import-tmdb.ts with rate-limiting + resume.
 *
 * Endpoints used:
 *   - GET /tv/{id}                   (details incl. season/episode counts)
 *   - GET /tv/{id}/credits           (cast; creators come from details.created_by)
 *   - GET /tv/{id}/watch/providers   (streaming availability, fail-soft)
 *
 * Mirrors src/lib/tmdb/client.ts getMovieMetaSafe shape:
 *   getTvMetaSafe -> { show, ok, error? }
 * Uses TMDB_API_KEY via effectiveWithoutDb('tmdb.api_key') like client.ts.
 */
import { effectiveWithoutDb } from "../settings.js";
import { imageUrl } from "./client.js";
import type {
  Credits,
  Genre,
  PersonCredit,
  RegionCode,
  TmdbCredits,
  TmdbWatchProviders,
} from "./types.js";
import { DEFAULT_REGION } from "./types.js";

const TMDB_BASE = "https://api.themoviedb.org/3";

/** Override (dashboard value) for tests / settings-injected callers. */
let tvKeyOverride: string | null = null;

/** Dashboard sets this after loading settings; takes precedence over env. */
export function setTvKeyOverride(key: string | null): void {
  tvKeyOverride = key && key.trim() ? key.trim() : null;
}

function apiKey(): string {
  if (tvKeyOverride) return tvKeyOverride;
  const key = effectiveWithoutDb("tmdb.api_key");
  if (!key)
    throw new Error(
      "TMDB key is not configured — set it at /admin/settings → APIs (server-side only)."
    );
  return key;
}

async function tmdbFetch<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", apiKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`TMDB ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Raw + domain types
// ---------------------------------------------------------------------------

/** Minimal raw /tv/{id} shape (only fields we use). */
export interface TmdbTvDetails {
  id?: unknown;
  name?: unknown;
  original_name?: unknown;
  overview?: unknown;
  tagline?: unknown;
  first_air_date?: unknown;
  episode_run_time?: unknown;
  number_of_seasons?: unknown;
  number_of_episodes?: unknown;
  status?: unknown;
  genres?: unknown;
  poster_path?: unknown;
  backdrop_path?: unknown;
  vote_average?: unknown;
  vote_count?: unknown;
  popularity?: unknown;
  created_by?: unknown;
}

export interface ShowCredits {
  /** TV creators (from details.created_by) — mirrors movies' directors. */
  creators: PersonCredit[];
  /** Top-billed cast, capped at 10 (from /tv/{id}/credits). */
  topCast: PersonCredit[];
}

export interface ShowMeta {
  tmdbId: number;
  imdbId: string | null;
  title: string;
  originalTitle: string;
  overview: string;
  tagline: string | null;
  firstAirDate: string | null;
  year: number | null;
  /** Episode runtime average (mean of episode_run_time[]), nullable. */
  runtimeMinutes: number | null;
  seasons: number | null;
  episodes: number | null;
  status: string | null;
  genres: Genre[];
  posterUrl: string | null;
  backdropUrl: string | null;
  voteAverage: number | null;
  voteCount: number | null;
  popularity: number | null;
  credits: ShowCredits;
  omdb: null;
  manualEntry: boolean;
  fetchedAt: string;
  region: RegionCode;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested, never throw)
// ---------------------------------------------------------------------------

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function asIntOrNull(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.trunc(v);
  return Number.isSafeInteger(n) ? n : null;
}

function asFloatOrNull(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

/**
 * Mean of TMDB episode_run_time[] (e.g. [45, 50] -> 48).
 * Pure, never throws. Returns null for missing/empty/invalid input.
 */
export function averageRuntime(input: unknown): number | null {
  try {
    if (typeof input === "number") {
      return Number.isFinite(input) && input > 0 ? Math.round(input) : null;
    }
    if (!Array.isArray(input) || input.length === 0) return null;
    const nums = (input as unknown[]).filter(
      (n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0
    );
    if (nums.length === 0) return null;
    const sum = nums.reduce((a, b) => a + b, 0);
    return Math.round(sum / nums.length);
  } catch {
    return null;
  }
}

function asGenres(v: unknown): Genre[] {
  try {
    if (!Array.isArray(v)) return [];
    const out: Genre[] = [];
    for (const g of v as Array<Record<string, unknown>>) {
      if (
        g &&
        typeof g === "object" &&
        typeof (g as { id?: unknown }).id === "number" &&
        Number.isFinite((g as { id: number }).id) &&
        typeof (g as { name?: unknown }).name === "string"
      ) {
        out.push({
          id: (g as { id: number }).id,
          name: (g as { name: string }).name,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function asCreators(v: unknown): PersonCredit[] {
  try {
    if (!Array.isArray(v)) return [];
    const out: PersonCredit[] = [];
    for (const c of v as Array<Record<string, unknown>>) {
      if (!c || typeof c !== "object") continue;
      const rec = c as { id?: unknown; name?: unknown; profile_path?: unknown };
      if (typeof rec.name !== "string" || !rec.name.trim()) continue;
      out.push({
        id: typeof rec.id === "number" && Number.isFinite(rec.id) ? rec.id : -1,
        name: rec.name.trim(),
        job: "Creator",
        profileUrl:
          typeof rec.profile_path === "string" && rec.profile_path
            ? imageUrl(rec.profile_path, "w342")
            : null,
      });
    }
    return out.slice(0, 10);
  } catch {
    return [];
  }
}

function asTopCast(raw: unknown): PersonCredit[] {
  try {
    const rec = raw as { cast?: unknown } | null | undefined;
    const list = rec?.cast;
    if (!Array.isArray(list)) return [];
    const sorted = [...(list as Array<Record<string, unknown>>)]
      .filter((c) => c && typeof c === "object")
      .sort((a, b) => {
        const ao =
          typeof (a as { order?: unknown }).order === "number"
            ? ((a as { order: number }).order as number)
            : 999;
        const bo =
          typeof (b as { order?: unknown }).order === "number"
            ? ((b as { order: number }).order as number)
            : 999;
        return ao - bo;
      })
      .slice(0, 10);
    const out: PersonCredit[] = [];
    for (const c of sorted) {
      const name = (c as { name?: unknown }).name;
      if (typeof name !== "string" || !name.trim()) continue;
      const id = (c as { id?: unknown }).id;
      const character = (c as { character?: unknown }).character;
      const profile = (c as { profile_path?: unknown }).profile_path;
      out.push({
        id: typeof id === "number" && Number.isFinite(id) ? id : -1,
        name: name.trim(),
        character: typeof character === "string" ? character : undefined,
        profileUrl:
          typeof profile === "string" && profile
            ? imageUrl(profile, "w342")
            : null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Fail-soft defaults — never throws. */
export function safeShowDefaults(
  tmdbId: number,
  region: RegionCode = DEFAULT_REGION
): ShowMeta {
  const safeId =
    typeof tmdbId === "number" && Number.isFinite(tmdbId)
      ? Math.trunc(tmdbId)
      : -1;
  let r = "US";
  try {
    r = (region ?? "US").toString().toUpperCase();
    if (!/^[A-Z]{2}$/.test(r)) r = "US";
  } catch {
    r = "US";
  }
  return {
    tmdbId: safeId,
    imdbId: null,
    title: "Untitled",
    originalTitle: "Untitled",
    overview: "",
    tagline: null,
    firstAirDate: null,
    year: null,
    runtimeMinutes: null,
    seasons: null,
    episodes: null,
    status: null,
    genres: [],
    posterUrl: null,
    backdropUrl: null,
    voteAverage: null,
    voteCount: null,
    popularity: null,
    credits: { creators: [], topCast: [] },
    omdb: null,
    manualEntry: false,
    fetchedAt: new Date().toISOString(),
    region: r,
  };
}

/**
 * Map raw /tv/{id} details + /tv/{id}/credits to ShowMeta.
 * Pure + fail-soft: NEVER throws on malformed API (returns safe defaults
 * merged with whatever fields survive validation).
 */
export function mapTvDetails(
  details: unknown,
  creditsRaw: unknown,
  region: RegionCode = DEFAULT_REGION
): ShowMeta {
  try {
    const d =
      details && typeof details === "object"
        ? (details as TmdbTvDetails)
        : ({} as TmdbTvDetails);
    const rawId =
      typeof d.id === "number" && Number.isFinite(d.id)
        ? Math.trunc(d.id)
        : -1;
    const fallback = safeShowDefaults(rawId, region);

    const title =
      asNonEmptyString(d.name) ?? fallback.title;
    const originalTitle =
      asNonEmptyString(d.original_name) ?? title;
    const firstAirDate =
      typeof d.first_air_date === "string" && d.first_air_date.trim()
        ? d.first_air_date.trim()
        : null;
    let year: number | null = null;
    if (firstAirDate && /^\d{4}/.test(firstAirDate)) {
      const y = Number(firstAirDate.slice(0, 4));
      year = Number.isFinite(y) ? y : null;
    }

    return {
      tmdbId: rawId,
      // /tv/{id} details do not include imdb_id (unlike /movie/{id});
      // external_ids lookup is out of scope for curated import — keep null.
      imdbId: null,
      title,
      originalTitle,
      overview:
        typeof d.overview === "string" ? d.overview : fallback.overview,
      tagline: asNonEmptyString(d.tagline),
      firstAirDate,
      year,
      runtimeMinutes: averageRuntime(d.episode_run_time),
      seasons: asIntOrNull(d.number_of_seasons),
      episodes: asIntOrNull(d.number_of_episodes),
      status: asNonEmptyString(d.status),
      genres: asGenres(d.genres),
      posterUrl:
        typeof d.poster_path === "string" && d.poster_path
          ? imageUrl(d.poster_path, "w500")
          : null,
      backdropUrl:
        typeof d.backdrop_path === "string" && d.backdrop_path
          ? imageUrl(d.backdrop_path, "w780")
          : null,
      voteAverage: asFloatOrNull(d.vote_average),
      voteCount: asIntOrNull(d.vote_count),
      popularity: asFloatOrNull(d.popularity),
      credits: {
        creators: asCreators(d.created_by),
        topCast: asTopCast(creditsRaw),
      },
      omdb: null,
      manualEntry: false,
      fetchedAt: new Date().toISOString(),
      region: fallback.region,
    };
  } catch {
    try {
      return safeShowDefaults(-1, region);
    } catch {
      return safeShowDefaults(-1, "US");
    }
  }
}

/** Compat: map credits-only (cast) the same way movies do. Pure, never throws. */
export function mapTvCredits(raw: unknown): Credits {
  try {
    return { directors: [], topCast: asTopCast(raw) };
  } catch {
    return { directors: [], topCast: [] };
  }
}

// ---------------------------------------------------------------------------
// Live fetchers (network throws; Safe wrappers fail soft)
// ---------------------------------------------------------------------------

/** Full TV detail fetch: details + credits, mapped to ShowMeta. Throws on TMDB failure. */
export async function getTvMeta(
  tmdbId: number,
  region: RegionCode = DEFAULT_REGION
): Promise<ShowMeta> {
  const r = (region ?? "US").toString().toUpperCase();
  const [details, creditsRaw] = await Promise.all([
    tmdbFetch<TmdbTvDetails>(`/tv/${tmdbId}`, { language: "en-US" }),
    tmdbFetch<TmdbCredits>(`/tv/${tmdbId}/credits`, { language: "en-US" }),
  ]);
  // mapTvDetails never throws on malformed payloads (defaults instead).
  return mapTvDetails(details, creditsRaw, r);
}

/** Safe wrapper: returns safe defaults instead of throwing. NEVER throws. */
export async function getTvMetaSafe(
  tmdbId: number,
  region: RegionCode = DEFAULT_REGION
): Promise<{ show: ShowMeta; ok: boolean; error?: string }> {
  try {
    const show = await getTvMeta(tmdbId, region);
    return { show, ok: true };
  } catch (err) {
    try {
      return {
        show: safeShowDefaults(tmdbId, region),
        ok: false,
        error: err instanceof Error ? err.message : "TMDB request failed",
      };
    } catch {
      return {
        show: safeShowDefaults(-1, "US"),
        ok: false,
        error: "TMDB request failed",
      };
    }
  }
}

/**
 * Raw /tv/{id}/watch/providers fetch, fail-soft (null on any failure).
 * Callers normalize via src/lib/streaming.ts normalizeWatchProviders
 * (same shape as movies) and persist into streaming_availability with
 * movie_id = `tmdb:{id}` (documented series reuse — table NOT altered).
 */
export async function getTvProvidersRaw(
  tmdbId: number
): Promise<TmdbWatchProviders | null> {
  try {
    if (!Number.isSafeInteger(tmdbId)) return null;
    const raw = await tmdbFetch<TmdbWatchProviders>(
      `/tv/${tmdbId}/watch/providers`
    );
    if (!raw || typeof raw !== "object") return null;
    return raw as TmdbWatchProviders;
  } catch {
    return null;
  }
}
