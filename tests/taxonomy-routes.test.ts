import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Taxonomy routes (cast / director / category) — AGENTS.md §5.
 *
 * Hermetic: every test drives a fixture store (REVIEWS_DB_PATH) and a
 * fixture legacy dir, so the assertions never depend on the site's own
 * review corpus.
 */

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

const savedEnv = { ...process.env };

/** A published store row (src/pages/api/admin/_store.ts Review shape). */
function row(opts: {
  id: string;
  slug: string;
  title: string;
  publishedAt: string;
  status?: "published" | "draft";
  director?: string;
  cast?: string[];
  genres?: string[];
}) {
  return {
    id: opts.id,
    title: opts.title,
    slug: opts.slug,
    excerpt: `${opts.title} — a one-line summary of the review.`,
    markdown: `Body of ${opts.title}.`,
    status: opts.status ?? "published",
    rating: 7.5,
    createdAt: opts.publishedAt,
    updatedAt: opts.publishedAt,
    publishedAt: opts.publishedAt,
    movie: {
      title: opts.title,
      year: "2020",
      ...(opts.director ? { director: opts.director } : {}),
      ...(opts.cast ? { cast: opts.cast } : {}),
      ...(opts.genres ? { genres: opts.genres } : {}),
    },
  };
}

/** Point the store at a throwaway fixture file (unique path per call). */
function useFixtureStore(rows: unknown[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "taxonomy-store-"));
  const file = path.join(dir, "reviews.json");
  fs.writeFileSync(file, JSON.stringify(rows));
  process.env.REVIEWS_DB_PATH = file;
  return file;
}

/** A throwaway legacy dir (redirect map + unresolved list). */
function useLegacyDir(map: string, unresolved: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "taxonomy-legacy-"));
  fs.writeFileSync(path.join(dir, "redirect_map.csv"), map);
  fs.writeFileSync(path.join(dir, "unresolved.csv"), unresolved);
  return dir;
}

beforeEach(() => {
  delete process.env.SITE_ID;
  delete process.env.SITE_THEME;
  delete process.env.SITE_URL;
});

afterEach(() => {
  process.env = { ...savedEnv };
});

describe("taxonomy: path shape + slugs", () => {
  it("recognises only /cast, /director, /category with a kebab slug", async () => {
    const { parseTaxonomyPath } = await import("../src/lib/legacy/taxonomy-path");
    expect(parseTaxonomyPath("/cast/robert-de-niro")).toEqual({ kind: "cast", slug: "robert-de-niro" });
    expect(parseTaxonomyPath("/director/tim-miller/")).toEqual({ kind: "director", slug: "tim-miller" });
    expect(parseTaxonomyPath("/category/dual-audio-movies")).toEqual({ kind: "category", slug: "dual-audio-movies" });
    expect(parseTaxonomyPath("/movies/693134")).toBeNull();
    expect(parseTaxonomyPath("/cast")).toBeNull();
    expect(parseTaxonomyPath("/cast/name/extra")).toBeNull();
    expect(parseTaxonomyPath("/cast/Not A Slug")).toBeNull();
    expect(parseTaxonomyPath("/review/joker")).toBeNull();
  });

  it("slugs labels the way the legacy URLs do (WordPress style)", async () => {
    const { slugifyTaxonomy } = await import("../src/lib/seo/taxonomy");
    expect(slugifyTaxonomy("Robert De Niro")).toBe("robert-de-niro");
    expect(slugifyTaxonomy("Rakul Preet Singh")).toBe("rakul-preet-singh");
    expect(slugifyTaxonomy("Surrender Reddy")).toBe("surrender-reddy");
    expect(slugifyTaxonomy("Timothée Chalamet")).toBe("timothee-chalamet");
    expect(slugifyTaxonomy("Science Fiction")).toBe("science-fiction");
  });
});

