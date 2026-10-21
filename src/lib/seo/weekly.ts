/**
 * Weekly freshness window — the data layer of the "new movie reviews this
 * week" module (discovery home).
 *
 * Pure functions over a list of published reviews: no store access, no
 * clock read of its own (the caller passes `now`), no side effects. The
 * page loader feeds them the SAME rows the rest of the site publishes
 * (`getLatestReviews`), so the module can never show a draft, a row from
 * another brand, or a review the archive does not list.
 *
 * Rules:
 *  - The window is 7 days, matching the "new movie reviews this week"
 *    search intent (weekly refresh, not a rolling archive).
 *  - A review older than the window drops OUT of the module and stays on
 *    the site (archive, sitemap, taxonomy hubs) — the window only decides
 *    what is fresh, never what exists.
 *  - One row per slug: a review appears once, even if the input repeats
 *    it (the newest occurrence wins).
 *  - A row with a missing or unparseable publish date is skipped, never
 *    guessed into the window.
 */
import type { PublicReview } from "./content";

/** The window length in days (weekly refresh intent). */
export const WEEK_WINDOW_DAYS = 7;

/** Milliseconds in one day. */
const DAY_MS = 86_400_000;

/**
 * The oldest publish date still inside the window.
 *
 * @param now    The reference moment (the page render time).
 * @param days   Window length in days; defaults to a week.
 */
export function weeklyCutoff(now: Date, days: number = WEEK_WINDOW_DAYS): Date {
  const span = Number.isFinite(days) && days > 0 ? days : WEEK_WINDOW_DAYS;
  return new Date(now.getTime() - span * DAY_MS);
}

/** Parse a publish date; NaN when the value is missing or malformed. */
function publishedTime(review: PublicReview): number {
  const raw = review?.publishedAt;
  if (typeof raw !== "string" || !raw.trim()) return Number.NaN;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : Number.NaN;
}

/**
 * The reviews published inside the window, newest first, one row per slug.
 *
 * Pure: the caller owns `now`, so the result is deterministic and testable.
 * Never throws — a malformed date is skipped, not fatal.
 */
export function reviewsPublishedWithin(
  reviews: PublicReview[],
  now: Date,
  days: number = WEEK_WINDOW_DAYS,
): PublicReview[] {
  if (!Array.isArray(reviews) || reviews.length === 0) return [];
  const cutoff = weeklyCutoff(now, days).getTime();
  const nowMs = now.getTime();
  if (!Number.isFinite(cutoff) || !Number.isFinite(nowMs)) return [];
  const fresh: PublicReview[] = [];
  for (const review of reviews) {
    if (!review || typeof review.slug !== "string" || !review.slug.trim()) continue;
    const t = publishedTime(review);
    if (!Number.isFinite(t)) continue;
    if (t < cutoff || t > nowMs) continue;
    fresh.push(review);
  }
  // Newest first, then one row per slug (the newest wins the slot).
  fresh.sort((a, b) => publishedTime(b) - publishedTime(a));
  const seen = new Set<string>();
  const out: PublicReview[] = [];
  for (const review of fresh) {
    if (seen.has(review.slug)) continue;
    seen.add(review.slug);
    out.push(review);
  }
  return out;
}

/** Whole days between a publish date and `now` (0 = today). */
export function daysSince(publishedAt: string, now: Date): number {
  const t = Date.parse(publishedAt ?? "");
  if (!Number.isFinite(t)) return Number.NaN;
  return Math.max(0, Math.floor((now.getTime() - t) / DAY_MS));
}

/**
 * The freshness label shown next to a review: "Today", "Yesterday" or
 * "N days ago". Never an empty string — an unreadable date falls back to
 * the plain-language "This week".
 */
export function freshnessLabel(publishedAt: string, now: Date): string {
  const days = daysSince(publishedAt, now);
  if (!Number.isFinite(days)) return "This week";
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

/**
 * The absolute publish date, in the site's own long form
 * ("October 20, 2026"), UTC so the label never shifts with the reader's
 * clock. Empty string when the date cannot be read.
 */
export function publishDateLabel(publishedAt: string): string {
  const t = Date.parse(publishedAt ?? "");
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
