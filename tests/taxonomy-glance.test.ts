import { describe, it, expect } from "vitest";
import type { PublicReview } from "../src/lib/seo/content";
import {
  buildTaxonomyIndex,
  taxonomyGlance,
  type TaxonomyEntry,
} from "../src/lib/seo/taxonomy";

/**
 * PS-3: the data-driven "At a glance" block on taxonomy pages.
 *
 * Every fact is computed from the entry's own reviews. These tests pin the
 * fail-soft rule (no empty rows), the kind-specific facts (a director page
 * does not repeat the director, a cast page does not repeat the cast) and
 * the honest scope paragraph.
 */

function review(
  overrides: Partial<PublicReview> & { slug: string; movieTitle: string },
): PublicReview {
  return {
    slug: overrides.slug,
    reviewTitle: `${overrides.movieTitle} review`,
    movieTitle: overrides.movieTitle,
    year: 2026,
    genres: [],
    runtimeMinutes: null,
    rating: 7,
    verdict: "A verdict.",
    excerpt: "An excerpt.",
    bodyMarkdown: "Body.",
    posterUrl: null,
    backdropUrl: null,
    director: null,
    cast: [],
    publishedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    authorName: "The Editor",
    providers: null,
    tmdbId: null,
    ...overrides,
  };
}

function entry(kind: "cast" | "director" | "category", slug: string, reviews: PublicReview[]): TaxonomyEntry {
  const found = buildTaxonomyIndex(reviews).get(`${kind}/${slug}`);
  if (!found) throw new Error(`missing taxonomy entry ${kind}/${slug}`);
  return found;
}

const corpus: PublicReview[] = [
  review({
    slug: "a",
    movieTitle: "A",
    year: 2016,
    genres: ["Action", "Drama"],
    director: "Director One",
    cast: ["Fixture Person", "Co-Star"],
  }),
  review({
    slug: "b",
    movieTitle: "B",
    year: 2026,
    genres: ["Action", "Thriller"],
    director: "Director Two",
    cast: ["Fixture Person", "Co-Star"],
  }),
];

describe("taxonomyGlance: cast page", () => {
  it("counts reviews and years, ranks genres and directors, and does not repeat the cast member", () => {
    const glance = taxonomyGlance(entry("cast", "fixture-person", corpus));
    const labels = glance.facts.map((fact) => fact.label);
    expect(labels).toEqual(["Reviews", "Years", "Genres", "Directors"]);

    const byLabel = new Map(glance.facts.map((fact) => [fact.label, fact]));
    expect(byLabel.get("Reviews")?.value).toBe("2 reviews");
    expect(byLabel.get("Years")?.value).toBe("2016-2026");
    expect(byLabel.get("Genres")?.links?.map((link) => link.label)).toEqual([
      "Action",
      "Drama",
      "Thriller",
    ]);
    expect(byLabel.get("Directors")?.links?.map((link) => link.label)).toEqual([
      "Director One",
      "Director Two",
    ]);
    expect(glance.scope).toContain("not a filmography");
    expect(glance.scope).toContain("Fixture Person");
  });
});

describe("taxonomyGlance: director page", () => {
  it("omits the director row and shows only recurring cast", () => {
    const reviews = [
      review({
        slug: "c",
        movieTitle: "C",
        year: 2020,
        genres: ["Drama"],
        director: "Solo Director",
        cast: ["Recurring Actor", "One-Off Actor"],
      }),
      review({
        slug: "d",
        movieTitle: "D",
        year: 2021,
        genres: ["Drama"],
        director: "Solo Director",
        cast: ["Recurring Actor"],
      }),
    ];
    const glance = taxonomyGlance(entry("director", "solo-director", reviews));
    const labels = glance.facts.map((fact) => fact.label);
    expect(labels).toEqual(["Reviews", "Years", "Genres", "Frequent cast"]);
    const byLabel = new Map(glance.facts.map((fact) => [fact.label, fact]));
    expect(byLabel.get("Frequent cast")?.links?.map((link) => link.label)).toEqual([
      "Recurring Actor",
    ]);
    expect(glance.scope).toContain("not a complete filmography");
    expect(glance.scope).toContain("Solo Director");
  });
});

describe("taxonomyGlance: category page", () => {
  it("shows related genres without repeating the category, plus directors and recurring cast", () => {
    const glance = taxonomyGlance(entry("category", "action", corpus));
    const labels = glance.facts.map((fact) => fact.label);
    expect(labels).toEqual([
      "Reviews",
      "Years",
      "Related genres",
      "Directors",
      "Frequent cast",
    ]);
    const byLabel = new Map(glance.facts.map((fact) => [fact.label, fact]));
    expect(byLabel.get("Related genres")?.links?.map((link) => link.label)).toEqual([
      "Drama",
      "Thriller",
    ]);
    expect(byLabel.get("Frequent cast")?.links?.map((link) => link.label)).toEqual([
      "Co-Star",
      "Fixture Person",
    ]);
    expect(glance.scope).toContain("not a complete genre survey");
    expect(glance.scope).toContain("Action");
  });
});

describe("taxonomyGlance: fail-soft", () => {
  it("never prints an empty fact row", () => {
    const castGlance = taxonomyGlance(
      entry("cast", "someone", [
        review({
          slug: "f",
          movieTitle: "F",
          year: 2024,
          genres: [],
          director: null,
          cast: ["Someone"],
        }),
      ]),
    );
    expect(castGlance.facts.map((fact) => fact.label)).toEqual(["Reviews", "Years"]);
  });
});
