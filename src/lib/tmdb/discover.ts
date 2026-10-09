/**
 * Theme 1 "discovery" data layer — streaming-guide movie discovery.
 *
 * Server-only. Every TMDB fetch is cached in-memory (1h) and fail-soft:
 * failures resolve to [] so pages render honest empty states instead of 500s.
 * No invented data: tiles carry only TMDB fields (poster/title/year/rating).
 *
 * Theme contract: `src/lib/theme.ts` owns resolution
 * (`getTheme(read, env)` / `resolveTheme(db, env)`); this module delegates
 * to it with a DB-backed reader and falls back to the local `activeTheme()`
 * env reader. Never throws (publication fallback) so pages never crash.
 */
import { getTheme } from "../theme";
import { getDb, getSetting } from "../db/adapter";
import { effectiveWithoutDb } from "../settings";
import { imageUrl } from "./client";
import type {
  Genre,
  ProvidersNormalized,
  RegionCode,
  TmdbMovieDetails,
} from "./types";
import { DEFAULT_REGION } from "./types";
import type { PublicReview, WatchProviders } from "../seo/content";

const TMDB_BASE = "https://api.themoviedb.org/3";

/** In-memory cache TTL: 1h, per the theme contract. */
export const DISCOVER_CACHE_TTL_MS = 3_600_000;

export type SiteTheme = "discovery" | "publication";

// ---------------------------------------------------------------------------
// Theme resolution
// ---------------------------------------------------------------------------

/** Local env-only reader. Install-level switch, never brand-level. */
export function activeTheme(
  env?: Record<string, string | undefined>
): SiteTheme {
  let raw = env?.SITE_THEME;
  if (!raw) {
    try {
      // @ts-expect-error — import.meta available in Astro/Vite runtime
      const viteVal = typeof import.meta !== "undefined" ? import.meta.env?.SITE_THEME : undefined;
      if (typeof viteVal === "string" && viteVal) raw = viteVal;
    } catch {
      /* non-Vite runtime */
    }
  }
  if (!raw && typeof process !== "undefined") raw = process.env.SITE_THEME;
  return String(raw ?? "").trim().toLowerCase() === "discovery"
    ? "discovery"
    : "publication";
}

/**
 * Resolve the active theme via the shared core (`src/lib/theme.ts`) with a
 * DB-backed reader, falling back to the `activeTheme()` env read.
 * Never throws (publication fallback) so pages never crash on theme plumbing.
 */
export async function currentTheme(): Promise<SiteTheme> {
  try {
    const db = getDb({});
    const read = (k: string) => getSetting(db, k).catch(() => null);
    const runtimeEnv =
      typeof process !== "undefined" ? process.env : undefined;
    const t = await getTheme(read, runtimeEnv);
    if (t === "discovery" || t === "publication") return t;
  } catch {
    /* DB unavailable (build/edge) — fall through to env */
  }
  try {
    return activeTheme();
  } catch {
    return "publication";
  }
}

// ---------------------------------------------------------------------------
// Tiles (pure mapping — TMDB fields only, never invented)
// ---------------------------------------------------------------------------

export interface DiscoverTile {
  tmdbId: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
  rating: number | null;
  /** w1280 backdrop for hero slides; null when TMDB has none. */
  backdropUrl: string | null;
  /** Short overview for hero slides; null when TMDB has none. */
  overview: string | null;
}

export function mapToTile(raw: TmdbMovieDetails): DiscoverTile {
  const releaseDate =
    typeof raw.release_date === "string" ? raw.release_date : null;
  const year =
    releaseDate && /^\d{4}/.test(releaseDate)
      ? Number(releaseDate.slice(0, 4))
      : null;
  return {
    tmdbId: raw.id,
    title:
      typeof raw.title === "string" && raw.title.trim()
        ? raw.title
        : "Untitled",
    year: Number.isFinite(year) ? (year as number) : null,
    posterUrl: imageUrl(raw.poster_path ?? null, "w342"),
    rating:
      typeof raw.vote_average === "number" && Number.isFinite(raw.vote_average)
        ? raw.vote_average
        : null,
    backdropUrl: imageUrl(
      typeof raw.backdrop_path === "string" ? raw.backdrop_path : null,
      "w1280"
    ),
    overview:
      typeof raw.overview === "string" && raw.overview.trim()
        ? raw.overview.trim().slice(0, 180)
        : null,
  };
}

