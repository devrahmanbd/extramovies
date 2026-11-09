import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { experimental_AstroContainer } from "astro/container";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import KeyFacts from "../src/components/public/KeyFacts.astro";
import { keyFactRows, moneyFact } from "../src/lib/seo/key-facts";
import { movieJsonLd, myReviewJsonLd } from "../src/lib/seo/jsonld";
import type { PublicReview } from "../src/lib/seo/content";

/**
 * EN-2: TMDB metadata on review pages — money formatting, key-fact rows,
 * JSON-LD movie fields, the store mapping, and export/import portability.
 *
 * Every value here comes from a field the row carries: a review without
 * metadata emits no rows and no schema keys, never an empty label or a "$0".
 * The fact-card assertions run against the real KeyFacts markup (the same
 * harness as tests/geo-key-facts.test.ts), not a re-implementation.
 */

async function render(Component: unknown, props: Record<string, unknown>): Promise<string> {
  const container = await experimental_AstroContainer.create();
  return container.renderToString(Component as never, { props });
}

/** Every rendered label/value pair, in order. */
function rows(html: string): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const re = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    out.push({ label: match[1]!.trim(), value: match[2]!.trim() });
  }
  return out;
}

const FULL_REVIEW: PublicReview = {
  slug: "dune-part-two",
  reviewTitle: "Dune: Part Two Earns Every Minute of Its Desert",
  movieTitle: "Dune: Part Two",
  year: 2024,
  genres: ["Science Fiction", "Adventure"],
  runtimeMinutes: 167,
  rating: 8.8,
  verdict: "The rare blockbuster that earns its scale. See it on the biggest screen available.",
  excerpt: "Villeneuve's sequel finds weight in myth and spectacle.",
  bodyMarkdown: "Body copy.",
  posterUrl: null,
  backdropUrl: null,
  director: "Denis Villeneuve",
  cast: ["Timothée Chalamet", "Zendaya", "Rebecca Ferguson", "Austin Butler"],
  runtimeLabel: null,
  releaseDate: "2024-03-01",
  studios: ["Legendary Pictures", "Villeneuve Films"],
  countries: ["United States of America"],
  languages: ["English"],
  certification: "PG-13",
  collection: "Dune Collection",
  budget: 190000000,
  revenue: 714444358,
  publishedAt: "2026-09-28T10:00:00.000Z",
  updatedAt: "2026-10-07T10:00:00.000Z",
  authorName: "The Editor",
  providers: null,
  customWatch: null,
  tmdbId: 693134,
};

describe("moneyFact", () => {
  it("formats positive USD amounts without decimals", () => {
    expect(moneyFact(30000000)).toBe("$30,000,000");
    expect(moneyFact(190000000)).toBe("$190,000,000");
    expect(moneyFact(714444358)).toBe("$714,444,358");
  });

  it("returns null for zero, negative, NaN, non-numbers and missing values", () => {
    expect(moneyFact(0)).toBeNull();
    expect(moneyFact(-500)).toBeNull();
    expect(moneyFact(Number.NaN)).toBeNull();
    expect(moneyFact(Number.POSITIVE_INFINITY)).toBeNull();
    expect(moneyFact(null)).toBeNull();
    expect(moneyFact(undefined)).toBeNull();
    expect(moneyFact("190000000")).toBeNull();
  });
});

