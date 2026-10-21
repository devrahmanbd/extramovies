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
 *  - The module is pure with respect to the store: it reads published
 *    reviews through the existing loader and never writes anything.
 */
import type { PublicReview } from "./content";
import { getLatestReviews } from "./content";
import type { TaxonomyPath, TaxonomyPathKind } from "../legacy/taxonomy-path";
import { TAXONOMY_SEGMENTS } from "../legacy/taxonomy-path";

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
 * Every live entry of one axis, ordered by label (stable, readable).
 */
export function taxonomyEntries(kind: TaxonomyKind): TaxonomyEntry[] {
  return [...taxonomyIndex().values()]
    .filter((e) => e.kind === kind)
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * True when the site publishes a page for this taxonomy slug.
 *
 * Fail-soft by contract (AGENTS.md §6): any failure answers false, so the
 * legacy router passes the request through exactly as it does today.
 */
export function hasTaxonomyPage(kind: TaxonomyKind, slug: string): boolean {
  try {
    return getTaxonomyEntry(kind, slug) !== null;
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
 */
export function taxonomyPageMeta(
  kind: TaxonomyKind,
  slug: string,
  siteName: string,
): TaxonomyPageMeta | null {
  const entry = getTaxonomyEntry(kind, slug);
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