describe("taxonomy: a cast page lists the matching published reviews", () => {
  it("collects every published review that names the actor", async () => {
    useFixtureStore([
      row({
        id: "c1",
        slug: "cast-film-a",
        title: "Film A",
        publishedAt: "2026-01-01T00:00:00.000Z",
        cast: ["Fixture Person", "Second Actor"],
        director: "Someone Else",
      }),
      row({
        id: "c2",
        slug: "cast-film-b",
        title: "Film B",
        publishedAt: "2026-05-01T00:00:00.000Z",
        cast: ["Fixture Person"],
        director: "Another Director",
      }),
    ]);
    const { getTaxonomyEntry } = await import("../src/lib/seo/taxonomy");
    const entry = getTaxonomyEntry("cast", "fixture-person");
    expect(entry).not.toBeNull();
    expect(entry?.kind).toBe("cast");
    expect(entry?.label).toBe("Fixture Person");
    expect(entry?.path).toBe("/cast/fixture-person");
    // Newest first.
    expect(entry?.reviews.map((r) => r.slug)).toEqual(["cast-film-b", "cast-film-a"]);
    // A different actor is a different page.
    expect(getTaxonomyEntry("cast", "second-actor")?.reviews.length).toBe(1);
  });

  it("a draft review never joins a taxonomy page", async () => {
    useFixtureStore([
      row({
        id: "c3",
        slug: "cast-film-c",
        title: "Film C",
        publishedAt: "2026-01-01T00:00:00.000Z",
        status: "draft",
        cast: ["Draft Person"],
      }),
    ]);
    const { getTaxonomyEntry } = await import("../src/lib/seo/taxonomy");
    expect(getTaxonomyEntry("cast", "draft-person")).toBeNull();
  });

  it("the cast route renders the shared taxonomy page", () => {
    const src = read("src/pages/cast/[slug].astro");
    expect(src).toContain('taxonomyPageMeta("cast"');
    expect(src).toContain("<TaxonomyPage");
    expect(src).toContain("status: 404");
  });
});

describe("taxonomy: a director page lists the matching published reviews", () => {
  it("splits a comma-separated credit into one page per director", async () => {
    useFixtureStore([
      row({
        id: "d1",
        slug: "director-film-a",
        title: "Film A",
        publishedAt: "2026-02-01T00:00:00.000Z",
        director: "Fixture Director, Co Director",
      }),
      row({
        id: "d2",
        slug: "director-film-b",
        title: "Film B",
        publishedAt: "2026-06-01T00:00:00.000Z",
        director: "Fixture Director",
      }),
    ]);
    const { getTaxonomyEntry } = await import("../src/lib/seo/taxonomy");
    const entry = getTaxonomyEntry("director", "fixture-director");
    expect(entry?.kind).toBe("director");
    expect(entry?.label).toBe("Fixture Director");
    expect(entry?.reviews.map((r) => r.slug)).toEqual(["director-film-b", "director-film-a"]);
    // The co-credit gets its own page.
    expect(getTaxonomyEntry("director", "co-director")?.reviews.length).toBe(1);
  });

  it("the director route renders the shared taxonomy page", () => {
    const src = read("src/pages/director/[slug].astro");
    expect(src).toContain('taxonomyPageMeta("director"');
    expect(src).toContain("<TaxonomyPage");
  });
});

describe("taxonomy: a category page lists the matching published reviews", () => {
  it("collects the reviews filed under a genre", async () => {
    useFixtureStore([
      row({
        id: "g1",
        slug: "genre-film-a",
        title: "Film A",
        publishedAt: "2026-03-01T00:00:00.000Z",
        genres: ["Test Drama", "Comedy"],
      }),
      row({
        id: "g2",
        slug: "genre-film-b",
        title: "Film B",
        publishedAt: "2026-07-01T00:00:00.000Z",
        genres: ["Test Drama"],
      }),
    ]);
    const { getTaxonomyEntry } = await import("../src/lib/seo/taxonomy");
    const entry = getTaxonomyEntry("category", "test-drama");
    expect(entry?.kind).toBe("category");
    expect(entry?.label).toBe("Test Drama");
    expect(entry?.path).toBe("/category/test-drama");
    expect(entry?.reviews.map((r) => r.slug)).toEqual(["genre-film-b", "genre-film-a"]);
  });

  it("the category route renders the shared taxonomy page", () => {
    const src = read("src/pages/category/[slug].astro");
    expect(src).toContain('taxonomyPageMeta("category"');
    expect(src).toContain("<TaxonomyPage");
  });
});

