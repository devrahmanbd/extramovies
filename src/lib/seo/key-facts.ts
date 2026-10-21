/**
 * Key facts + quick answers — the GEO/AEO layer over the public review
 * contract.
 *
 * Pure functions only: no store access, no DB, no client JavaScript. Every
 * value comes from a field the review page already holds, so a fact we do
 * not have is never invented: the row is dropped instead of printing an
 * empty label. A review with no verdict renders no quick answer at all.
 *
 * Copy rules (house style): no em-dashes, no marketing language, no
 * adjectives, no invented facts, no quotes without a source.
 */
import type { PublicReview } from "./content";
import { formatRuntime } from "./content";

export interface KeyFactRow {
  /** Short label, the same vocabulary the movie-info list uses. */
  label: string;
  /** The fact itself. Never empty. */
  value: string;
}

export interface QuickAnswer {
  /** Question-shaped heading, as a reader would ask it. */
  question: string;
  /** The direct answer, one sentence. */
  answer: string;
}

export interface WatchSummary {
  /** Sentence for the quick answer: "Stream on A and B; rent on C (checked on D)." */
  sentence: string;
  /** Compact list for the facts row: "A and B (stream); C (rent)". */
  list: string;
  /** Date the availability snapshot was taken. */
  checkedOn: string | null;
}

/** Main cast names printed in the fact card. */
const MAX_CAST = 3;
/** A verdict shorter than this reads as a label, not an answer, so a second sentence is added. */
const MIN_LEAD_LENGTH = 25;