// ---------------------------------------------------------------------------
// Filters (pure parsing — unit-tested)
// ---------------------------------------------------------------------------

export type WatchFilter = "stream" | "free" | "rent" | "buy";

/** Server-side list views for "See all" targets. Plain-language titles only. */
export type DiscoverList =
  | "trending"
  | "popular"
  | "top_rated"
  | "now_playing"
  | "upcoming"
  | "free"
  | "stream"
  | "rent"
  | "buy";

export type DiscoverMonetization = "free" | "stream" | "rent" | "buy";

type ParamsLike = URLSearchParams | Record<string, string | string[] | undefined>;

const LIST_VALUES: ReadonlySet<string> = new Set([
  "trending",
  "popular",
  "top_rated",
  "now_playing",
  "upcoming",
  "free",
  "stream",
  "rent",
  "buy",
]);

/** Plain-language titles for list views (no technical labels). Pure. */
export const LIST_TITLES: Record<DiscoverList, string> = {
  trending: "Trending now",
  popular: "Popular movies",
  top_rated: "Top rated",
  now_playing: "New in cinemas",
  upcoming: "Coming soon",
  free: "Watch free",
  stream: "Available to stream",
  rent: "New to rent",
  buy: "New to buy",
};

/** One-line descriptions for list views. Pure. */
export const LIST_BLURBS: Record<DiscoverList, string> = {
  trending: "What everyone is watching this week.",
  popular: "The most-watched films right now.",
  top_rated: "The best-reviewed films on TMDB.",
  now_playing: "Fresh in cinemas and new to streaming.",
  upcoming: "On the way soon — no providers implied.",
  free: "Free to watch, no subscription needed.",
  stream: "Included with streaming subscriptions.",
  rent: "New to rent tonight.",
  buy: "New to own.",
};

/** Canonical href for a list view. Pure. */
export function buildListHref(list: DiscoverList): string {
  return `/movies?list=${list}`;
}

/** Parse a `list=` param. Pure — null on missing/unknown. */
export function parseDiscoverList(params: ParamsLike): DiscoverList | null {
  const raw = getParam(params, "list").toLowerCase();
  return LIST_VALUES.has(raw) ? (raw as DiscoverList) : null;
}

export interface DiscoverFilters {
  q: string;
  genre: string;
  year: number | null;
  watch: WatchFilter | null;
  list: DiscoverList | null;
  /** True when any filter param is present (drives robots noindex). */
  hasFilters: boolean;
}

const WATCH_VALUES: ReadonlySet<string> = new Set([
  "stream",
  "free",
  "rent",
  "buy",
]);

function getParam(params: ParamsLike, key: string): string {
  if (typeof (params as URLSearchParams).get === "function") {
    return ((params as URLSearchParams).get(key) ?? "").trim();
  }
  const v = (params as Record<string, string | string[] | undefined>)[key];
  const first = Array.isArray(v) ? v[0] : v;
  return (first ?? "").trim();
}

/** Parse /movies query params. Pure — never touches network or DB. */
export function parseDiscoverFilters(params: ParamsLike): DiscoverFilters {
  const q = getParam(params, "q").slice(0, 120);
  const genre = getParam(params, "genre").slice(0, 60);
  const yearRaw = getParam(params, "year");
  const watchRaw = getParam(params, "watch").toLowerCase();
  const listRaw = getParam(params, "list").toLowerCase();
  let year: number | null = null;
  if (/^\d{4}$/.test(yearRaw)) {
    const y = Number(yearRaw);
    const maxYear = new Date().getFullYear() + 2;
    if (y >= 1888 && y <= maxYear) year = y;
  }
  const watch = WATCH_VALUES.has(watchRaw) ? (watchRaw as WatchFilter) : null;
  const list = LIST_VALUES.has(listRaw) ? (listRaw as DiscoverList) : null;
  const hasFilters =
    q !== "" || genre !== "" || year !== null || watch !== null || list !== null;
  return { q, genre, year, watch, list, hasFilters };
}

