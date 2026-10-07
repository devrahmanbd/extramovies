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

export function organizationJsonLd(brand: Brand): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: brand.name,
    url: `${brand.origin}/`,
    description: brand.description,
    ...(brand.logo ? { logo: brand.logo } : {}),
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
      ...(brand.logo ? { logo: { "@type": "ImageObject", url: brand.logo } } : {}),
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