describe("keyFactRows: TMDB metadata rows", () => {
  it("emits Studio/Country/Language/Certification/Franchise/Budget/Box office in order", async () => {
    const html = await render(KeyFacts, { review: FULL_REVIEW });
    const labels = rows(html).map((r) => r.label);
    expect(labels).toEqual([
      "Title",
      "Year",
      "Released",
      "Runtime",
      "Director",
      "Cast",
      "Genres",
      "Studio",
      "Country",
      "Language",
      "Certification",
      "Franchise",
      "Budget",
      "Box office",
      "Our rating",
      "Our verdict",
      "Reviewed on",
      "Reviewed by",
    ]);

    const byLabel = new Map(rows(html).map((r) => [r.label, r.value]));
    expect(byLabel.get("Released")).toBe("March 1, 2024");
    expect(byLabel.get("Studio")).toBe("Legendary Pictures, Villeneuve Films");
    expect(byLabel.get("Country")).toBe("United States of America");
    expect(byLabel.get("Language")).toBe("English");
    expect(byLabel.get("Certification")).toBe("PG-13");
    expect(byLabel.get("Franchise")).toBe("Dune Collection");
    expect(byLabel.get("Budget")).toBe("$190,000,000");
    expect(byLabel.get("Box office")).toBe("$714,444,358");
  });

  it("emits none of the metadata rows when the review does not carry them", () => {
    const bare: PublicReview = {
      ...FULL_REVIEW,
      releaseDate: null,
      studios: [],
      countries: [],
      languages: [],
      certification: null,
      collection: null,
      budget: null,
      revenue: null,
    };
    const labels = keyFactRows(bare).map((r) => r.label);
    for (const label of [
      "Released",
      "Studio",
      "Country",
      "Language",
      "Certification",
      "Franchise",
      "Budget",
      "Box office",
    ]) {
      expect(labels).not.toContain(label);
    }
  });

  it("renders no empty labels or values for a metadata-free review", async () => {
    const bare: PublicReview = {
      ...FULL_REVIEW,
      releaseDate: null,
      studios: [],
      countries: [],
      languages: [],
      certification: null,
      collection: null,
      budget: 0,
      revenue: -1,
    };
    const html = await render(KeyFacts, { review: bare });
    expect(html).not.toContain("<dt></dt>");
    expect(html).not.toContain("<dd></dd>");
    for (const row of rows(html)) {
      expect(row.value.length).toBeGreaterThan(0);
    }
    expect(html).not.toContain("$0");
  });
});

describe("movieJsonLd / myReviewJsonLd: TMDB metadata fields", () => {
  it("emits productionCompany, countryOfOrigin, inLanguage, contentRating, isPartOf and datePublished", () => {
    const node = movieJsonLd(FULL_REVIEW, "https://reviews.example.com", "movie");
    expect(node["@type"]).toBe("Movie");
    expect(node.datePublished).toBe("2024-03-01");
    expect(node.productionCompany).toEqual([
      { "@type": "Organization", name: "Legendary Pictures" },
      { "@type": "Organization", name: "Villeneuve Films" },
    ]);
    expect(node.countryOfOrigin).toEqual([
      { "@type": "Country", name: "United States of America" },
    ]);
    expect(node.inLanguage).toBe("English");
    expect(node.contentRating).toBe("PG-13");
    expect(node.isPartOf).toEqual({
      "@type": "CreativeWorkSeries",
      name: "Dune Collection",
    });
    expect(node.director).toEqual({ "@type": "Person", name: "Denis Villeneuve" });
    // Budget and box office are not schema.org Movie properties: they stay
    // in the visible fact card only.
    expect("budget" in node).toBe(false);
    expect("revenue" in node).toBe(false);
  });

  it("emits inLanguage as a list when the film carries several languages", () => {
    const node = movieJsonLd(
      { ...FULL_REVIEW, languages: ["English", "Spanish"] },
      "https://reviews.example.com",
      "movie",
    );
    expect(node.inLanguage).toEqual(["English", "Spanish"]);
  });

  it("mirrors the same fields on the Review itemReviewed node", () => {
    const node = myReviewJsonLd(
      FULL_REVIEW,
      {} as never,
      "https://reviews.example.com/reviews/dune-part-two",
      "movie",
    );
    const item = node.itemReviewed as Record<string, unknown>;
    expect(item["@type"]).toBe("Movie");
    expect(item.datePublished).toBe("2024-03-01");
    expect(item.productionCompany).toEqual([
      { "@type": "Organization", name: "Legendary Pictures" },
      { "@type": "Organization", name: "Villeneuve Films" },
    ]);
    expect(item.countryOfOrigin).toEqual([
      { "@type": "Country", name: "United States of America" },
    ]);
    expect(item.inLanguage).toBe("English");
    expect(item.contentRating).toBe("PG-13");
    expect(item.isPartOf).toEqual({
      "@type": "CreativeWorkSeries",
      name: "Dune Collection",
    });
    expect(item.director).toEqual({ "@type": "Person", name: "Denis Villeneuve" });
  });

  it("omits every metadata key when the review carries none", () => {
    const bare: PublicReview = {
      ...FULL_REVIEW,
      releaseDate: null,
      studios: [],
      countries: [],
      languages: [],
      certification: null,
      collection: null,
      budget: null,
      revenue: null,
    };
    const node = movieJsonLd(bare, "https://reviews.example.com", "movie");
    for (const key of [
      "datePublished",
      "productionCompany",
      "countryOfOrigin",
      "inLanguage",
      "contentRating",
      "isPartOf",
    ]) {
      expect(key in node, key).toBe(false);
    }
  });

  it("TVSeries omits isPartOf AND director, even when the row carries them", () => {
    const series: PublicReview = {
      ...FULL_REVIEW,
      movieTitle: "Slow Horses",
      tmdbId: 95480,
    };
    const title = movieJsonLd(series, "https://reviews.example.com", "tv");
    expect(title["@type"]).toBe("TVSeries");
    expect("isPartOf" in title).toBe(false);
    expect("director" in title).toBe(false);
    expect(title.productionCompany).toEqual([
      { "@type": "Organization", name: "Legendary Pictures" },
      { "@type": "Organization", name: "Villeneuve Films" },
    ]);
    expect(title.contentRating).toBe("PG-13");

    const node = myReviewJsonLd(
      series,
      {} as never,
      "https://reviews.example.com/reviews/slow-horses-2022-review",
      "tv",
    );
    const item = node.itemReviewed as Record<string, unknown>;
    expect(item["@type"]).toBe("TVSeries");
    expect("isPartOf" in item).toBe(false);
    expect("director" in item).toBe(false);
  });
});

