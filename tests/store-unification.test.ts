import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  getLatestReviews,
  getReviewBySlug,
  listGenres,
} from "../src/lib/seo/content";
import { getTitleBadges } from "../src/lib/badges";
import { defaultSites } from "../src/lib/seo/store-merge";

let dir = "";
let dbFile = "";
let savedPath: string | undefined;

beforeEach(async () => {
  savedPath = process.env.REVIEWS_DB_PATH;
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "store-unify-"));
  dbFile = path.join(dir, "reviews.json");
  await fs.writeFile(dbFile, "[]", "utf8");
  process.env.REVIEWS_DB_PATH = dbFile;
});

afterEach(async () => {
  if (savedPath === undefined) delete process.env.REVIEWS_DB_PATH;
  else process.env.REVIEWS_DB_PATH = savedPath;
  await fs.rm(dir, { recursive: true, force: true });
});

async function writeRows(rows: unknown[]): Promise<void> {
  await fs.writeFile(dbFile, JSON.stringify(rows), "utf8");
}

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

describe("store-unification", () => {
  it("includes published store rows in public loaders", async () => {
    await writeRows([storeRow()]);
    const all = getLatestReviews(1000);
    expect(all.some((r) => r.slug === "store-only-film")).toBe(true);
    expect(getReviewBySlug("store-only-film")?.reviewTitle).toBe("Store Headline");
  });

  it("store rows override DEMO rows by slug", async () => {
    await writeRows([storeRow({ slug: "dune-part-two", title: "Admin Dune", rating: 9 })]);
    const dune = getReviewBySlug("dune-part-two");
    expect(dune?.reviewTitle).toBe("Admin Dune");
    expect(dune?.rating).toBe(9);
  });

  it("excludes drafts and invalid rows", async () => {
    await writeRows([
      storeRow({ id: "d", slug: "draft-film", status: "draft" }),
      storeRow({ id: "b", slug: "blank-film", markdown: "" }),
    ]);
    const slugs = getLatestReviews(1000).map((r) => r.slug);
    expect(slugs).not.toContain("draft-film");
    expect(slugs).not.toContain("blank-film");
  });

  it("falls back to DEMO on missing or corrupt store file", async () => {
    await fs.writeFile(dbFile, "{not json", "utf8");
    expect(getLatestReviews(1000).some((r) => r.slug === "dune-part-two")).toBe(true);
    await fs.rm(dbFile);
    expect(getLatestReviews(1000).some((r) => r.slug === "joker")).toBe(true);
  });

  it("maps platformPick, tmdbId, genres and nulls providers", async () => {
    await writeRows([
      storeRow({
        platformPick: true,
        movie: { title: "Store Film", movieId: "12345", year: "2023", genres: ["Drama"] },
      }),
    ]);
    const r = getReviewBySlug("store-only-film");
    expect(r?.platformPick).toBe(true);
    expect(r?.tmdbId).toBe(12345);
    expect(r?.genres).toEqual(["Drama"]);
    expect(r?.providers).toBeNull();
  });

  it("merged rows inherit demo art, providers and verdict", async () => {
    await writeRows([
      storeRow({ slug: "dune-part-two", title: "Admin Dune", rating: 9 }),
    ]);
    const dune = getReviewBySlug("dune-part-two");
    expect(dune?.reviewTitle).toBe("Admin Dune");
    expect(dune?.backdropUrl).toContain("image.tmdb.org");
    expect(dune?.providers).not.toBeNull();
    expect(dune?.verdict.length).toBeGreaterThan(0);
  });

  it("explicit platformPick:false clears a demo flag", async () => {
    await writeRows([
      storeRow({ slug: "dune-part-two", platformPick: false }),
    ]);
    expect(getReviewBySlug("dune-part-two")?.platformPick).toBe(false);
    expect(getTitleBadges(693134)).toEqual({ reviewed: true, platformPick: false });
  });

  it("genres list still works with merged rows", async () => {
    await writeRows([storeRow({ movie: { title: "Store Film", genres: ["Western"] } })]);
    expect(listGenres()).toContain("Western");
  });
});

