import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { experimental_AstroContainer } from "astro/container";
import ReviewPage from "../src/pages/reviews/[slug].astro";
import { getFeaturedReview, reviewDisplayTitle } from "../src/lib/seo/content";
import { buildSeoTitle } from "../src/lib/seo/meta";
import { getSiteBrand } from "../src/lib/seo/brand";
import { getDb, getSetting } from "../src/lib/db/adapter";

/**
 * Two slices in one file, because they share one store fixture:
 *
 *  1. seo_title drives the SERP title — the row's own SEO title IS the
 *     document title + og:title + twitter:title; the visible h1 stays the
 *     editorial headline; a row without one renders exactly as before.
 *  2. `featured` is a real store flag — carried by the loaders, written by
 *     the import, and preferred over the flagged DEMO row when a store row
 *     is flagged (the DEMO pack stays the fallback, untouched).
 */

const SEO_TITLE = "Spider-Man: Brand New Day Review (2026): Is It Worth Watching?";
const HEADLINE = "Spider-Man: Brand New Day Review: A Bleak Reset, With Zendaya Holding It Up";

let dir = "";
let dbFile = "";
const savedDbPath = process.env.REVIEWS_DB_PATH;
const savedSiteId = process.env.SITE_ID;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "seo-title-featured-"));
  dbFile = path.join(dir, "reviews.json");
  await fs.writeFile(dbFile, "[]", "utf8");
  process.env.REVIEWS_DB_PATH = dbFile;
});

afterEach(async () => {
  if (savedDbPath === undefined) delete process.env.REVIEWS_DB_PATH;
  else process.env.REVIEWS_DB_PATH = savedDbPath;
  if (savedSiteId === undefined) delete process.env.SITE_ID;
  else process.env.SITE_ID = savedSiteId;
  await fs.rm(dir, { recursive: true, force: true });
});

async function writeRows(rows: unknown[]): Promise<void> {
  await fs.writeFile(dbFile, JSON.stringify(rows), "utf8");
}

/** A published store row (the shape the import writes). */
function storeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "row-1",
    title: HEADLINE,
    slug: "spider-man-brand-new-day-2026-review",
    excerpt: "Tom Holland is 30 and lonely in Cretton's reset.",
    markdown: "Body copy.",
    status: "published",
    rating: 7,
    createdAt: "2026-10-21T09:00:00.000Z",
    updatedAt: "2026-10-21T09:00:00.000Z",
    publishedAt: "2026-10-21T09:00:00.000Z",
    movie: { title: "Spider-Man: Brand New Day", year: "2026", genres: ["Action"] },
    sites: ["extramovies"],
    ...overrides,
  };
}

/** Render the real review page (the container runs the page as SSR). */
async function renderReview(slug: string): Promise<string> {
  const container = await experimental_AstroContainer.create();
  return container.renderToString(ReviewPage as never, {
    params: { slug },
    request: new Request(`https://extramovies.test/reviews/${slug}`),
  });
}

/** The brand the page itself resolves (DB settings, then the settings file). */
async function brandName(): Promise<string> {
  const brand = await getSiteBrand((k) => getSetting(getDb({}), k));
  return brand.name;
}

describe("review page: the row's seo_title drives the SERP title", () => {
  it("renders it as the document title, og:title and twitter:title", async () => {
    await writeRows([storeRow({ seo: { seoTitle: SEO_TITLE } })]);
    const html = await renderReview("spider-man-brand-new-day-2026-review");

    expect(html).toContain(`<title>${SEO_TITLE}</title>`);
    expect(html).toContain(`<meta property="og:title" content="${SEO_TITLE}">`);
    expect(html).toContain(`<meta name="twitter:title" content="${SEO_TITLE}">`);
    // Verbatim: no brand suffix, no truncation.
    expect(html).not.toContain("| Extramovies</title>");
  });

  it("keeps the editorial headline as the visible h1", async () => {
    await writeRows([storeRow({ seo: { seoTitle: SEO_TITLE } })]);
    const html = await renderReview("spider-man-brand-new-day-2026-review");

    expect(html).toMatch(new RegExp(`<h1[^>]*>${HEADLINE}</h1>`));
    // The keyword title never becomes the headline.
    expect(html).not.toContain(`<h1[^>]*>${SEO_TITLE}`);
  });

  it("renders the headline exactly as before when the row carries no seo_title", async () => {
    await writeRows([
      storeRow({
        title: "Zendaya Holds It Up",
        slug: "dune-part-two",
        movie: { title: "Dune", year: "2024", genres: ["Drama"] },
        seo: undefined,
      }),
    ]);
    const html = await renderReview("dune-part-two");

    const expected = buildSeoTitle(
      reviewDisplayTitle("Dune", "Zendaya Holds It Up", "2024"),
      await brandName(),
    );
    expect(expected).toBe("Dune (2024) review: Zendaya Holds It Up | Extramovies");
    expect(html).toContain(`<title>${expected}</title>`);
    expect(html).toContain(`<meta property="og:title" content="${expected}">`);
    expect(html).toMatch(/<h1[^>]*>Zendaya Holds It Up<\/h1>/);
  });

  it("a blank seo_title falls back to the headline", async () => {
    await writeRows([
      storeRow({
        title: "Zendaya Holds It Up",
        slug: "dune-part-two",
        movie: { title: "Dune", year: "2024" },
        seo: { seoTitle: "   " },
      }),
    ]);
    const html = await renderReview("dune-part-two");

    const expected = buildSeoTitle(
      reviewDisplayTitle("Dune", "Zendaya Holds It Up", "2024"),
      await brandName(),
    );
    expect(html).toContain(`<title>${expected}</title>`);
  });
});

