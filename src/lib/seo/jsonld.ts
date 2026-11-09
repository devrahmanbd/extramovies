/**
 * JSON-LD builders (schema-markup skill).
 * Rules enforced here:
 * - JSON-LD only, ISO 8601 dates, matches visible page content.
 * - Review carries MY rating only — never a fabricated aggregateRating.
 * - No FAQ schema, no keyword stuffing.
 */
import { BRAND_ALTERNATE_NAMES, type Brand } from "./brand";
import type { PublicReview } from "./content";
import { displayAuthor } from "../site-author";
import type { ReviewMediaType } from "../tmdb/media-type";
import { slugifyTaxonomy } from "./taxonomy";

export type JsonLd = Record<string, unknown>;

/** Prefix root-relative asset paths with the (request) origin; pass through absolute URLs. */
function absolutize(origin: string, p: string): string {
  if (/^https?:\/\//i.test(p)) return p;
  return `${origin.replace(/\/$/, "")}${p.startsWith("/") ? p : `/${p}`}`;
}

/**
 * One Person node per credited director. A combined credit ("Anthony Russo,
 * Joe Russo") is two people, not one person with a comma in their name.
 */
function directorNodes(director: string | null | undefined): JsonLd[] {
  if (!director) return [];
  return director
    .split(",")
    .map((d) => d.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((name) => ({ "@type": "Person", name }));
}

/** `director` field: a single Person, or an array when the credit is shared. */
function directorField(director: string | null | undefined): JsonLd {
  const nodes = directorNodes(director);
  if (nodes.length === 0) return {};
  return { director: nodes.length === 1 ? nodes[0] : nodes };
}

/**
 * Author node shared by Article and Review. The `url` points at the byline's
 * own profile page; `worksFor` names the publication. Both are omitted when
 * the caller supplies no origin (unit tests build nodes with a bare brand).
 */
function authorNode(review: PublicReview, brand: Brand): JsonLd {
  const name = displayAuthor(review.authorName);
  const origin =
    typeof brand?.origin === "string" ? brand.origin.replace(/\/+$/, "") : "";
  const node: JsonLd = { "@type": "Person", name };
  if (origin) {
    node.url = `${origin}/author/${slugifyTaxonomy(name)}`;
    if (brand.name) {
      node.worksFor = {
        "@type": "Organization",
        name: brand.name,
        url: `${origin}/`,
      };
    }
  }
  return node;
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
function tmdbSourceUrl(
  tmdbId: number | null | undefined,
  mediaType: ReviewMediaType | null = "movie",
): string | null {
  if (typeof tmdbId !== "number" || !Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
    return null;
  }
  const path = mediaType === "tv" ? "tv" : "movie";
  return `https://www.themoviedb.org/${path}/${tmdbId}`;
}

export function websiteJsonLd(brand: Brand): JsonLd {
  // The other spellings of this site ("extramovies", "extramovies.org").
  // ONE WebSite node, never a second block: Google offers these as
  // site-name alternatives when its automated system does not pick the
  // brand name on its own. The list is per site — see BRAND_ALTERNATE_NAMES.
  const alternateName = BRAND_ALTERNATE_NAMES(brand);
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: brand.name,
    ...(alternateName.length > 0 ? { alternateName } : {}),
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
 * One array, one place, every page that emits the Organization node. A URL
 * goes here ONLY when the profile exists and is ours: a sameAs pointing at a
 * page that does not exist is a false claim to a crawler. The link has to be
 * reciprocal for the claim to hold, so each profile's website field carries
 * https://extramovies.org?utm_source=profile&utm_medium=parasite&utm_campaign=brand-2026
 * (the fixed values live in docs/parasite/profile-kit/consistency-matrix.md).
 *
 * Add new profiles one per line when the owner creates them:
 *
 *   "https://www.youtube.com/@<handle>",
 *   "https://medium.com/@<handle>",
 */
export const BRAND_SAME_AS: string[] = ["https://letterboxd.com/extramovies/"];

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
    // The public standards page: a verifiable signal that the entity has a
    // published editorial process, not just a claim on an About page.
    publishingPrinciples: absolutize(brand.origin, "/editorial-policy"),
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

/**
 * The Movie/TVSeries fields shared by the standalone movie node and the
 * Review's itemReviewed node. Only facts the row carries: a missing studio,
 * country, language, certification, franchise or release date drops its key
 * instead of printing an empty claim. Budget and box office are not schema.org
 * Movie properties, so they stay in the visible fact card only.
 */
function movieCoreFields(
  review: PublicReview,
  mediaType: ReviewMediaType | null = "movie",
): JsonLd {
  const isSeries = mediaType === "tv";
  const source = tmdbSourceUrl(review.tmdbId, mediaType);
  const clean = (value: string) => value.replace(/\s+/g, " ").trim();
  const studios = (review.studios ?? []).map(clean).filter(Boolean);
  const countries = (review.countries ?? []).map(clean).filter(Boolean);
  const languages = (review.languages ?? []).map(clean).filter(Boolean);
  const certification =
    typeof review.certification === "string" ? clean(review.certification) : "";
  const collection =
    typeof review.collection === "string" ? clean(review.collection) : "";
  const releaseDate =
    typeof review.releaseDate === "string" ? review.releaseDate.trim() : "";
  return {
    name: review.movieTitle,
    ...(review.year ? { dateCreated: String(review.year) } : {}),
    ...(releaseDate ? { datePublished: releaseDate } : {}),
    ...(review.genres.length > 0 ? { genre: review.genres } : {}),
    // The TMDB record is the same title, not a source the title is based on.
    // `sameAs` is the disambiguating identifier; `isBasedOn` stays on the
    // Review node (see tmdbSourceUrl).
    ...(source ? { sameAs: source } : {}),
    // A series row's `director` field is the show's credited creator/director
    // as the editor stored it, not a per-episode director. Do not claim it as
    // a Movie director on a TVSeries node.
    ...(isSeries ? {} : directorField(review.director)),
    ...(review.posterUrl ? { image: review.posterUrl } : {}),
    ...(studios.length > 0
      ? {
          productionCompany: studios.map((name) => ({
            "@type": "Organization",
            name,
          })),
        }
      : {}),
    ...(countries.length > 0
      ? {
          countryOfOrigin: countries.map((name) => ({
            "@type": "Country",
            name,
          })),
        }
      : {}),
    ...(languages.length > 0
      ? { inLanguage: languages.length === 1 ? languages[0] : languages }
      : {}),
    ...(certification ? { contentRating: certification } : {}),
    ...(!isSeries && collection
      ? { isPartOf: { "@type": "CreativeWorkSeries", name: collection } }
      : {}),
  };
}

export function movieJsonLd(
  review: PublicReview,
  origin: string,
  mediaType: ReviewMediaType | null = "movie",
): JsonLd {
  void origin;
  return {
    "@context": "https://schema.org",
    "@type": mediaType === "tv" ? "TVSeries" : "Movie",
    ...movieCoreFields(review, mediaType),
  };
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
    author: authorNode(review, brand),
    publisher: {
      "@type": "Organization",
      name: brand.name,
      url: `${brand.origin.replace(/\/+$/, "")}/`,
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
  canonical: string,
  mediaType: ReviewMediaType | null = "movie",
): JsonLd {
  // Authority claim: the review is grounded in the title's TMDB record.
  // Review node only (never the itemReviewed node — see tmdbSourceUrl).
  // Emitted only when a valid TMDB id exists.
  const isSeries = mediaType === "tv";
  const source = tmdbSourceUrl(review.tmdbId, mediaType);
  return {
    "@context": "https://schema.org",
    "@type": "Review",
    author: authorNode(review, brand),
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
      "@type": isSeries ? "TVSeries" : "Movie",
      ...movieCoreFields(review, mediaType),
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    inLanguage: "en",
  };
}

/**
 * ProfilePage for a byline. The Person node carries the canonical byline URL,
 * the description, and the publication it works for; no credentials or
 * sameAs claims are invented.
 */
export function authorProfileJsonLd(
  name: string,
  brand: Brand,
  canonical: string,
  description: string,
): JsonLd {
  const origin =
    typeof brand?.origin === "string" ? brand.origin.replace(/\/+$/, "") : "";
  const person: JsonLd = {
    "@type": "Person",
    name,
    url: canonical,
    description,
  };
  if (origin && brand.name) {
    person.worksFor = {
      "@type": "Organization",
      name: brand.name,
      url: `${origin}/`,
    };
  }
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    name: `${name} | ${brand.name}`,
    url: canonical,
    description,
    mainEntity: person,
  };
}

export function serializeJsonLd(nodes: JsonLd[]): string {
  return nodes.map((n) => JSON.stringify(n)).join("\n");
}
