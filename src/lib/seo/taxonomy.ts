/**
 * Taxonomy resolver — cast / director / category pages built from the site's
 * OWN published reviews (AGENTS.md §3, §5).
 *
 * Rules this module enforces:
 *  - Membership is never guessed. An entity exists only when a published
 *    review names it (cast), credits it (director) or files it (genre /
 *    category). No invented people, no invented films, no padding.
 *  - A taxonomy page with FEWER THAN `TAXONOMY_MIN_INDEXABLE` reviews is
 *    `noindex, follow`. Two or more reviews makes the page indexable, and
 *    only indexable entries may enter the sitemap (AGENTS.md §5).
 *  - Slugs are the kebab-case of the display name, so the legacy corpus's
 *    `/cast/robert-de-niro/` style URLs resolve to the same entity the
 *    current site publishes. Slugging matches WordPress' sanitize_title
 *    (accents folded, apostrophes dropped) because that is what produced
 *    the legacy URLs.
 *  - A LEGACY SPELLING still resolves: the 2016-2025 site misspelled a
 *    director's name and 18 inbound links point at that misspelled path,
 *    so the resolver falls back to the canonical slug (LEGACY_TAXONOMY_
 *    ALIASES in ../legacy/taxonomy-path). An alias never invents a page.
 *  - The module is pure with respect to the store: it reads published
 *    reviews through the existing loader and never writes anything.
 */
import type { PublicReview } from "./content";
import { getLatestReviews } from "./content";
import type { TaxonomyPath, TaxonomyPathKind } from "../legacy/taxonomy-path";
import { TAXONOMY_SEGMENTS, resolveLegacyTaxonomySlug } from "../legacy/taxonomy-path";

export type { TaxonomyPath };

/** The taxonomy axes the site publishes. */
export type TaxonomyKind = TaxonomyPathKind;

/**
 * Minimum number of published reviews a taxonomy page needs before it may
 * be indexed and listed in the sitemap (AGENTS.md §5, hard policy).
 */
export const TAXONOMY_MIN_INDEXABLE = 2;

/** Every taxonomy axis the site publishes. */
export const TAXONOMY_KINDS: TaxonomyKind[] = [...TAXONOMY_SEGMENTS];

/**
 * Kebab-case slug for a taxonomy label.
 *
 * - accents folded ("Timothée" -> "timothee")
 * - apostrophes dropped, WordPress sanitize_title style ("Jack O'Connell"
 *   -> "jack-oconnell")
 * - everything else that is not a-z/0-9 becomes a single dash
 */
