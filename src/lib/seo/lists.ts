/**
 * Editorial lists — the supporting, non-review content type (TM-3, QS-3).
 *
 * WHAT THIS IS: a small, curated set of list pages built from reviews the
 * site already publishes. A list never creates a review, never invents a
 * rating, and never pads itself with a title the site has not covered. The
 * definition here is a set of slugs plus the editorial copy; the resolver
 * drops a slug that is missing, unpublished, or unscored.
 *
 * WHY CODE AND NOT A STORE ROW: the list pages are shared starter content
 * (the same role the DEMO reviews play). The copy is brand-neutral: it says
 * "our archive", never a hardcoded brand name. A brand with none of the
 * listed reviews renders no list, so the pages cannot leak one site's
 * editorial voice onto another. When per-brand lists are needed, move the
 * definitions to a store-backed collection and keep this module as the
 * fallback.
 *
 * INDEXING POLICY: a list with fewer than LIST_MIN_INDEXABLE published
 * reviews is `noindex, follow` and stays out of the hub and the sitemap.
 * A list with zero published reviews answers 404. This mirrors the
 * taxonomy policy in ./taxonomy.ts.
 */
import type { PublicReview } from "./content";
import { getLatestReviews } from "./content";
import type { JsonLd } from "./jsonld";
import { breadcrumbJsonLd } from "./jsonld";

/** Minimum number of resolved reviews before a list may be indexed. */
export const LIST_MIN_INDEXABLE = 3;

export interface EditorialListItem {
  /** Review slug. The resolver drops it when the site does not publish it. */
  slug: string;
}

export interface EditorialList {
  /** Last path segment: /lists/<slug>. */
  slug: string;
  /** H1. */
  title: string;
  /** Base page title (the brand suffix is added by the layout). */
  seoTitle: string;
  /** Meta description source. */
  description: string;
  /** Opening paragraphs, rendered above the list. */
  intro: string[];
  /** How the list was chosen. Rendered as a short editorial note. */
  method: string;
  /** ISO date used for the sitemap lastmod. */
  updated: string;
  /** Human date printed on the page. */
  updatedLabel: string;
  /** Curated slugs, in the editor's order. The renderer re-sorts by rating. */
  items: EditorialListItem[];
  /** Category slugs linked from the list's "read next" block. */
  relatedCategories: string[];
  /** Other list slugs linked from the list's "read next" block. */
  relatedLists: string[];
}

export interface ResolvedListItem {
  review: PublicReview;
}

/**
 * The starter lists. Every film named here has a published review on the
 * production site; the resolver still treats each slug as optional so a
 * different brand, a local store, or an unpublished review fails soft.
 */
export const EDITORIAL_LISTS: readonly EditorialList[] = [
  {
    slug: "best-films-2026",
    title: "Best films of 2026 (so far), ranked by our verdicts",
    seoTitle: "Best Films of 2026 (So Far): Our Ranked Verdicts",
    description:
      "The ten 2026 films with the highest scores in our archive, ranked by our rating out of ten, with the verdict and where-to-watch details from each review.",
    intro: [
      "The 2026 release calendar has produced more films than any one desk can cover, so this list does what a review archive should do: it puts the strongest verdicts first. These are the ten 2026 releases that earned the highest scores in our archive at the time of writing.",
      "The order is the rating, not the marketing budget. Every entry links to the full review, where the argument, the score and the where-to-watch details live. We refresh the list when a new 2026 review earns a place.",
    ],
    method:
      "Every published review of a 2026 release is eligible. We rank by the score the review earned, highest first, and break ties by the most recent review. A film does not buy a place, and the score is the one the review already carries.",
    updated: "2026-11-07",
    updatedLabel: "7 November 2026",
    items: [
      { slug: "you-can-see-everything-2026-review" },
      { slug: "the-odyssey-2026-review" },
      { slug: "resident-evil-2026-review" },
      { slug: "coyote-vs-acme-2026-review" },
      { slug: "toy-story-5-2026-review" },
      { slug: "disclosure-day-2026-review" },
      { slug: "jailer-2-2026-review" },
      { slug: "sense-and-sensibility-2026-review" },
      { slug: "spider-man-brand-new-day-2026-review" },
      { slug: "hope-2026-review" },
    ],
    relatedCategories: ["action", "science-fiction", "animation", "family", "horror"],
    relatedLists: ["best-action-movies", "indian-cinema"],
  },
  {
    slug: "indian-cinema",
    title: "Indian cinema we've reviewed, ranked by our verdicts",
    seoTitle: "Indian Cinema Reviews: Our Ranked Verdicts",
    description:
      "Six Indian films from the archive, across Hindi, Tamil and Telugu cinema, ranked by the score each review earned, with a one-line verdict and the review link.",
    intro: [
      "Indian cinema is not one industry, one language or one mood. This list collects the Indian films the archive has reviewed so far, from a 2015 Hindi drama to the 2026 Telugu and Tamil releases in the current archive.",
      "The ranking is the review score, highest first. It is a reading list, not a claim about the whole of Indian cinema, and it grows as the archive grows.",
    ],
    method:
      "The list includes published reviews of Indian films across the archive. We rank by the score the review earned, highest first, and break ties by the most recent review. A title joins the list only when its review is published on the site.",
    updated: "2026-11-07",
    updatedLabel: "7 November 2026",
    items: [
      { slug: "jailer-2-2026-review" },
      { slug: "dhruva-2016-review" },
      { slug: "gandhi-talks-2026-review" },
      { slug: "peddi-2026-review" },
      { slug: "masaan-2015-review" },
      { slug: "pati-patni-aur-woh-do-2026-review" },
    ],
    relatedCategories: ["drama", "action", "comedy"],
    relatedLists: ["best-films-2026", "best-action-movies"],
  },
  {
    slug: "best-action-movies",
    title: "Best action movies we've reviewed, ranked",
    seoTitle: "Best Action Movies We've Reviewed, Ranked",
    description:
      "The ten action films that earned the highest scores in our review archive, from Top Gun: Maverick to Spider-Man: Brand New Day, ranked by our verdicts.",
    intro: [
      "Action is the genre the archive covers most often, and the spread is wide: a 2022 Top Gun sequel, a 2019 Avengers finale, a 2016 Deadpool, and the Indian action films that sit between them. This list takes the ten action films with the highest scores in the archive.",
      "It is not the full action archive. For that, use the category hub. This list is the short version: the action films that earned the strongest verdicts, ranked by the score each review carries.",
    ],
    method:
      "The list includes published reviews of action films in the archive. We rank by the score the review earned, highest first, and break ties by the most recent review. The full action archive stays on the category hub, and a film joins this list only when its review is published.",
    updated: "2026-11-07",
    updatedLabel: "7 November 2026",
    items: [
      { slug: "top-gun-maverick-2022-review" },
      { slug: "avengers-endgame-2019-review" },
      { slug: "sicario-2015-review" },
      { slug: "the-odyssey-2026-review" },
      { slug: "the-bourne-identity-2002-review" },
      { slug: "deadpool-2016-review" },
      { slug: "mission-impossible-the-final-reckoning-2025-review" },
      { slug: "dhruva-2016-review" },
      { slug: "jailer-2-2026-review" },
      { slug: "spider-man-brand-new-day-2026-review" },
    ],
    relatedCategories: ["action", "action-adventure", "adventure"],
    relatedLists: ["best-films-2026", "indian-cinema"],
  },
];