describe("taxonomy: indexing policy (fewer than two reviews = noindex, follow)", () => {
  it("a one-review taxonomy page is noindex and says so in the intro", async () => {
    useFixtureStore([
      row({
        id: "s1",
        slug: "solo-film",
        title: "Solo Film",
        publishedAt: "2026-04-01T00:00:00.000Z",
        cast: ["Solo Person"],
        genres: ["Solo Genre"],
      }),
    ]);
    const { getTaxonomyEntry, taxonomyRobots, taxonomyIntro, taxonomyCountText, isTaxonomyIndexable } =
      await import("../src/lib/seo/taxonomy");
    const entry = getTaxonomyEntry("cast", "solo-person");
    expect(entry?.reviews.length).toBe(1);
    expect(isTaxonomyIndexable(entry!)).toBe(false);
    expect(taxonomyRobots(entry!)).toBe("noindex, follow");
    // Honest about being a single review — no padded "newest first" claim.
    expect(taxonomyCountText(entry!)).toBe("1 review");
    expect(taxonomyIntro(entry!, "Extramovies")).toBe("The only Extramovies review with Solo Person.");
  });

  it("a two-review taxonomy page is indexable", async () => {
    useFixtureStore([
      row({
        id: "t1",
        slug: "duo-film-a",
        title: "Duo Film A",
        publishedAt: "2026-04-01T00:00:00.000Z",
        cast: ["Duo Person"],
      }),
      row({
        id: "t2",
        slug: "duo-film-b",
        title: "Duo Film B",
        publishedAt: "2026-05-01T00:00:00.000Z",
        cast: ["Duo Person"],
      }),
    ]);
    const { getTaxonomyEntry, taxonomyRobots, taxonomyIntro, isTaxonomyIndexable } = await import(
      "../src/lib/seo/taxonomy"
    );
    const entry = getTaxonomyEntry("cast", "duo-person");
    expect(entry?.reviews.length).toBe(2);
    expect(isTaxonomyIndexable(entry!)).toBe(true);
    expect(taxonomyRobots(entry!)).toBe("index, follow");
    expect(taxonomyIntro(entry!, "Extramovies")).toBe(
      "Every Extramovies review with Duo Person, newest first.",
    );
  });

  it("the robots meta is wired from the taxonomy decision", () => {
    const page = read("src/components/public/TaxonomyPage.astro");
    expect(page).toContain("robots={meta.robots}");
    const base = read("src/layouts/Base.astro");
    expect(base).toContain('<meta name="robots" content={robots} />');
  });
});

describe("taxonomy: sitemap stays review-driven", () => {
  it("lists a two-review taxonomy page and omits a one-review one", async () => {
    useFixtureStore([
      row({
        id: "m1",
        slug: "sitemap-duo-a",
        title: "Sitemap Duo A",
        publishedAt: "2026-04-01T00:00:00.000Z",
        cast: ["Sitemap Duo"],
      }),
      row({
        id: "m2",
        slug: "sitemap-duo-b",
        title: "Sitemap Duo B",
        publishedAt: "2026-05-01T00:00:00.000Z",
        cast: ["Sitemap Duo"],
      }),
      row({
        id: "m3",
        slug: "sitemap-solo",
        title: "Sitemap Solo",
        publishedAt: "2026-06-01T00:00:00.000Z",
        cast: ["Sitemap Solo"],
      }),
    ]);
    const { GET } = await import("../src/pages/sitemap.xml");
    const res = (await GET({
      url: new URL("https://example.com/sitemap.xml"),
    } as never)) as Response;
    const xml = await res.text();
    expect(xml).toContain("<loc>https://example.com/cast/sitemap-duo</loc>");
    expect(xml).not.toContain("<loc>https://example.com/cast/sitemap-solo</loc>");
    // The review it is built from is still listed.
    expect(xml).toContain("<loc>https://example.com/reviews/sitemap-duo-a</loc>");
  });

  it("the sitemap builder gates taxonomy entries on the two-review rule", () => {
    const src = read("src/pages/sitemap.xml.ts");
    expect(src).toContain("isTaxonomyIndexable");
    expect(src).toContain("taxonomyEntries");
  });
});

