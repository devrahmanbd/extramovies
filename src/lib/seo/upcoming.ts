/**
 * The /upcoming page's pure layer — the window, the month buckets, the
 * wording and the coverage markers.
 *
 * NOTHING HERE TOUCHES THE NETWORK OR THE STORE: every function is a pure
 * transformation of data another layer already fetched, so the rules can be
 * unit-tested without TMDB and without the site's own review corpus.
 *
 * THE HOUSE RULES THIS FILE KEEPS:
 *   - an unreleased film never carries a number or a verdict (no rating, no
 *     score, no "out of ten"). The page says what is known: a date, the
 *     credits TMDB states, and whether we have written about it yet;
 *   - a missing fact is omitted, never filled in;
 *   - the copy carries no em-dash (the house voice).
 */
import type { PublicReview } from "./content";

/** How far ahead the list reaches: eight months. */
export const UPCOMING_WINDOW_MONTHS = 8;

/**
 * How many films the page lists.
 *
 * One TMDB page of results (20) in TMDB's own popularity order, so the
 * titles the audience is already asking about float to the top. It is a cap
 * on the list, never a judgement about any film.
 */
export const UPCOMING_MAX_FILMS = 20;

/** A release-date window, inclusive on both ends (YYYY-MM-DD). */
export interface ReleaseWindow {
  from: string;
  to: string;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The window the page covers: from tomorrow to the end of the month eight
 * months away.
 *
 * Tomorrow (not today) so a film that opens today is never listed as
 * upcoming, and the far end is a month boundary so the last bucket is a
 * whole month rather than a random cut-off day.
 */
export function upcomingWindow(now: Date = new Date()): ReleaseWindow {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const from = new Date(Date.UTC(y, m, d + 1));
  const far = new Date(Date.UTC(y, m + UPCOMING_WINDOW_MONTHS + 1, 0));
  return { from: iso(from), to: iso(far) };
}

/** "2026-11" for "2026-11-06". Null when the date is not an ISO date. */
export function monthKey(dateISO: string | null | undefined): string | null {
  if (typeof dateISO !== "string") return null;
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(dateISO.trim());
  if (!m) return null;
  return `${m[1]}-${m[2]}`;
}

/** "November 2026" for "2026-11". */
export function monthLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return key;
  const month = Number(m[2]);
  const name = MONTH_NAMES[month - 1];
  if (!name) return key;
  return `${name} ${m[1]}`;
}

/** "November 6, 2026" for "2026-11-06". The raw date when it is not one. */
export function formatReleaseDate(dateISO: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateISO ?? "").trim());
  if (!m) return "Date to be confirmed";
  const name = MONTH_NAMES[Number(m[2]) - 1];
  if (!name) return dateISO ?? "";
  return `${name} ${Number(m[3])}, ${m[1]}`;
}

/** The film facts the page can print, in the order it prints them. */
export interface UpcomingFilmFacts {
  tmdbId: number;
  title: string;
  releaseDate: string | null;
  director?: string | null;
  cast?: string[];
  runtimeMinutes?: number | null;
  certificate?: string | null;
}

/** One month of the list. */
export interface UpcomingMonth {
  key: string;
  label: string;
  films: UpcomingFilmFacts[];
}

/**
 * Group the films by release month, oldest month first, oldest film first
 * inside a month.
 *
 * A film with no date cannot be placed in a month and is left out of the
 * buckets (the page never invents a date to place it).
 */
export function groupByMonth(films: UpcomingFilmFacts[]): UpcomingMonth[] {
  const buckets = new Map<string, UpcomingFilmFacts[]>();
  for (const film of films) {
    const key = monthKey(film.releaseDate);
    if (!key) continue;
    const list = buckets.get(key) ?? [];
    list.push(film);
    buckets.set(key, list);
  }
  return [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key, list]) => ({
      key,
      label: monthLabel(key),
      films: [...list].sort((a, b) =>
        (a.releaseDate ?? "") < (b.releaseDate ?? "")
          ? -1
          : (a.releaseDate ?? "") > (b.releaseDate ?? "")
            ? 1
            : 0,
      ),
    }));
}

/** The page title (the brand suffix is added by the meta builder). */
export function upcomingTitle(): string {
  return "Upcoming movies and release dates";
}

/**
 * The meta description source.
 *
 * Date-free on purpose: the window moves every day, and a description that
 * rewrites itself daily is not a description. The band (150-160 chars) is
 * kept so the builder never has to cut it.
 */
export function upcomingDescription(): string {
  return "Every film due in cinemas over the next eight months, with release dates, directors and cast, grouped month by month. Dates come from the studios and they move.";
}

/**
 * The intro: what the page is, the window it covers, and the one caveat
 * that keeps it honest.
 *
 * One or two sentences, no em-dash, and no claim the data does not make.
 */
export function upcomingIntro(window: ReleaseWindow): string {
  return `What we are watching for: every film with a release date between ${formatReleaseDate(window.from)} and ${formatReleaseDate(window.to)}, listed month by month. Dates come from the studios through TMDB, and studios move them, so treat each one as a plan rather than a promise.`;
}

/**
 * The note under the "later" bucket.
 *
 * A title that sits beyond the window is announced but undated in practice,
 * so its date is called provisional rather than presented as fact.
 */
export function laterNote(): string {
  return "This title is announced but far out. TMDB carries a placeholder date for it, so treat that date as provisional.";
}

/** What we say about a film we have not written about yet. */
export const NO_REVIEW_MARKER = "We have not reviewed it yet.";

/** The coverage of one film: our review and our hub, when we have them. */
export interface FilmCoverage {
  /** The review we published about this film. */
  reviewPath: string;
  /** The film's own page on this site. */
  hubPath: string;
}

/**
 * The coverage marker for a film.
 *
 * Coverage is the site's OWN published review for that TMDB id, and the hub
 * that goes with it. A film we have not reviewed has no coverage: the page
 * says so plainly instead of linking to a page that carries no opinion.
 */
export function coverageFor(
  film: { tmdbId: number },
  reviews: PublicReview[]
): FilmCoverage | null {
  const review = reviews.find(
    (r) => typeof r.tmdbId === "number" && r.tmdbId === film.tmdbId,
  );
  if (!review) return null;
  return {
    reviewPath: `/reviews/${review.slug}`,
    hubPath: `/movies/${film.tmdbId}`,
  };
}