describe("store tmdb id fallback", () => {
  it("uses the row's own tmdbId when the movie record carries none", async () => {
    await writeRows([
      storeRow({ tmdbId: 336203, movie: { title: "Masaan", year: "2015" } }),
    ]);
    expect(getReviewBySlug("store-only-film")?.tmdbId).toBe(336203);
  });

  it("the movie record's movieId still wins over the row's own tmdbId", async () => {
    await writeRows([
      storeRow({ tmdbId: 336203, movie: { title: "Store Film", movieId: "12345" } }),
    ]);
    expect(getReviewBySlug("store-only-film")?.tmdbId).toBe(12345);
  });

  it("accepts a numeric string id, but garbage/zero/negative/missing stay null", async () => {
    await writeRows([
      storeRow({ id: "s", slug: "string-id", tmdbId: "77889", movie: { title: "X" } }),
      storeRow({ id: "t", slug: "text-id", tmdbId: "not-a-number", movie: { title: "X" } }),
      storeRow({ id: "z", slug: "zero-id", tmdbId: 0, movie: { title: "X" } }),
      storeRow({ id: "n", slug: "negative-id", tmdbId: -5, movie: { title: "X" } }),
      storeRow({ id: "m", slug: "missing-id", movie: { title: "X" } }),
    ]);
    expect(getReviewBySlug("string-id")?.tmdbId).toBe(77889);
    for (const slug of ["text-id", "zero-id", "negative-id", "missing-id"]) {
      expect(getReviewBySlug(slug)?.tmdbId).toBeNull();
    }
  });

  it("a merged row takes the store's own tmdbId over the demo twin's", async () => {
    await writeRows([storeRow({ slug: "dune-part-two", tmdbId: 111222 })]);
    expect(getReviewBySlug("dune-part-two")?.tmdbId).toBe(111222);
  });

  it("review JSON-LD emits isBasedOn from the store row's own tmdbId", async () => {
    await writeRows([
      storeRow({ tmdbId: 336203, movie: { title: "Masaan", year: "2015" } }),
    ]);
    const { myReviewJsonLd } = await import("../src/lib/seo/jsonld");
    const r = getReviewBySlug("store-only-film");
    const node = myReviewJsonLd(r!, {} as never, "https://example.com/reviews/store-only-film");
    expect(node.isBasedOn).toBe("https://www.themoviedb.org/movie/336203");
  });

  it("sitemap lists the /movies hub for a store-backed review with a tmdbId", async () => {
    await writeRows([
      storeRow({ tmdbId: 336203, movie: { title: "Masaan", year: "2015" } }),
    ]);
    const { GET } = await import("../src/pages/sitemap.xml");
    const res = (await GET({
      url: new URL("https://example.com/sitemap.xml"),
    } as never)) as Response;
    const xml = await res.text();
    expect(xml).toContain("<loc>https://example.com/movies/336203</loc>");
  });
});

describe("site namespaces", () => {
  let savedSiteId: string | undefined;

  beforeEach(() => {
    savedSiteId = process.env.SITE_ID;
  });

  afterEach(() => {
    if (savedSiteId === undefined) delete process.env.SITE_ID;
    else process.env.SITE_ID = savedSiteId;
  });

  it("hides rows tagged for other sites, shows untagged rows", async () => {
    process.env.SITE_ID = "extramovies";
    await writeRows([
      storeRow({ id: "o", slug: "other-site-film", movie: { title: "Other" }, sites: ["cinemavilla"] }),
      storeRow({ id: "s", slug: "shared-film", movie: { title: "Shared" } }),
    ]);
    const slugs = getLatestReviews(1000).map((r) => r.slug);
    expect(slugs).not.toContain("other-site-film");
    expect(slugs).toContain("shared-film");
    expect(getReviewBySlug("other-site-film")).toBeNull();
  });

  it("a draft store row suppresses its demo twin on that site only", async () => {
    process.env.SITE_ID = "extramovies";
    await writeRows([
      {
        id: "hide-dune",
        title: "Hidden",
        slug: "dune-part-two",
        excerpt: "x",
        markdown: "x",
        status: "draft",
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
    ]);
    expect(getReviewBySlug("dune-part-two")).toBeNull();
    expect(getLatestReviews(1000).some((r) => r.slug === "dune-part-two")).toBe(false);
  });

  it("a foreign-tagged draft does NOT suppress this site's demo twin", async () => {
    process.env.SITE_ID = "extramovies";
    await writeRows([
      {
        id: "hide-dune-elsewhere",
        title: "Hidden elsewhere",
        slug: "dune-part-two",
        excerpt: "x",
        markdown: "x",
        status: "draft",
        sites: ["cinemavilla"],
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
    ]);
    expect(getReviewBySlug("dune-part-two")?.reviewTitle).toContain("Dune");
    expect(getLatestReviews(1000).some((r) => r.slug === "dune-part-two")).toBe(true);
  });

  it("without SITE_ID everything stays visible (backward compatible)", async () => {
    delete process.env.SITE_ID;
    await writeRows([
      storeRow({ id: "o", slug: "other-site-film", sites: ["cinemavilla"] }),
    ]);
    expect(getLatestReviews(1000).some((r) => r.slug === "other-site-film")).toBe(true);
    expect(getReviewBySlug("dune-part-two")?.reviewTitle).toContain("Dune");
  });

  it("save defaults scope new rows to the current site only", () => {
    process.env.SITE_ID = "extramovies";
    expect(defaultSites()).toEqual(["extramovies"]);
    delete process.env.SITE_ID;
    expect(defaultSites()).toBeUndefined();
  });
});
