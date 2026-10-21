/**
 * JSON-LD builders (schema-markup skill).
 * Rules enforced here:
 * - JSON-LD only, ISO 8601 dates, matches visible page content.
 * - Review carries MY rating only — never a fabricated aggregateRating.
 * - No FAQ schema, no keyword stuffing.
 */
import type { Brand } from "./brand";
import type { PublicReview } from "./content";
import { displayAuthor } from "../site-author";

export type JsonLd = Record<string, unknown>;

/** Prefix root-relative asset paths with the (request) origin; pass through absolute URLs. */
function absolutize(origin: string, p: string): string {
  if (/^https?:\/\//i.test(p)) return p;
  return `${origin.replace(/\/$/, "")}${p.startsWith("/") ? p : `/${p}`}`;
}

/**
 * Canonical TMDB page for a title — the source record a review is based on.
 * Same URL the visible "View on TMDB" link points at, so the schema matches
 * the page. Null when the id is missing/invalid: no invented source links.
 *
 * Review node only. A Movie node carrying `isBasedOn` would claim the film is
 * based on itself (the TMDB page for the same film) — a self-referential
 * false claim to a crawler.
 */
function tmdbSourceUrl(tmdbId: number | null | undefined): string | null {
  if (typeof tmdbId !== "number" || !Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
    return null;
  }
  return `https://www.themoviedb.org/movie/${tmdbId}`;
}

export function websiteJsonLd(brand: Brand): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: brand.name,
    url: `${brand.origin}/`,
    description: brand.description,
    inLanguage: brand.locale.replace("_", "-"),
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${brand.origin}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * sameAs profiles for the Organization node.
 *
 * EMPTY ON PURPOSE: this brand has no Letterboxd, YouTube, Medium, Reddit or
 * X profile yet, and a sameAs pointing at a page that does not exist is a
 * false claim to a crawler.
 *
 * When the owner publishes those profiles (the parasite drafts live under
 * docs/parasite/), add the URLs here, one per line. One array, one place,
 * every page that emits the Organization node:
 *
 *   export const BRAND_SAME_AS: string[] = [
 *     "https://letterboxd.com/<user>",
 *   ];
 */
export const BRAND_SAME_AS: string[] = [];

/** The site's ONE Organization node (the entity behind the brand). */
export function organizationJsonLd(brand: Brand): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: brand.name,
    url: `${brand.origin}/`,
    description: brand.description,
    // Brand logos are root-relative (multi-site safe); schema.org wants
    // absolute, so prefix the request origin (callers override brand.origin).
    ...(brand.logo ? { logo: absolutize(brand.origin, brand.logo) } : {}),
    // Emitted only when the owner has real profiles (see BRAND_SAME_AS).
    ...(BRAND_SAME_AS.length > 0 ? { sameAs: [...BRAND_SAME_AS] } : {}),
  };
}

/**
 * The About page node.
 *
 * The entity itself is the Organization node above (exactly one per page).
 * This node describes the PAGE, so it carries no second Organization and no
 * second copy of the brand entity.
 */
export function aboutPageJsonLd(
  brand: Brand,
  canonical: string,
  description: string,
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: `About ${brand.name}`,
    description,
    url: canonical,
    inLanguage: brand.locale.replace("_", "-"),
  };
}

export function breadcrumbJsonLd(
  origin: string,
  trail: Array<{ name: string; path: string }>
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: `${origin.replace(/\/$/, "")}${t.path}`,
    })),
  };
}

export function movieJsonLd(review: PublicReview, origin: string): JsonLd {
  void origin;
  const movie: JsonLd = {
    "@context": "https://schema.org",
    "@type": "Movie",
    name: review.movieTitle,
    ...(review.year ? { dateCreated: String(review.year) } : {}),
    ...(review.genres.length > 0 ? { genre: review.genres } : {}),
    ...(review.director ? { director: { "@type": "Person", name: review.director } } : {}),
    ...(review.posterUrl ? { image: review.posterUrl } : {}),
  };
  return movie;
}

export function articleJsonLd(
  review: PublicReview,
  brand: Brand,
  canonical: string
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: review.reviewTitle,
    description: review.excerpt,
    image: review.backdropUrl ?? review.posterUrl ?? undefined,
    datePublished: review.publishedAt,
    dateModified: review.updatedAt,
    author: { "@type": "Person", name: displayAuthor(review.authorName) },
    publisher: {
      "@type": "Organization",
      name: brand.name,
      ...(brand.logo ? { logo: { "@type": "ImageObject", url: absolutize(brand.origin, brand.logo) } } : {}),
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    inLanguage: brand.locale.replace("_", "-"),
  };
}

/**
 * My review, my score. `reviewRating` is the author's own rating;
 * no `aggregateRating` is ever emitted (we have one critic, not a crowd).
 */
export function myReviewJsonLd(
  review: PublicReview,
  brand: Brand,
  canonical: string
): JsonLd {
  void brand;
  // Authority claim: the review is grounded in the film's TMDB record.
  // Review node only (never the itemReviewed Movie — see tmdbSourceUrl).
  // Emitted only when a valid TMDB id exists.
  const source = tmdbSourceUrl(review.tmdbId);
  return {
    "@context": "https://schema.org",
    "@type": "Review",
    author: { "@type": "Person", name: displayAuthor(review.authorName) },
    datePublished: review.publishedAt,
    reviewBody: review.excerpt,
    reviewRating: {
      "@type": "Rating",
      ratingValue: review.rating,
      bestRating: 10,
      worstRating: 0,
    },
    ...(source ? { isBasedOn: source } : {}),
    itemReviewed: {
      "@type": "Movie",
      name: review.movieTitle,
      ...(review.year ? { dateCreated: String(review.year) } : {}),
      ...(review.genres.length > 0 ? { genre: review.genres } : {}),
      ...(review.director ? { director: { "@type": "Person", name: review.director } } : {}),
      ...(review.posterUrl ? { image: review.posterUrl } : {}),
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    inLanguage: "en",
  };
}

export function serializeJsonLd(nodes: JsonLd[]): string {
  return nodes.map((n) => JSON.stringify(n)).join("\n");
}
