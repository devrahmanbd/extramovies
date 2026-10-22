/**
 * The /upcoming page's TMDB layer — the release calendar, enriched with the
 * credits TMDB states, and nothing else.
 *
 * WHAT COMES FROM WHERE:
 *   - the LIST (which films, which date) comes from getUpcoming() with a
 *     release-date window, so the discovery front and this page share one
 *     data path (src/lib/tmdb/discover.ts);
 *   - the CREDITS (director, principal cast, runtime, certificate) come
 *     from TMDB's own film record, one request per film;
 *   - nothing else is added. No rating, no verdict, no prediction.
 *
 * SPEED: the page must never hang on TMDB. Every per-film request has a
 * short timeout, the enrichment runs on a small pool, and the whole
 * enrichment has a budget: when the budget is spent the films that have not
 * answered yet are printed with the facts that did arrive (their title and
 * their date), never with a blank entry.
 *
 * FAIL-SOFT: no key, a network error or a TMDB error resolves to an empty
 * list, so the page renders its honest empty state instead of failing.
 */
import { defaultRegion, getUpcoming, hasTmdbKey } from "./discover";
import { effectiveWithoutDb } from "../settings";
import { imageUrl } from "./client";
import {
  upcomingWindow,
  UPCOMING_MAX_FILMS,
  type ReleaseWindow,
} from "../seo/upcoming";

const TMDB_BASE = "https://api.themoviedb.org/3";

/** In-memory cache for the per-film details: 1h, like every other TMDB read. */
export const UPCOMING_DETAILS_TTL_MS = 3_600_000;

/** Per-request timeout for one film's details. */
export const UPCOMING_DETAILS_TIMEOUT_MS = 2_500;

/** The whole enrichment budget. Past it, the page prints what it has. */
export const UPCOMING_ENRICH_BUDGET_MS = 4_000;

/** How many films are enriched at the same time. */
const ENRICH_CONCURRENCY = 6;

/** How many cast names a film line carries. */
const CAST_NAMES = 3;

/**
 * Films that are announced but sit beyond the window TMDB's calendar
 * reaches, so they are listed in their own bucket with a provisional date.
 *
 * The ids are curated (the owner asked for Call of Duty); the title, the
 * date and the credits still come from TMDB, so nothing is hardcoded but the
 * pointer.
 */
export const LATER_FILM_IDS: readonly number[] = [1540305];

/** One film on the list: what TMDB states, and nothing more. */
export interface UpcomingFilm {
  tmdbId: number;
  title: string;
  /** The release date the window query answered with (YYYY-MM-DD). */
  releaseDate: string | null;
  director: string | null;
  cast: string[];
  runtimeMinutes: number | null;
  certificate: string | null;
  posterUrl: string | null;
}

interface TmdbFilmDetails {
  id?: number;
  title?: string;
  release_date?: string;
  runtime?: number | null;
  poster_path?: string | null;
  credits?: {
    cast?: Array<{ name?: string; order?: number }>;
    crew?: Array<{ name?: string; job?: string }>;
  };
  certifications?: Record<string, Array<{ certification?: string }>>;
}

const detailsCache = new Map<number, { at: number; film: UpcomingFilm }>();

/** Test hook: drop every cached film detail. */
export function clearUpcomingDetailsCache(): void {
  detailsCache.clear();
}

/**
 * One TMDB request with a hard timeout. Resolves null on any failure — the
 * caller prints the film without the missing facts.
 */
