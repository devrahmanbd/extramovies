/**
 * publish-guard — publish-time gates for editorial reviews.
 *
 * House rule: the score is the OWNER's call (AI never sets taste), so a
 * review may sit in the admin as a DRAFT with no rating (or rating 0)
 * until the owner scores it. It must never GO LIVE that way: the public
 * review page renders "rated X/10" in its meta description
 * (src/pages/reviews/[slug].astro) and the Review JSON-LD carries
 * `reviewRating.ratingValue` (src/lib/seo/jsonld.ts) — publishing an
 * unrated review ships a public "rated 0/10" claim.
 *
 * Member reviews are a different system with their own rating rules
 * (src/lib/members/reviews.ts, rating null|0..10) and are NOT affected
 * by this gate.
 */

/** Canonical message for an unrated review (surfaced verbatim by the admin UI). */
export const PUBLISH_RATING_REQUIRED_ERROR =
  "Set a rating before publishing this review.";

/** Canonical message for a rating that is outside the 0–10 scale. */
export const PUBLISH_RATING_RANGE_ERROR =
  "Rating must be between 0 and 10 to publish this review.";

/** Lowest score the site shows (0 = "not scored yet", never publishable). */
export const PUBLISH_RATING_MIN = 0;

/** Highest score the site shows. */
export const PUBLISH_RATING_MAX = 10;

export type PublishRatingCheck =
  | { ok: true }
  | { ok: false; error: string };

/**
 * A rating is publishable when it is a finite number in (0, 10].
 * 0 means "not scored yet" — treated exactly like a missing rating.
 * Numeric strings are tolerated (frontmatter/JSON round-trips).
 */
export function checkPublishRating(rating: unknown): PublishRatingCheck {
  if (rating === undefined || rating === null || rating === "") {
    return { ok: false, error: PUBLISH_RATING_REQUIRED_ERROR };
  }
  const n = typeof rating === "number" ? rating : Number(rating);
  if (!Number.isFinite(n)) {
    return { ok: false, error: PUBLISH_RATING_REQUIRED_ERROR };
  }
  if (n === 0) {
    return { ok: false, error: PUBLISH_RATING_REQUIRED_ERROR };
  }
  if (n < PUBLISH_RATING_MIN || n > PUBLISH_RATING_MAX) {
    return { ok: false, error: PUBLISH_RATING_RANGE_ERROR };
  }
  return { ok: true };
}

/** True when the review may be published as-is. */
export function canPublishRating(rating: unknown): boolean {
  return checkPublishRating(rating).ok;
}