/** Site-relative path for a list. */
export function listPath(slug: string): string {
  return `/lists/${slug}`;
}

/** Every list definition, in editorial order. */
export function editorialLists(): EditorialList[] {
  return [...EDITORIAL_LISTS];
}

/** One list definition by slug, or null when the slug is unknown. */
export function getEditorialList(slug: string): EditorialList | null {
  const clean = typeof slug === "string" ? slug.trim().toLowerCase() : "";
  if (!clean) return null;
  return EDITORIAL_LISTS.find((list) => list.slug === clean) ?? null;
}

/**
 * Resolve a list's curated slugs against the site's published reviews.
 *
 * Fail-soft rules:
 *  - a slug the site does not publish is dropped, not replaced;
 *  - a review with no score (rating <= 0) is dropped, because a ranked list
 *    cannot rank an unscored review;
 *  - the output is sorted by rating (descending), then by the most recently
 *    updated review, then by title, so the order is deterministic.
 *
 * The caller may pass an already-loaded review array (the sitemap and the
 * hub load the store once and resolve several lists).
 */
export function resolveListItems(
  list: EditorialList,
  reviews?: PublicReview[],
): ResolvedListItem[] {
  const all = reviews ?? getLatestReviews(5000);
  const bySlug = new Map<string, PublicReview>();
  for (const review of all) {
    if (!review || typeof review.slug !== "string") continue;
    if (typeof review.rating !== "number" || !Number.isFinite(review.rating)) continue;
    if (review.rating <= 0) continue;
    bySlug.set(review.slug, review);
  }
  const out: ResolvedListItem[] = [];
  for (const item of list.items) {
    const review = bySlug.get(item.slug);
    if (!review) continue;
    out.push({ review });
  }
  out.sort(
    (a, b) =>
      b.review.rating - a.review.rating ||
      String(b.review.updatedAt).localeCompare(String(a.review.updatedAt)) ||
      a.review.movieTitle.localeCompare(b.review.movieTitle),
  );
  return out;
}

/** A list is indexable when it has enough resolved reviews to be useful. */
export function listIsIndexable(items: ResolvedListItem[]): boolean {
  return items.length >= LIST_MIN_INDEXABLE;
}

/** BreadcrumbList + CollectionPage/ItemList for a list page. */
export function listJsonLd(
  list: EditorialList,
  items: ResolvedListItem[],
  origin: string,
): JsonLd[] {
  const base = origin.replace(/\/$/, "");
  const path = listPath(list.slug);
  return [
    breadcrumbJsonLd(origin, [
      { name: "Home", path: "/" },
      { name: "Lists", path: "/lists" },
      { name: list.title, path },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: list.title,
      description: list.description,
      url: `${base}${path}`,
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: items.length,
        itemListOrder: "https://schema.org/ItemListOrderDescending",
        itemListElement: items.map((item, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: item.review.movieTitle,
          url: `${base}/reviews/${item.review.slug}`,
        })),
      },
    },
  ];
}