describe("featured review: a flagged store row wins the slot", () => {
  it("prefers the flagged store row over the flagged DEMO row", async () => {
    await writeRows([storeRow({ featured: true })]);
    const featured = getFeaturedReview();
    expect(featured?.slug).toBe("spider-man-brand-new-day-2026-review");
    expect(featured?.featured).toBe(true);
  });

  it("still gives the DEMO feature to a site with no flagged store row", async () => {
    await writeRows([storeRow()]);
    const featured = getFeaturedReview();
    expect(featured?.slug).toBe("dune-part-two");
    expect(featured?.featured).toBe(true);
  });

  it("keeps the DEMO feature for a brand that cannot see the flagged row", async () => {
    process.env.SITE_ID = "cinemavilla";
    await writeRows([storeRow({ featured: true, sites: ["extramovies"] })]);
    expect(getFeaturedReview()?.slug).toBe("dune-part-two");
  });

  it("never edits the shared DEMO pack", async () => {
    await writeRows([storeRow({ featured: true })]);
    // The DEMO row itself is untouched — the flag lives on the store row.
    const { DEMO_REVIEWS } = await import("../src/lib/seo/content");
    const dune = DEMO_REVIEWS.find((r) => r.slug === "dune-part-two");
    expect(dune?.featured).toBe(true);
    expect(dune?.fromStore).toBeUndefined();
  });
});

/** A seed .md file with the given frontmatter lines. */
async function makeSeed(slug: string, lines: string[]): Promise<string> {
  const file = path.join(dir, `${slug}.md`);
  const md = [
    "---",
    `title: Seed ${slug}`,
    `slug: ${slug}`,
    "rating: 7",
    'published_at: "2026-10-21T09:00:00.000Z"',
    ...lines,
    "---",
    "",
    "Seed body copy.",
    "",
  ].join("\n");
  await fs.writeFile(file, md, "utf8");
  return file;
}

describe("import: the featured flag comes from the frontmatter", () => {
  it("writes featured: true onto the row", async () => {
    const file = await makeSeed("featured-film", ["featured: true"]);
    const { importMarkdown } = await import("../scripts/import");
    await importMarkdown(file, { dbPath: dbFile, skipExisting: true, refresh: true });

    const rows = JSON.parse(await fs.readFile(dbFile, "utf8"));
    expect(rows[0].featured).toBe(true);
  });

  it("ignores a non-boolean featured value", async () => {
    const file = await makeSeed("not-a-flag-film", ['featured: "yes"']);
    const { importMarkdown } = await import("../scripts/import");
    const r = await importMarkdown(file, { dbPath: dbFile, skipExisting: true, refresh: true });

    const rows = JSON.parse(await fs.readFile(dbFile, "utf8"));
    expect(rows[0].featured).toBeUndefined();
    expect(r.errors).toEqual([]);
  });

  it("leaves the flag alone when the seed carries none", async () => {
    const file = await makeSeed("plain-film", []);
    const { importMarkdown } = await import("../scripts/import");
    await importMarkdown(file, { dbPath: dbFile, skipExisting: true, refresh: true });

    const rows = JSON.parse(await fs.readFile(dbFile, "utf8"));
    expect(rows[0].featured).toBeUndefined();
  });

  it("refreshes the flag on a published row the seed manages", async () => {
    await writeRows([
      {
        id: "owner-row",
        title: "Owner title",
        slug: "managed-film",
        excerpt: "Owner excerpt.",
        markdown: "Owner body.",
        status: "published",
        rating: 9,
        publishedAt: "2026-10-01T00:00:00.000Z",
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
        sites: ["extramovies"],
      },
    ]);
    const file = await makeSeed("managed-film", [
      'managed_fields: "[\\"featured\\"]"',
      "featured: true",
    ]);
    const { importMarkdown } = await import("../scripts/import");
    const r = await importMarkdown(file, { dbPath: dbFile, skipExisting: true, refresh: true });

    expect(r.refreshed).toEqual([{ slug: "managed-film", fields: ["featured"] }]);
    const rows = JSON.parse(await fs.readFile(dbFile, "utf8"));
    expect(rows[0].featured).toBe(true);
    // The owner's own fields stay put.
    expect(rows[0].title).toBe("Owner title");
    expect(rows[0].rating).toBe(9);
    expect(rows[0].status).toBe("published");
  });
});