/** Canonical /movies href carrying only non-empty filter params. Pure. */
export function buildMoviesHref(
  f: Partial<Pick<DiscoverFilters, "q" | "genre" | "year" | "watch" | "list">>
): string {
  const sp = new URLSearchParams();
  if (f.q && f.q.trim()) sp.set("q", f.q.trim());
  if (f.genre && f.genre.trim()) sp.set("genre", f.genre.trim());
  if (typeof f.year === "number" && Number.isFinite(f.year))
    sp.set("year", String(f.year));
  if (f.watch && WATCH_VALUES.has(f.watch)) sp.set("watch", f.watch);
  if (f.list && LIST_VALUES.has(f.list)) sp.set("list", f.list);
  const qs = sp.toString();
  return qs ? `/movies?${qs}` : "/movies";
}

/** Resolve a genre param (TMDB id or name) against the cached genre list. Pure. */
export function resolveGenreId(
  genres: Genre[],
  param: string
): number | null {
  const needle = param.trim();
  if (!needle) return null;
  if (/^\d+$/.test(needle)) {
    const id = Number(needle);
    return genres.some((g) => g.id === id) ? id : Number.isSafeInteger(id) ? id : null;
  }
  const lower = needle.toLowerCase();
  return genres.find((g) => g.name.toLowerCase() === lower)?.id ?? null;
}

/** Static curated collections — links only, no data claims. */
export interface DiscoverCollection {
  label: string;
  blurb: string;
  href: string;
}

export const COLLECTIONS: DiscoverCollection[] = [
  { label: "Sci-fi nights", blurb: "Other worlds, big ideas", href: "/movies?genre=878" },
  { label: "Laugh out loud", blurb: "Comedies for low-energy evenings", href: "/movies?genre=35" },
  { label: "Crime & thrillers", blurb: "Tension, done right", href: "/movies?genre=53" },
  { label: "Dramas we rate highly", blurb: "Slow cinema welcome", href: "/movies?genre=18" },
  { label: "Free to stream", blurb: "No subscription needed", href: "/movies?watch=free" },
  { label: "New releases", blurb: "Fresh from this year", href: `/movies?year=${new Date().getFullYear()}` },
];

/** Find the published review linked to a TMDB id (PublicReview.tmdbId). Pure. */
export function findReviewForTmdbId(
  reviews: PublicReview[],
  tmdbId: number
): PublicReview | null {
  if (!Number.isSafeInteger(tmdbId)) return null;
  return reviews.find((r) => r.tmdbId === tmdbId) ?? null;
}

/** Adapt streaming-layer providers to the WhereToWatch content shape. Pure. */
export function toContentProviders(p: ProvidersNormalized): WatchProviders {
  const slim = (list: ProvidersNormalized["streaming"]) =>
    list.map((e) => ({ name: e.providerName, logoUrl: e.logoUrl }));
  return {
    streaming: slim(p.streaming),
    rent: slim(p.rent),
    buy: slim(p.buy),
    free: slim(p.free),
    fetchedAt: p.fetchedAt,
    hideSection: p.hideSection,
    link: p.link,
  };
}

// ---------------------------------------------------------------------------
// TMDB access (cached, fail-soft)
// ---------------------------------------------------------------------------

export function hasTmdbKey(): boolean {
  try {
    return effectiveWithoutDb("tmdb.api_key").trim() !== "";
  } catch {
    return false;
  }
}