async function fetchJson(
  path: string,
  params: Record<string, string>,
  timeoutMs: number
): Promise<unknown | null> {
  const key = effectiveWithoutDb("tmdb.api_key").trim();
  if (!key) return null;
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function directorsOf(details: TmdbFilmDetails): string | null {
  const names = (details.credits?.crew ?? [])
    .filter((c) => c.job === "Director" && typeof c.name === "string" && c.name.trim())
    .map((c) => (c.name as string).trim());
  if (!names.length) return null;
  return names.join(", ");
}

function castOf(details: TmdbFilmDetails): string[] {
  return [...(details.credits?.cast ?? [])]
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .map((c) => (typeof c.name === "string" ? c.name.trim() : ""))
    .filter(Boolean)
    .slice(0, CAST_NAMES);
}

function certificateOf(details: TmdbFilmDetails, region: string): string | null {
  const list = details.certifications?.[region];
  const first = list?.find((c) => c.certification && c.certification.trim());
  return first?.certification?.trim() ?? null;
}

/**
 * One film's details: the credits TMDB states, and the release date the
 * list already answered with (the window date), so the date on the page is
 * the same date everywhere in the list.
 *
 * Cached 1h (a successful read only). Never throws. Null when TMDB cannot
 * answer: the caller decides whether that means "print the film without its
 * credits" or "print nothing".
 */
export async function getFilmDetails(
  tmdbId: number,
  fallback: { title: string; releaseDate: string | null; posterUrl: string | null },
  region: string = defaultRegion(),
  deadline: number = Date.now() + UPCOMING_ENRICH_BUDGET_MS
): Promise<UpcomingFilm | null> {
  const hit = detailsCache.get(tmdbId);
  if (hit && Date.now() - hit.at < UPCOMING_DETAILS_TTL_MS) {
    return hit.film;
  }
  // The budget is spent: no details, but the list facts still stand.
  if (Date.now() > deadline) return null;

  const raw = (await fetchJson(
    `/movie/${tmdbId}`,
    { language: "en-US", append_to_response: "credits,certifications" },
    UPCOMING_DETAILS_TIMEOUT_MS
  )) as TmdbFilmDetails | null;
  if (!raw) return null;

  const film: UpcomingFilm = {
    tmdbId,
    title:
      typeof raw.title === "string" && raw.title.trim()
        ? raw.title
        : fallback.title,
    releaseDate: fallback.releaseDate ?? (raw.release_date ?? null),
    director: directorsOf(raw),
    cast: castOf(raw),
    runtimeMinutes:
      typeof raw.runtime === "number" && raw.runtime > 0 ? raw.runtime : null,
    certificate: certificateOf(raw, region),
    posterUrl: imageUrl(raw.poster_path ?? null, "w342") ?? fallback.posterUrl,
  };
  detailsCache.set(tmdbId, { at: Date.now(), film });
  return film;
}

/**
 * Enrich a list of films on a small pool, with one shared deadline.
 *
 * The order of the list is kept: the pool never reorders anything. A film
 * whose details did not answer keeps the facts the list already gave it
 * (its title and its date) and simply carries no credits.
 */
async function enrich(
  films: Array<{ tmdbId: number; title: string; releaseDate: string | null; posterUrl: string | null }>,
  region: string
): Promise<UpcomingFilm[]> {
  const deadline = Date.now() + UPCOMING_ENRICH_BUDGET_MS;
  const out = new Array<UpcomingFilm>(films.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++;
      if (index >= films.length) return;
      const film = films[index]!;
      const detail = await getFilmDetails(
        film.tmdbId,
        {
          title: film.title,
          releaseDate: film.releaseDate,
          posterUrl: film.posterUrl,
        },
        region,
        deadline,
      );
      out[index] = detail ?? {
        tmdbId: film.tmdbId,
        title: film.title,
        releaseDate: film.releaseDate,
        director: null,
        cast: [],
        runtimeMinutes: null,
        certificate: null,
        posterUrl: film.posterUrl,
      };
    }
  }
  const workers: Array<Promise<void>> = [];
  for (let i = 0; i < Math.min(ENRICH_CONCURRENCY, films.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return out.filter(Boolean);
}

/**
 * The films in the window, oldest release first is NOT applied here (the
 * page groups them by month), with the credits TMDB states.
 *
 * Fail-soft: [] when there is no key or TMDB cannot answer.
 */
export async function getUpcomingFilms(
  now: Date = new Date(),
  region: string = defaultRegion()
): Promise<UpcomingFilm[]> {
  if (!hasTmdbKey()) return [];
  const window: ReleaseWindow = upcomingWindow(now);
  const tiles = await getUpcoming(region, {
    from: window.from,
    to: window.to,
    limit: UPCOMING_MAX_FILMS,
  });
  if (!tiles.length) return [];
  const films = tiles
    .filter((t) => typeof t.releaseDate === "string" && t.releaseDate >= window.from)
    .map((t) => ({
      tmdbId: t.tmdbId,
      title: t.title,
      releaseDate: t.releaseDate,
      posterUrl: t.posterUrl,
    }));
  if (!films.length) return [];
  return enrich(films, region);
}

/**
 * The films that sit beyond the window: announced, dated by TMDB, and listed
 * in their own bucket with a provisional-date note.
 *
 * A film TMDB cannot answer for is left out entirely: a row with no title
 * and no date would tell the reader nothing.
 */
export async function getLaterFilms(
  region: string = defaultRegion()
): Promise<UpcomingFilm[]> {
  if (!hasTmdbKey()) return [];
  const deadline = Date.now() + UPCOMING_ENRICH_BUDGET_MS;
  const films: UpcomingFilm[] = [];
  for (const tmdbId of LATER_FILM_IDS) {
    const film = await getFilmDetails(
      tmdbId,
      { title: "", releaseDate: null, posterUrl: null },
      region,
      deadline,
    );
    if (film && film.title) films.push(film);
  }
  return films;
}