describe("legacy router: taxonomy paths 301 to the live page", () => {
  it("a legacy /cast/<slug>/ path 301s to the new page", async () => {
    useFixtureStore([
      row({
        id: "l1",
        slug: "legacy-film",
        title: "Legacy Film",
        publishedAt: "2026-04-01T00:00:00.000Z",
        cast: ["Legacy Person"],
      }),
    ]);
    const dir = useLegacyDir("legacy_path,target_path\n", "legacy_url,reason\n");
    const { createLegacyRouter } = await import("../src/lib/legacy/router");
    const router = createLegacyRouter(dir);

    const res = router.check("/cast/legacy-person/");
    expect(res?.status).toBe(301);
    expect(res?.headers.get("Location")).toBe("/cast/legacy-person");
  });

  it("the redirect works for every taxonomy axis", async () => {
    useFixtureStore([
      row({
        id: "l2",
        slug: "legacy-film-2",
        title: "Legacy Film 2",
        publishedAt: "2026-04-01T00:00:00.000Z",
        director: "Legacy Director",
        cast: ["Legacy Actor"],
        genres: ["Legacy Genre"],
      }),
    ]);
    const dir = useLegacyDir("legacy_path,target_path\n", "legacy_url,reason\n");
    const { createLegacyRouter } = await import("../src/lib/legacy/router");
    const router = createLegacyRouter(dir);

    expect(router.check("/director/legacy-director/")?.headers.get("Location")).toBe(
      "/director/legacy-director",
    );
    expect(router.check("/category/legacy-genre/")?.headers.get("Location")).toBe(
      "/category/legacy-genre",
    );
  });

  it("the canonical taxonomy URL is never redirected to itself", async () => {
    useFixtureStore([
      row({
        id: "l1b",
        slug: "legacy-film-b",
        title: "Legacy Film B",
        publishedAt: "2026-04-01T00:00:00.000Z",
        cast: ["Legacy Person"],
      }),
    ]);
    const dir = useLegacyDir(
      "legacy_path,target_path\n",
      [
        "legacy_url,reason",
        "http://x/cast/legacy-person/,cast",
      ].join("\n"),
    );
    const { createLegacyRouter } = await import("../src/lib/legacy/router");
    const router = createLegacyRouter(dir);

    // The page's own canonical URL must be served (200), not 301 to itself
    // and not 410'd by the legacy corpus' unresolved set.
    expect(router.check("/cast/legacy-person")).toBeNull();
    // The legacy slashed form still 301s to the canonical page.
    expect(router.check("/cast/legacy-person/")?.headers.get("Location")).toBe(
      "/cast/legacy-person",
    );
  });

  it("a taxonomy path the site does not publish is not resurrected", async () => {
    useFixtureStore([
      row({
        id: "l3",
        slug: "legacy-film-3",
        title: "Legacy Film 3",
        publishedAt: "2026-04-01T00:00:00.000Z",
        cast: ["Known Person"],
      }),
    ]);
    const dir = useLegacyDir(
      "legacy_path,target_path\n",
      [
        "legacy_url,reason",
        "http://x/cast/unknown-person/,cast",
      ].join("\n"),
    );
    const { createLegacyRouter } = await import("../src/lib/legacy/router");
    const router = createLegacyRouter(dir);

    // No page exists for this slug -> the legacy behaviour stands: the
    // corpus' unresolved set still 410s it.
    expect(router.check("/cast/unknown-person/")?.status).toBe(410);
    // With no legacy entry at all it simply passes through.
    expect(router.check("/cast/also-unknown/")).toBeNull();
  });
});

describe("legacy router: every other path keeps today's behaviour", () => {
  it("a mapped legacy path still 301s to its mapped target", async () => {
    useFixtureStore([
      row({
        id: "o1",
        slug: "legacy-film-4",
        title: "Legacy Film 4",
        publishedAt: "2026-04-01T00:00:00.000Z",
        cast: ["Legacy Person"],
      }),
    ]);
    const dir = useLegacyDir(
      [
        "legacy_path,target_path,tmdb_type,tmdb_id,confidence,title,year",
        "/old-movie-2019-full-movie-download/,/movies/123,movie,123,1.0,Foo,2019",
      ].join("\n"),
      "legacy_url,reason\n",
    );
    const { createLegacyRouter } = await import("../src/lib/legacy/router");
    const router = createLegacyRouter(dir);

    const moved = router.check("/18-movies/old-movie-2019-full-movie-download/");
    expect(moved?.status).toBe(301);
    expect(moved?.headers.get("Location")).toBe("/movies/123");
  });

  it("an unresolved legacy path still 410s", async () => {
    useFixtureStore([
      row({
        id: "o2",
        slug: "legacy-film-5",
        title: "Legacy Film 5",
        publishedAt: "2026-04-01T00:00:00.000Z",
        cast: ["Legacy Person"],
      }),
    ]);
    const dir = useLegacyDir(
      "legacy_path,target_path\n",
      ["legacy_url,reason", "http://ww7.extramovies.org:80/9xplay.php?url=abc,player"].join("\n"),
    );
    const { createLegacyRouter } = await import("../src/lib/legacy/router");
    const router = createLegacyRouter(dir);

    const gone = router.check("/9xplay.php?url=abc");
    expect(gone?.status).toBe(410);
  });

  it("an unmapped, unresolved path still passes through", async () => {
    useFixtureStore([
      row({
        id: "o3",
        slug: "legacy-film-6",
        title: "Legacy Film 6",
        publishedAt: "2026-04-01T00:00:00.000Z",
        cast: ["Legacy Person"],
      }),
    ]);
    const dir = useLegacyDir("legacy_path,target_path\n", "legacy_url,reason\n");
    const { createLegacyRouter } = await import("../src/lib/legacy/router");
    const router = createLegacyRouter(dir);

    expect(router.check("/some-random-path/")).toBeNull();
    expect(router.check("/")).toBeNull();
  });
});