export function defaultRegion(): RegionCode {
  try {
    const r = effectiveWithoutDb("region.default").trim() || DEFAULT_REGION;
    return r.toUpperCase();
  } catch {
    return "US";
  }
}

const cache = new Map<string, { at: number; data: unknown }>();

/** Test hook: drop all cached discovery payloads. */
export function clearDiscoverCache(): void {
  cache.clear();
}

async function tmdbGet<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const key = effectiveWithoutDb("tmdb.api_key").trim();
  if (!key) throw new Error("TMDB key is not configured — set it at /admin/settings → APIs.");
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`TMDB ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

async function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < DISCOVER_CACHE_TTL_MS) {
    return hit.data as T;
  }
  try {
    const data = await loader();
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch (err) {
    if (hit) return hit.data as T; // stale beats empty on transient failure
    throw err;
  }
}

/** TMDB genre list, cached 1h, fail-soft []. */
export async function listTmdbGenres(): Promise<Genre[]> {
  try {
    return await cached<Genre[]>("discover:genres", async () => {
      const res = await tmdbGet<{ genres?: Genre[] }>("/genre/movie/list", {
        language: "en-US",
      });
      return Array.isArray(res.genres) ? res.genres : [];
    });
  } catch {
    return [];
  }
}

/** TMDB trending movies (week), cached 1h, fail-soft []. */
export async function getTrending(
  region: RegionCode = defaultRegion()
): Promise<DiscoverTile[]> {
  try {
    return await cached<DiscoverTile[]>(`discover:trending:${region}`, async () => {
      const res = await tmdbGet<{ results?: TmdbMovieDetails[] }>(
        "/trending/movie/week",
        { language: "en-US" }
      );
      return (res.results ?? []).map(mapToTile);
    });
  } catch {
    return [];
  }
}

/** TMDB title search (first page), fail-soft []. */
export async function searchMovies(
  query: string,
  page = 1
): Promise<DiscoverTile[]> {
  const q = query.trim().slice(0, 120);
  if (!q) return [];
  try {
    const res = await tmdbGet<{ results?: TmdbMovieDetails[] }>(
      "/search/movie",
      {
        query: q,
        page: String(page),
        include_adult: "false",
        language: "en-US",
      }
    );
    return (res.results ?? []).map(mapToTile);
  } catch {
    return [];
  }
}

/** TMDB monetization types for the `watch` filter (empty = no constraint). */
function monetizationFor(watch: WatchFilter | null): string {
  switch (watch) {
    case "stream":
      return "flatrate";
    case "free":
      return "free|ads";
    case "rent":
      return "rent";
    case "buy":
      return "buy";
    default:
      return "";
  }
}

/** TMDB discover with genre/year/watch constraints, fail-soft []. */
export async function discoverMovies(
  filters: DiscoverFilters,
  opts: { region?: RegionCode; genreId?: number | null; page?: number } = {}
): Promise<DiscoverTile[]> {
  const region = (opts.region ?? defaultRegion()).toUpperCase();
  const params: Record<string, string> = {
    language: "en-US",
    sort_by: "popularity.desc",
    include_adult: "false",
    page: String(opts.page ?? 1),
  };
  if (opts.genreId) params.with_genres = String(opts.genreId);
  if (filters.year !== null) params.primary_release_year = String(filters.year);
  const monetization = monetizationFor(filters.watch);
  if (monetization) {
    params.with_watch_monetization_types = monetization;
    params.watch_region = region;
  }
  try {
    const res = await tmdbGet<{ results?: TmdbMovieDetails[] }>(
      "/discover/movie",
      params
    );
    return (res.results ?? []).map(mapToTile);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Streaming-guide endpoints (cached 1h, fail-soft []) — same cache/throttle
// pattern as getTrending above. Poster 2:3 w342 via mapToTile only.
// ---------------------------------------------------------------------------

/** TMDB popular movies, cached 1h, fail-soft []. */
export async function getPopular(
  region: RegionCode = defaultRegion()
): Promise<DiscoverTile[]> {
  try {
    return await cached<DiscoverTile[]>(`discover:popular:${region}`, async () => {
      const res = await tmdbGet<{ results?: TmdbMovieDetails[] }>(
        "/movie/popular",
        { language: "en-US", region: String(region).toUpperCase() }
      );
      return (res.results ?? []).map(mapToTile);
    });
  } catch {
    return [];
  }
}

/** TMDB top rated movies, cached 1h, fail-soft []. */
export async function getTopRated(
  region: RegionCode = defaultRegion()
): Promise<DiscoverTile[]> {
  try {
    return await cached<DiscoverTile[]>(`discover:top_rated:${region}`, async () => {
      const res = await tmdbGet<{ results?: TmdbMovieDetails[] }>(
        "/movie/top_rated",
        { language: "en-US", region: String(region).toUpperCase() }
      );
      return (res.results ?? []).map(mapToTile);
    });
  } catch {
    return [];
  }
}

/** TMDB now playing (new in cinemas/streaming), cached 1h, fail-soft []. */
export async function getNowPlaying(
  region: RegionCode = defaultRegion()
): Promise<DiscoverTile[]> {
  try {
    return await cached<DiscoverTile[]>(
      `discover:now_playing:${region}`,
      async () => {
        const res = await tmdbGet<{ results?: TmdbMovieDetails[] }>(
          "/movie/now_playing",
          { language: "en-US", region: String(region).toUpperCase() }
        );
        return (res.results ?? []).map(mapToTile);
      }
    );
  } catch {
    return [];
  }
}

/** TMDB upcoming (coming soon — no providers implied), cached 1h, fail-soft []. */
export async function getUpcoming(
  region: RegionCode = defaultRegion()
): Promise<DiscoverTile[]> {
  try {
    return await cached<DiscoverTile[]>(
      `discover:upcoming:${region}`,
      async () => {
        const res = await tmdbGet<{ results?: TmdbMovieDetails[] }>(
          "/movie/upcoming",
          { language: "en-US", region: String(region).toUpperCase() }
        );
        return (res.results ?? []).map(mapToTile);
      }
    );
  } catch {
    return [];
  }
}

/**
 * Discover by monetization (free/stream/rent/buy), cached 1h, fail-soft [].
 * free → TMDB "free|ads" (region US per guide), stream → "flatrate".
 */
export async function discoverBy(
  kind: DiscoverMonetization,
  region: RegionCode = defaultRegion()
): Promise<DiscoverTile[]> {
  const r = String(region ?? "US").toUpperCase() || "US";
  const monetization =
    kind === "stream" ? "flatrate" : kind === "free" ? "free|ads" : kind;
  try {
    return await cached<DiscoverTile[]>(`discover:by:${kind}:${r}`, async () => {
      const res = await tmdbGet<{ results?: TmdbMovieDetails[] }>(
        "/discover/movie",
        {
          language: "en-US",
          sort_by: "popularity.desc",
          include_adult: "false",
          watch_region: r,
          with_watch_monetization_types: monetization,
          page: "1",
        }
      );
      return (res.results ?? []).map(mapToTile);
    });
  } catch {
    return [];
  }
}

/** Resolve a `list=` view to its fetcher. Fail-soft [] always. */
export async function getListTiles(
  list: DiscoverList,
  region: RegionCode = defaultRegion()
): Promise<DiscoverTile[]> {
  const r = String(region ?? defaultRegion()).toUpperCase();
  switch (list) {
    case "trending":
      return getTrending(r);
    case "popular":
      return getPopular(r);
    case "top_rated":
      return getTopRated(r);
    case "now_playing":
      return getNowPlaying(r);
    case "upcoming":
      return getUpcoming(r);
    case "free":
      return discoverBy("free", "US");
    case "stream":
      return discoverBy("stream", r);
    case "rent":
      return discoverBy("rent", r);
    case "buy":
      return discoverBy("buy", r);
    default:
      return [];
  }
}