/** Collapse whitespace so a value never breaks a line or a label. */
function oneLine(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** "October 21, 2026" (UTC) — the same shape the review page prints. */
export function factDate(value: unknown): string | null {
  const raw = oneLine(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "109 min" / "1h 49m" to minutes. Null when the label carries no number. */
export function parseRuntimeLabel(label: unknown): number | null {
  const text = oneLine(label);
  if (!text) return null;
  const hours = text.match(/(\d+)\s*(?:h|hr|hrs|hour|hours)\b/i);
  const mins = text.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/i);
  const h = hours ? Number(hours[1]) : 0;
  const m = mins ? Number(mins[1]) : 0;
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (!h && !m) return null;
  return h * 60 + m;
}

/** Runtime as the page prints it ("2h 47m"), or null when unknown. */
export function runtimeFact(review: PublicReview): string | null {
  const minutes = review.runtimeMinutes;
  if (typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0) {
    return formatRuntime(minutes);
  }
  const label = oneLine(review.runtimeLabel);
  if (!label) return null;
  const parsed = parseRuntimeLabel(label);
  return parsed ? formatRuntime(parsed) : label;
}

/** "A, B and C" — no Oxford comma, matching the watch box wording. */
function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** First letter uppercased, the rest untouched. */
function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** First names of the main cast, comma separated. */
export function castFact(cast: string[] | undefined | null): string {
  return (cast ?? []).map(oneLine).filter(Boolean).slice(0, MAX_CAST).join(", ");
}

/** Our own score, or null when the review carries none (0 means unscored). */
export function ratingFact(rating: number | undefined | null): string | null {
  if (typeof rating !== "number" || !Number.isFinite(rating) || rating <= 0) return null;
  return `${rating}/10`;
}

/**
 * Where the film can be watched, from the same sources the watch box uses:
 * TMDB provider rows (hidden when the region has no data) plus the
 * editor's manual links. Null when the review carries no watch data.
 */
export function watchSummary(review: PublicReview): WatchSummary | null {
  const providers = review.providers;
  const custom = review.customWatch;
  const showAuto = !providers?.hideSection;
  const providerNames = (list?: { name: string }[] | null): string[] =>
    Array.isArray(list) ? list.map((p) => oneLine(p?.name)).filter(Boolean) : [];
  const customNames = (list?: { label: string }[] | null): string[] =>
    Array.isArray(list) ? list.map((l) => oneLine(l?.label)).filter(Boolean) : [];

  const free = [...(showAuto ? providerNames(providers?.free) : []), ...customNames(custom?.free)];
  const streaming = showAuto ? providerNames(providers?.streaming) : [];
  const rent = showAuto ? providerNames(providers?.rent) : [];
  const buy = [...(showAuto ? providerNames(providers?.buy) : []), ...customNames(custom?.paid)];

  const groups: { label: string; verb: string; names: string[] }[] = [];
  if (free.length) groups.push({ label: "watch free", verb: "watch free on", names: free });
  if (streaming.length) groups.push({ label: "stream", verb: "stream on", names: streaming });
  if (rent.length) groups.push({ label: "rent", verb: "rent on", names: rent });
  if (buy.length) groups.push({ label: "buy", verb: "buy on", names: buy });
  if (!groups.length) return null;

  const checkedOn = factDate(providers?.fetchedAt);
  const sentence = `${groups.map((g) => `${g.verb} ${joinNames(g.names)}`).join("; ")}${
    checkedOn ? ` (checked on ${checkedOn})` : ""
  }.`;
  const list = groups.map((g) => `${joinNames(g.names)} (${g.label})`).join("; ");
  // The sentence answers a question, so it starts with a capital.
  return { sentence: capitalize(sentence), list, checkedOn };
}

/**
 * The fact card rows, in reading order. A field we do not have drops its
 * row: the card is never blank and never carries an empty label.
 */
export function keyFactRows(
  review: PublicReview,
  opts?: { authorName?: string | null },
): KeyFactRow[] {
  const rows: KeyFactRow[] = [];
  const add = (label: string, value: string | null | undefined) => {
    const clean = oneLine(value);
    if (!clean) return;
    rows.push({ label, value: clean });
  };

  add("Title", review.movieTitle);
  add("Year", review.year ? String(review.year) : null);
  add("Released", factDate(review.releaseDate));
  add("Runtime", runtimeFact(review));
  add("Director", review.director);
  add("Cast", castFact(review.cast));
  add("Genres", (review.genres ?? []).map(oneLine).filter(Boolean).join(", "));
  add("Our rating", ratingFact(review.rating));
  add("Our verdict", review.verdict);

  const watch = watchSummary(review);
  if (watch) {
    add("Where to watch", watch.list);
    add("Checked on", watch.checkedOn);
  }

  add("Reviewed on", factDate(review.publishedAt));
  add("Reviewed by", opts?.authorName ?? review.authorName);
  return rows;
}

/**
 * The leading sentence(s) of the verdict. A short first sentence ("Watch
 * it.") reads as a label on its own, so the next sentence joins it.
 */
function leadSentences(text: string): string {
  const parts = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return "";
  let out = parts[0]!;
  if (out.length < MIN_LEAD_LENGTH && parts[1]) out = `${out} ${parts[1]}`;
  return out.replace(/[.!?]+$/, "");
}

/** The film as a reader would name it. */
function filmLabel(review: PublicReview): string {
  return oneLine(review.movieTitle) || oneLine(review.reviewTitle);
}

/**
 * The quick-answer block: one question per heading, the answer directly
 * under it. A review with no verdict gets no block at all.
 */
export function quickAnswers(review: PublicReview): QuickAnswer[] {
  const verdict = oneLine(review.verdict);
  if (!verdict) return [];
  const film = filmLabel(review);
  if (!film) return [];

  const answers: QuickAnswer[] = [];
  const core = leadSentences(verdict);
  if (core) {
    const rating = ratingFact(review.rating);
    answers.push({
      question: `Is ${film} worth watching?`,
      answer: `${core}${rating ? ` (our rating: ${rating})` : ""}.`,
    });
  }
  const watch = watchSummary(review);
  if (watch) {
    answers.push({
      question: `Where can I watch ${film}?`,
      answer: watch.sentence,
    });
  }
  return answers;
}