export function slugifyTaxonomy(value: string): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // combining accent marks
    .replace(/[\u2018\u2019\u02bc'`]/g, "") // apostrophes -> separator
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface TaxonomyEntry {
  /** Which axis the entry belongs to. */
  kind: TaxonomyKind;
  /** Kebab-case slug — the last path segment. */
  slug: string;
  /** Display name, as the site's own data spells it. */
  label: string;
  /** Site-relative path, no trailing slash (matches the canonical style). */
  path: string;
  /** Published reviews filed under this entity, newest first. */
  reviews: PublicReview[];
}

/** Site-relative path for a taxonomy entity. */
export function taxonomyPath(kind: TaxonomyKind, slug: string): string {
  return `/${kind}/${slug}`;
}

interface MutableEntry extends TaxonomyEntry {
  labelCounts: Map<string, number>;
}

function pickLabel(entry: MutableEntry): string {
  let best = entry.label;
  let bestCount = -1;
  for (const [label, count] of entry.labelCounts) {
    // Most-used spelling wins; ties break on the alphabetically first label
    // so the choice never depends on review order.
    if (count > bestCount || (count === bestCount && label < best)) {
      best = label;
      bestCount = count;
    }
  }
  return best;
}

function addEntry(
  index: Map<string, MutableEntry>,
  kind: TaxonomyKind,
  name: string,
  review: PublicReview,
): void {
  const label = name.replace(/\s+/g, " ").trim();
  if (!label) return;
  const slug = slugifyTaxonomy(label);
  if (!slug) return;
  const key = `${kind}/${slug}`;
  let entry = index.get(key);
  if (!entry) {
    entry = {
      kind,
      slug,
      label,
      path: taxonomyPath(kind, slug),
      reviews: [],
      labelCounts: new Map(),
    };
    index.set(key, entry);
  }
  entry.labelCounts.set(label, (entry.labelCounts.get(label) ?? 0) + 1);
  entry.label = pickLabel(entry);
  if (!entry.reviews.includes(review)) entry.reviews.push(review);
}

/**
 * Directors are stored as one comma-separated string ("Anthony Russo, Joe
 * Russo"). Each credited name gets its own page.
 */
function directorNames(director: string | null | undefined): string[] {
  if (!director) return [];
  return director
    .split(",")
    .map((d) => d.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Build the taxonomy index for a set of reviews.
 *
 * Exported for tests and for callers that already hold the review list.
 */
export function buildTaxonomyIndex(reviews: PublicReview[]): Map<string, TaxonomyEntry> {
  const index = new Map<string, MutableEntry>();
  for (const review of reviews) {
    for (const name of review.cast ?? []) addEntry(index, "cast", name, review);
    for (const name of directorNames(review.director)) addEntry(index, "director", name, review);
    for (const genre of review.genres ?? []) addEntry(index, "category", genre, review);
  }
  const out = new Map<string, TaxonomyEntry>();
  for (const [key, entry] of index) {
    out.set(key, {
      kind: entry.kind,
      slug: entry.slug,
      label: entry.label,
      path: entry.path,
      reviews: entry.reviews,
    });
  }
  return out;
}

function publishedReviews(): PublicReview[] {
  return getLatestReviews(5000);
}

/** The site's live taxonomy index (published reviews only). */
export function taxonomyIndex(): Map<string, TaxonomyEntry> {
  return buildTaxonomyIndex(publishedReviews());
}

/** One taxonomy entity, or null when the site publishes nothing for it. */
export function getTaxonomyEntry(kind: TaxonomyKind, slug: string): TaxonomyEntry | null {
  if (!kind || !slug) return null;
  return taxonomyIndex().get(`${kind}/${slug}`) ?? null;
}

/**
 * The entry that serves a taxonomy slug, LEGACY-ALIAS TOLERANT.
 *
 * The exact slug wins first: a page the site publishes today always beats
 * an alias row, so the alias stays inert until the credit is actually
 * corrected. Only then does the legacy spelling fall through to the
 * canonical slug (see LEGACY_TAXONOMY_ALIASES in ../legacy/taxonomy-path
 * — the 2016-2025 site misspelled "Surender Reddy", and 18 inbound links
 * point at that misspelled path).
 *
 * An alias NEVER invents a page: when neither the exact slug nor the
 * canonical target is published, this answers null and the route 404s.
 */
export function resolveTaxonomyEntry(
  kind: TaxonomyKind,
  slug: string,
): TaxonomyEntry | null {
  const direct = getTaxonomyEntry(kind, slug);
  if (direct) return direct;
  if (!kind || !slug) return null;
  const canonical = resolveLegacyTaxonomySlug(slug);
  if (!canonical || canonical === slug) return null;
  return getTaxonomyEntry(kind, canonical);
}

/**
 * Every live entry of one axis, ordered by label (stable, readable).
 */
export function taxonomyEntries(kind: TaxonomyKind): TaxonomyEntry[] {
  return [...taxonomyIndex().values()]
    .filter((e) => e.kind === kind)
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** One sibling hub: another taxonomy page built from the same reviews. */
export interface TaxonomySibling {
  kind: TaxonomyKind;
  slug: string;
  label: string;
  path: string;
  /** Number of the current entry's reviews that also belong to this hub. */
  shared: number;
}

/** Categories first, then directors, then cast — the most useful context. */
const SIBLING_KIND_ORDER: Record<TaxonomyKind, number> = {
  category: 0,
  director: 1,
  cast: 2,
};

/**
 * The other taxonomy hubs built from the SAME reviews as `entry`.
 *
 * Relevance-scored, never a link farm: a candidate's score is the number of
 * the current entry's reviews that also belong to it. The current entry is
 * never returned, and a candidate with no shared review is never returned.
 * Ties break toward the page with more published reviews, then toward
 * categories before directors before cast, then alphabetically, so the
 * block is stable across renders.
 *
 * The full index is the default because a candidate's total review count is
 * part of the ranking; a caller that already holds an index can pass it.
 * Fail-soft: if the store cannot be read, the page's own reviews are enough
 * to build a smaller index.
 */
export function siblingTaxonomies(
  entry: TaxonomyEntry,
  index?: Map<string, TaxonomyEntry>,
): TaxonomySibling[] {
  let live: Map<string, TaxonomyEntry>;
  try {
    live = index ?? taxonomyIndex();
  } catch {
    live = buildTaxonomyIndex(entry.reviews);
  }
  const own = `${entry.kind}/${entry.slug}`;
  const ownSlugs = new Set(entry.reviews.map((r) => r.slug));
  const out: Array<TaxonomySibling & { total: number }> = [];
  for (const [key, candidate] of live) {
    if (key === own) continue;
    let shared = 0;
    for (const review of candidate.reviews) {
      if (ownSlugs.has(review.slug)) shared += 1;
    }
    if (shared === 0) continue;
    out.push({
      kind: candidate.kind,
      slug: candidate.slug,
      label: candidate.label,
      path: candidate.path,
      shared,
      total: candidate.reviews.length,
    });
  }
  out.sort(
    (a, b) =>
      b.shared - a.shared ||
      b.total - a.total ||
      SIBLING_KIND_ORDER[a.kind] - SIBLING_KIND_ORDER[b.kind] ||
      a.label.localeCompare(b.label),
  );
  return out.map((s) => ({
    kind: s.kind,
    slug: s.slug,
    label: s.label,
    path: s.path,
    shared: s.shared,
  }));
}

/**
 * True when the site publishes a page for this taxonomy slug.
 *
 * Alias-tolerant: a legacy spelling that maps to a canonical slug the
 * site publishes answers true, so the legacy router never 410s a path
 * that resolves to a live page.
 *
 * Fail-soft by contract (AGENTS.md §6): any failure answers false, so the
 * legacy router passes the request through exactly as it does today.
 */
export function hasTaxonomyPage(kind: TaxonomyKind, slug: string): boolean {
  try {
    return resolveTaxonomyEntry(kind, slug) !== null;
  } catch {
    return false;
  }
}

/** Indexing policy: fewer than two reviews is `noindex, follow`. */
export function isTaxonomyIndexable(entry: TaxonomyEntry): boolean {
  return entry.reviews.length >= TAXONOMY_MIN_INDEXABLE;
}

/** The `robots` meta value for a taxonomy page. */
export function taxonomyRobots(entry: TaxonomyEntry): "index, follow" | "noindex, follow" {
  return isTaxonomyIndexable(entry) ? "index, follow" : "noindex, follow";
}

/** "2 reviews" / "1 review" — never padded. */
export function taxonomyCountText(entry: TaxonomyEntry): string {
  const n = entry.reviews.length;
  return n === 1 ? "1 review" : `${n} reviews`;
}

/**
 * The short factual intro. A page with one review says so — it never
 * implies a collection the site does not have.
 */
export function taxonomyIntro(entry: TaxonomyEntry, siteName: string): string {
  const site = siteName.trim() || "the journal";
  const many = entry.reviews.length > 1;
  if (entry.kind === "cast") {
    return many
      ? `Every ${site} review with ${entry.label}, newest first.`
      : `The only ${site} review with ${entry.label}.`;
  }
  if (entry.kind === "director") {
    return many
      ? `Every ${site} review directed by ${entry.label}, newest first.`
      : `The only ${site} review directed by ${entry.label}.`;
  }
  return many
    ? `Every ${site} review filed under ${entry.label}, newest first.`
    : `The only ${site} review filed under ${entry.label}.`;
}

/** Page title (the brand suffix is added by the meta builder). */
export function taxonomyTitle(entry: TaxonomyEntry): string {
  const one = entry.reviews.length === 1;
  if (entry.kind === "cast") return one ? `${entry.label} review` : `${entry.label} reviews`;
  if (entry.kind === "director") {
    return one ? `Review by ${entry.label}` : `Reviews by ${entry.label}`;
  }
  return one ? `${entry.label} movie review` : `${entry.label} movie reviews`;
}

/** Meta description source (length-banded by the meta builder). */
export function taxonomyDescription(entry: TaxonomyEntry, siteName: string): string {
  const site = siteName.trim() || "the journal";
  const films = entry.reviews
    .slice(0, 3)
    .map((r) => (r.year ? `${r.movieTitle} (${r.year})` : r.movieTitle))
    .join(", ");
  const lead = taxonomyIntro(entry, site).replace(/\.$/, "");
  return films ? `${lead}: ${films}.` : `${lead}.`;
}

export interface TaxonomyPageMeta {
  entry: TaxonomyEntry;
  kind: TaxonomyKind;
  slug: string;
  path: string;
  title: string;
  description: string;
  intro: string;
  countText: string;
  robots: "index, follow" | "noindex, follow";
}

/**
 * Everything a taxonomy route needs. Returns null when the site publishes
 * no such entity — the route then answers 404 (never a padded page).
 *
 * Alias-tolerant: a legacy spelling resolves to the canonical entry, and
 * the meta it returns carries the CANONICAL path — so a page ever served
 * under a legacy slug still points its canonical link at the live URL.
 */
export function taxonomyPageMeta(
  kind: TaxonomyKind,
  slug: string,
  siteName: string,
): TaxonomyPageMeta | null {
  const entry = resolveTaxonomyEntry(kind, slug);
  if (!entry) return null;
  return {
    entry,
    kind,
    slug: entry.slug,
    path: entry.path,
    title: taxonomyTitle(entry),
    description: taxonomyDescription(entry, siteName),
    intro: taxonomyIntro(entry, siteName),
    countText: taxonomyCountText(entry),
    robots: taxonomyRobots(entry),
  };
}

// ---------------------------------------------------------------------------
// At a glance (PS-3)
// ---------------------------------------------------------------------------

export interface TaxonomyFactLink {
  label: string;
  path: string;
}

export interface TaxonomyFact {
  label: string;
  /** Plain value, used when the fact has no links. */
  value?: string;
  /** Linked values (genres, directors, cast), already ranked. */
  links?: TaxonomyFactLink[];
}

export interface TaxonomyGlance {
  facts: TaxonomyFact[];
  /** One short paragraph: what this page covers and what it does not. */
  scope: string;
}

/** Count each value once per review (a duplicated credit is not two credits). */
function countOncePerReview(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of new Set(values.map((v) => v.replace(/\s+/g, " ").trim()).filter(Boolean))) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/** Merge per-review counts into one corpus count. */
function addCounts(target: Map<string, number>, source: Map<string, number>): void {
  for (const [value, count] of source) {
    target.set(value, (target.get(value) ?? 0) + count);
  }
}

/** Ranked links for one taxonomy axis, most-used first, ties alphabetical. */
function rankedLinks(
  counts: Map<string, number>,
  kind: TaxonomyKind,
  limit: number,
  excludeSlug?: string,
): TaxonomyFactLink[] {
  return [...counts.entries()]
    .filter(([label]) => {
      const slug = slugifyTaxonomy(label);
      return slug !== "" && slug !== excludeSlug;
    })
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label]) => ({
      label,
      path: taxonomyPath(kind, slugifyTaxonomy(label)),
    }));
}

/**
 * The data-driven "At a glance" block for a taxonomy page.
 *
 * Every value is computed from the entry's own published reviews. A fact
 * with nothing to say is omitted, never printed as an empty row. The scope
 * paragraph states the limit honestly: this is a review index, not a
 * filmography or a complete genre survey.
 */
export function taxonomyGlance(entry: TaxonomyEntry): TaxonomyGlance {
  const reviews = entry.reviews;
  const facts: TaxonomyFact[] = [
    { label: "Reviews", value: taxonomyCountText(entry) },
  ];

  const years = reviews
    .map((review) => review.year)
    .filter((year): year is number => typeof year === "number" && year > 0);
  if (years.length > 0) {
    const min = Math.min(...years);
    const max = Math.max(...years);
    facts.push({ label: "Years", value: min === max ? String(min) : `${min}-${max}` });
  }

  const genreCounts = new Map<string, number>();
  const directorCounts = new Map<string, number>();
  const castCounts = new Map<string, number>();
  for (const review of reviews) {
    addCounts(genreCounts, countOncePerReview(review.genres ?? []));
    addCounts(directorCounts, countOncePerReview(directorNames(review.director)));
    addCounts(castCounts, countOncePerReview(review.cast ?? []));
  }

  const genreLinks =
    entry.kind === "category"
      ? rankedLinks(genreCounts, "category", 3, entry.slug)
      : rankedLinks(genreCounts, "category", 4);
  if (genreLinks.length > 0) {
    facts.push({
      label: entry.kind === "category" ? "Related genres" : "Genres",
      links: genreLinks,
    });
  }

  if (entry.kind !== "director") {
    const directorLinks = rankedLinks(directorCounts, "director", 4);
    if (directorLinks.length > 0) {
      facts.push({ label: "Directors", links: directorLinks });
    }
  }

  if (entry.kind !== "cast") {
    const frequentCast = new Map(
      [...castCounts].filter(([, count]) => count >= 2),
    );
    const castLinks = rankedLinks(frequentCast, "cast", 3);
    if (castLinks.length > 0) {
      facts.push({ label: "Frequent cast", links: castLinks });
    }
  }

  const scope =
    entry.kind === "cast"
      ? `This is a review index, not a filmography. A film appears only when the site has published a review that credits ${entry.label} in the cast. The list is ordered newest first, and every entry links to the full review.`
      : entry.kind === "director"
        ? `This is a review index, not a complete filmography. A film appears only when the site has published a review of a film directed by ${entry.label}. The list is ordered newest first, and every entry links to the full review.`
        : `This is a review index, not a complete genre survey. A film appears only when the site has published a review filed under ${entry.label}. The list is ordered newest first, and every entry links to the full review.`;

  return { facts, scope };
}
