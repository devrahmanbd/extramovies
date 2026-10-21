/**
 * The site's own SERIES reviews — the data behind /series and the series
 * hubs in the sitemap.
 *
 * WHAT THIS IS: the published store rows (the same loader every public page
 * reads, src/lib/seo/content.ts) filtered down to the reviews whose subject
 * is a series. Nothing is hardcoded, no title list is maintained here, and a
 * row that is not published never appears.
 *
 * HOW A ROW IS CLASSIFIED (never guessed):
 *   1. the row's own `mediaType` tag, when the editor pinned one;
 *   2. the IMDb id through TMDB /find (the one id TMDB keeps unique across
 *      the film and the TV namespaces);
 *   3. the title, matched against the film's and the show's own titles.
 * A row that cannot be classified stays UNKNOWN: it is not listed as a
 * series, and it keeps the film's own hub in the sitemap (today's
 * behaviour) rather than moving to a hub it may not deserve.
 *
 * FAIL-SOFT: a missing TMDB key, a 404 or a network error resolves to
 * "unknown", never to a wrong answer (src/lib/tmdb/media-type.ts).
 */
import type { PublicReview } from "./content";
import { getLatestReviews } from "./content";
import {
  mediaTypeByImdbId,
  mediaTypeByTitle,
  type ReviewMediaType,
} from "../tmdb/media-type";

export type { ReviewMediaType };

/** A published review with the media type resolved for it. */
export interface MediaTypedReview {
  review: PublicReview;
  /** "movie" | "tv" when known, null when the site cannot tell. */
  mediaType: ReviewMediaType | null;
}

/** The media type pinned on the row, when the editor set one. */
export function pinnedMediaType(review: PublicReview): ReviewMediaType | null {
  const t = review.mediaType;
  return t === "movie" || t === "tv" ? t : null;
}

/**
 * Resolve the media type of one published review.
 *
 * The pinned tag wins; then the IMDb id; then the title. Never throws.
 */
export async function resolveMediaType(
  review: PublicReview,
): Promise<ReviewMediaType | null> {
  const pinned = pinnedMediaType(review);
  if (pinned) return pinned;
  const tmdbId =
    typeof review.tmdbId === "number" && Number.isSafeInteger(review.tmdbId) && review.tmdbId > 0
      ? review.tmdbId
      : null;
  const byImdb = await mediaTypeByImdbId(review.imdbId ?? null, tmdbId);
  if (byImdb) return byImdb;
  if (tmdbId === null) return null;
  return mediaTypeByTitle(tmdbId, review.movieTitle);
}

/**
 * Resolve the media type of a list of reviews, keeping the list order.
 *
 * The building block behind getMediaTypedReviews(), getSeriesReviews() and
 * getMovieReviews(): a caller that already holds the rows (the sitemap) does
 * not have to load them twice.
 */
export async function withMediaTypes(
  reviews: PublicReview[],
): Promise<MediaTypedReview[]> {
  return Promise.all(
    reviews.map(async (review) => ({
      review,
      mediaType: await resolveMediaType(review),
    })),
  );
}

/**
 * Every published review with its media type resolved, newest first.
 *
 * The list keeps the store order (newest first) the loader already applies.
 */
export async function getMediaTypedReviews(
  limit = 5000,
): Promise<MediaTypedReview[]> {
  return withMediaTypes(getLatestReviews(limit));
}

/**
 * The published SERIES reviews, newest first.
 *
 * The series index lists exactly these, and the sitemap lists a series hub
 * only for a review that is in here.
 */
export async function getSeriesReviews(limit = 5000): Promise<PublicReview[]> {
  const typed = await getMediaTypedReviews(limit);
  return typed.filter((t) => t.mediaType === "tv").map((t) => t.review);
}

/**
 * The published FILM reviews, newest first.
 *
 * The mirror of getSeriesReviews(): the rows the film hubs (/movies/<id>)
 * belong to. A row the site cannot classify stays in neither list — the
 * sitemap keeps today's behaviour for it (the film's own hub, unchanged).
 */
export async function getMovieReviews(limit = 5000): Promise<PublicReview[]> {
  const typed = await getMediaTypedReviews(limit);
  return typed.filter((t) => t.mediaType === "movie").map((t) => t.review);
}

/** "1 review" / "3 reviews" — never padded. */
export function seriesCountText(count: number): string {
  return count === 1 ? "1 review" : `${count} reviews`;
}

/**
 * The short factual intro: what this section is, in one sentence.
 *
 * It claims nothing the data does not say — no collection size, no
 * "everything" claim — and it names the site, so the brand query is
 * answered on the page itself. With nothing published it says exactly
 * that instead of implying a collection that does not exist.
 */
export function seriesIntro(siteName: string, count = 0): string {
  const site = siteName.trim() || "the journal";
  if (count <= 0) return `No web or television series review is published on ${site} yet.`;
  return `Every web and television series ${site} has reviewed, newest first.`;
}

/** The page title (the brand suffix is added by the meta builder). */
export function seriesTitle(): string {
  return "Web series reviews";
}

/** The meta description source (length-banded by the meta builder). */
export function seriesDescription(siteName: string, count = 0): string {
  const site = siteName.trim() || "the journal";
  if (count <= 0) {
    return `Web and television series reviews on ${site}: our rating out of ten, our one-line verdict, and where to watch.`;
  }
  return `Every web and television series ${site} has reviewed, newest first: our rating out of ten, our one-line verdict, and where to watch.`;
}

/**
 * The hub path for a series review ("/series/<tmdbId>"), or null when the
 * row carries no TMDB id (no hub, no invented link).
 */
export function seriesHubPath(review: PublicReview): string | null {
  const id = review.tmdbId;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) return null;
  return `/series/${id}`;
}