describe("store mapping: movie metadata reaches the public contract", () => {
  let dir = "";
  let dbFile = "";
  let savedPath: string | undefined;

  beforeEach(async () => {
    savedPath = process.env.REVIEWS_DB_PATH;
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "tmdb-meta-"));
    dbFile = path.join(dir, "reviews.json");
    await fs.writeFile(dbFile, "[]", "utf8");
    process.env.REVIEWS_DB_PATH = dbFile;
  });

  afterEach(async () => {
    if (savedPath === undefined) delete process.env.REVIEWS_DB_PATH;
    else process.env.REVIEWS_DB_PATH = savedPath;
    await fs.rm(dir, { recursive: true, force: true });
  });

  function storeRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "t-1",
      title: "Store Headline",
      slug: "store-only-film",
      excerpt: "A store-backed verdict.",
      markdown: "Store body.",
      status: "published",
      rating: 7.5,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
      publishedAt: "2026-10-01T00:00:00.000Z",
      ...overrides,
    };
  }

  it("maps studios/countries/languages/certification/collection/budget/revenue from movie", async () => {
    await fs.writeFile(
      dbFile,
      JSON.stringify([
        storeRow({
          movie: {
            title: "Store Film",
            year: "2024",
            releaseDate: "2024-03-01",
            studios: ["Legendary Pictures"],
            countries: ["United States of America"],
            languages: ["English"],
            certification: "PG-13",
            collection: "Dune Collection",
            budget: 190000000,
            revenue: 714444358,
          },
        }),
      ]),
      "utf8",
    );
    const { getReviewBySlug } = await import("../src/lib/seo/content");
    const r = getReviewBySlug("store-only-film");
    expect(r?.releaseDate).toBe("2024-03-01");
    expect(r?.studios).toEqual(["Legendary Pictures"]);
    expect(r?.countries).toEqual(["United States of America"]);
    expect(r?.languages).toEqual(["English"]);
    expect(r?.certification).toBe("PG-13");
    expect(r?.collection).toBe("Dune Collection");
    expect(r?.budget).toBe(190000000);
    expect(r?.revenue).toBe(714444358);
  });

  it("zero and negative budget/revenue stay null, never $0", async () => {
    await fs.writeFile(
      dbFile,
      JSON.stringify([
        storeRow({
          movie: { title: "Zero Film", budget: 0, revenue: -100 },
        }),
      ]),
      "utf8",
    );
    const { getReviewBySlug } = await import("../src/lib/seo/content");
    const r = getReviewBySlug("store-only-film");
    expect(r?.budget).toBeNull();
    expect(r?.revenue).toBeNull();
    const labels = keyFactRows(r!).map((row) => row.label);
    expect(labels).not.toContain("Budget");
    expect(labels).not.toContain("Box office");
  });
});

