/**
 * Media type resolution — is a title a film or a series?
 *
 * WHY THIS EXISTS: TMDB keeps the film ids and the TV ids in SEPARATE
 * namespaces and the SAME NUMBER exists in both. Id 43720 is the miniseries
 * "Neverland" AND the UFC film "UFC 118: Edgar vs. Penn 2"; 46976 is
 * "Hitler: The Rise of Evil" AND "Wish You Were Here". A number alone can
 * therefore never decide what a review is about, and the site has to know:
 * the series index (/series) lists series reviews and the series hubs live
 * at /series/<tmdbId>, while the film hubs live at /movies/<tmdbId>.
 *
 * Two disambiguating lookups, in order:
 *   1. the IMDb id (unique across namespaces) through TMDB /find;
 *   2. the title, matched against the film's and the show's own titles.
 *
 * HONEST LIMITS: a missing key, a 404, a network error or an ambiguous
 * answer resolves to null ("unknown"). Nothing here ever guesses, and a
 * title that matches BOTH namespaces stays unknown rather than picking one.
 *
 * Cached in memory for an hour (the same TTL the discovery layer uses), so
 * a page render costs one TMDB round-trip per title, not per request.
 */
import { findMediaTypeByImdbId, getMovieMetaSafe } from "./client.js";
import { getTvMetaSafe } from "./series.js";

/** The site's media vocabulary (same shape as src/lib/members/reviews.ts). */
export type ReviewMediaType = "movie" | "tv";

/** In-memory cache TTL (1h), mirroring src/lib/tmdb/discover.ts. */
export const MEDIA_TYPE_CACHE_TTL_MS = 3_600_000;

const cache = new Map<string, { at: number; value: ReviewMediaType | null }>();

/** Test hook: drop every cached media type. */
export function clearMediaTypeCache(): void {
  cache.clear();
}

async function cachedMediaType(
  key: string,
  loader: () => Promise<ReviewMediaType | null>,
): Promise<ReviewMediaType | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < MEDIA_TYPE_CACHE_TTL_MS) return hit.value;
  let value: ReviewMediaType | null = null;
  try {
    value = await loader();
  } catch {
    value = null; // fail-soft: unknown, never a guess
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Fold a title to a comparable key: accents folded, case and spacing off. */
export function normalizeTitle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u0361]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** True when the needle is one of the candidate titles. */
function titleMatches(needle: string, candidates: Array<string | null | undefined>): boolean {
  if (!needle) return false;
  return candidates.some((c) => {
    const key = normalizeTitle(c ?? "");
    return key.length > 0 && key === needle;
  });
}

/**
 * Media type of a title, decided by its IMDb id.
 *
 * The IMDb id is the one identifier TMDB keeps unique across the film and
 * the TV namespaces, so this is the authoritative lookup.
 */
export async function mediaTypeByImdbId(
  imdbId: string | null | undefined,
  tmdbId?: number | null,
): Promise<ReviewMediaType | null> {
  const clean = (imdbId ?? "").trim();
  if (!/^tt\d+$/.test(clean)) return null;
  const idPart = typeof tmdbId === "number" && Number.isFinite(tmdbId) ? tmdbId : "none";
  return cachedMediaType(`imdb:${clean}:${idPart}`, () =>
    findMediaTypeByImdbId(clean, tmdbId ?? null),
  );
}

/**
 * Media type of a title, decided by matching the title against the film's
 * and the show's own TMDB titles.
 *
 * The fallback for a row without an IMDb id. A title that matches BOTH
 * namespaces stays unknown: the site never guesses which one a review is
 * about.
 */
export async function mediaTypeByTitle(
  tmdbId: number,
  title: string,
): Promise<ReviewMediaType | null> {
  const needle = normalizeTitle(title);
  if (!needle || !Number.isSafeInteger(tmdbId) || tmdbId <= 0) return null;
  return cachedMediaType(`title:${tmdbId}:${needle}`, async () => {
    const [show, movie] = await Promise.all([
      getTvMetaSafe(tmdbId),
      getMovieMetaSafe(tmdbId),
    ]);
    const tvMatch =
      show.ok && titleMatches(needle, [show.show.title, show.show.originalTitle]);
    const movieMatch =
      movie.ok && titleMatches(needle, [movie.movie.title, movie.movie.originalTitle]);
    if (tvMatch && !movieMatch) return "tv";
    if (movieMatch && !tvMatch) return "movie";
    return null; // both match, or neither — unknown
  });
}