describe("portability: movie_* keys survive export, parse and import", () => {
  const sample = {
    title: "Dune: Part Two",
    slug: "dune-part-two",
    rating: 9,
    movie_id: "550",
    imdb_id: "tt15239678",
    tmdb_id: 693134,
    published_at: "2026-02-01T00:00:00.000Z",
    seo_title: "Dune: Part Two Review",
    seo_description: "A 9/10 review.",
    movie_release_date: "2024-03-01",
    movie_studio: '["Legendary Pictures"]',
    movie_country: '["United States of America"]',
    movie_language: '["English"]',
    movie_certification: "PG-13",
    movie_collection: "Dune Collection",
    movie_budget: 190000000,
    movie_revenue: 714444358,
    media_type: "movie",
    body: "# Dune: Part Two\n\nLoved the sandworm ride.\n",
  };

  it("reviewToMarkdown preserves every movie_* key", async () => {
    const { reviewToMarkdown } = await import("../src/lib/portability");
    const md = reviewToMarkdown(sample);
    for (const key of [
      "movie_release_date:",
      "movie_studio:",
      "movie_country:",
      "movie_language:",
      "movie_certification:",
      "movie_collection:",
      "movie_budget:",
      "movie_revenue:",
      "media_type:",
    ]) {
      expect(md).toContain(key);
    }
    expect(md).toContain("Legendary Pictures");
    expect(md).toContain("190000000");
  });

  it("markdownToReview carries the movie_* keys through", async () => {
    const { reviewToMarkdown, markdownToReview } = await import("../src/lib/portability");
    const md = reviewToMarkdown(sample);
    const { review } = markdownToReview(md);
    expect(review.movie_release_date).toBe("2024-03-01");
    expect(review.movie_studio).toBe('["Legendary Pictures"]');
    expect(review.movie_country).toBe('["United States of America"]');
    expect(review.movie_language).toBe('["English"]');
    expect(review.movie_certification).toBe("PG-13");
    expect(review.movie_collection).toBe("Dune Collection");
    expect(review.movie_budget).toBe(190000000);
    expect(review.movie_revenue).toBe(714444358);
    expect(review.media_type).toBe("movie");
  });

  it("importMarkdown writes the movie metadata onto the store row (buildMovieMeta)", async () => {
    const { importMarkdown } = await import("../scripts/import");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tmdb-import-"));
    const db = path.join(dir, "reviews.json");
    const file = path.join(dir, "dune-part-two.md");
    const { reviewToMarkdown } = await import("../src/lib/portability");
    await fs.writeFile(file, reviewToMarkdown(sample), "utf8");

    const r = await importMarkdown(file, { dbPath: db });
    expect(r.imported).toBe(1);
    expect(r.errors).toEqual([]);

    const rows = JSON.parse(await fs.readFile(db, "utf8")) as Record<string, unknown>[];
    const row = rows.find((entry) => entry.slug === "dune-part-two");
    expect(row).toBeDefined();
    const movie = row!.movie as Record<string, unknown>;
    expect(movie.releaseDate).toBe("2024-03-01");
    expect(movie.studios).toEqual(["Legendary Pictures"]);
    expect(movie.countries).toEqual(["United States of America"]);
    expect(movie.languages).toEqual(["English"]);
    expect(movie.certification).toBe("PG-13");
    expect(movie.collection).toBe("Dune Collection");
    expect(movie.budget).toBe(190000000);
    expect(movie.revenue).toBe(714444358);
    expect(row!.mediaType).toBe("movie");
    await fs.rm(dir, { recursive: true, force: true });
  });
});
