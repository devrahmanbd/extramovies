import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { experimental_AstroContainer } from "astro/container";
import NewThisWeek from "../src/components/discover/NewThisWeek.astro";
import { getLatestReviews } from "../src/lib/seo/content";
import {
  WEEK_WINDOW_DAYS,
  daysSince,
  freshnessLabel,
  publishDateLabel,
  reviewsPublishedWithin,
  weeklyCutoff,
} from "../src/lib/seo/weekly";
import type { PublicReview } from "../src/lib/seo/content";

/**
 * The "new movie reviews this week" module (discovery home).
 *
 * Two layers are asserted: the pure weekly window (src/lib/seo/weekly.ts)
 * and the rendered module (src/components/discover/NewThisWeek.astro).
 * The render runs through Astro's container API, so the assertions read
 * the same markup a reader (and a crawler) gets.
 */

const NOW = new Date("2026-10-21T12:00:00.000Z");

async function render(props: Record<string, unknown>): Promise<string> {
  const container = await experimental_AstroContainer.create();
  return container.renderToString(NewThisWeek as never, { props });
}

/** A published review row as the store holds it. */
function storeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "t-1",
    title: "Store Headline",
    slug: "store-only-film",
    excerpt: "A store-backed verdict.",
    markdown: "Store body.",
    status: "published",
    rating: 7.5,
    movie: { title: "Store Film", year: "2023", genres: ["Drama"] },
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    publishedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

/** A public review row (the loader's output shape). */
function review(overrides: Partial<PublicReview> = {}): PublicReview {
  return {
    slug: "masaan-2015-review",
    reviewTitle: "Masaan Review: A Patient Varanasi Drama",
    movieTitle: "Masaan",
    year: 2015,
    genres: ["Drama"],
    runtimeMinutes: null,
    rating: 7.5,
    verdict: "Watch it. Ghaywan's Varanasi debut earns its sadness.",
    excerpt: "Watch it. Ghaywan's Varanasi debut earns its sadness.",
    bodyMarkdown: "Body copy.",
    posterUrl: null,
    backdropUrl: null,
    director: "Neeraj Ghaywan",
    cast: ["Vicky Kaushal"],
    publishedAt: "2026-10-20T10:50:19.494Z",
    updatedAt: "2026-10-20T10:50:19.494Z",
    authorName: "The Editor",
    providers: null,
    customWatch: null,
    tmdbId: 336203,
    ...overrides,
  };
}

describe("weekly window (pure)", () => {
  it("keeps only the reviews published inside the last 7 days", () => {
    const inside = review({ slug: "inside", publishedAt: "2026-10-20T10:00:00.000Z" });
    const edge = review({ slug: "edge", publishedAt: "2026-10-14T12:00:00.000Z" });
    const outside = review({ slug: "outside", publishedAt: "2026-10-14T11:59:59.000Z" });
    const future = review({ slug: "future", publishedAt: "2026-10-22T10:00:00.000Z" });

    const inWindow = reviewsPublishedWithin([inside, edge, outside, future], NOW);

    expect(inWindow.map((r) => r.slug)).toEqual(["inside", "edge"]);
    expect(WEEK_WINDOW_DAYS).toBe(7);
    expect(weeklyCutoff(NOW).toISOString()).toBe("2026-10-14T12:00:00.000Z");
  });

  it("orders the window newest first", () => {
    const older = review({ slug: "older", publishedAt: "2026-10-15T10:00:00.000Z" });
    const newer = review({ slug: "newer", publishedAt: "2026-10-20T10:00:00.000Z" });
    const newest = review({ slug: "newest", publishedAt: "2026-10-21T08:00:00.000Z" });

    expect(reviewsPublishedWithin([older, newer, newest], NOW).map((r) => r.slug)).toEqual([
      "newest",
      "newer",
      "older",
    ]);
  });

  it("skips a row whose publish date cannot be read, and never throws", () => {
    const broken = { ...review({ slug: "broken" }), publishedAt: "not a date" };
    expect(reviewsPublishedWithin([broken], NOW)).toEqual([]);
    expect(reviewsPublishedWithin([], NOW)).toEqual([]);
    expect(reviewsPublishedWithin(undefined as never, NOW)).toEqual([]);
  });

  it("counts a review once even when the input repeats it", () => {
    const once = review({ slug: "masaan-2015-review" });
    const twice = review({ slug: "masaan-2015-review" });
    expect(reviewsPublishedWithin([once, twice], NOW).map((r) => r.slug)).toEqual([
      "masaan-2015-review",
    ]);
  });

  it("labels freshness in plain words", () => {
    expect(freshnessLabel("2026-10-21T09:00:00.000Z", NOW)).toBe("Today");
    expect(freshnessLabel("2026-10-20T09:00:00.000Z", NOW)).toBe("Yesterday");
    expect(freshnessLabel("2026-10-18T09:00:00.000Z", NOW)).toBe("3 days ago");
    expect(freshnessLabel("not a date", NOW)).toBe("This week");
    expect(daysSince("2026-10-18T09:00:00.000Z", NOW)).toBe(3);
    expect(publishDateLabel("2026-10-20T10:50:19.494Z")).toBe("October 20, 2026");
    expect(publishDateLabel("not a date")).toBe("");
  });
});

describe("weekly window over the store", () => {
  let dir = "";
  let dbFile = "";
  let savedPath: string | undefined;

  beforeEach(async () => {
    savedPath = process.env.REVIEWS_DB_PATH;
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "new-this-week-"));
    dbFile = path.join(dir, "reviews.json");
    await fs.writeFile(dbFile, "[]", "utf8");
    process.env.REVIEWS_DB_PATH = dbFile;
  });

  afterEach(async () => {
    if (savedPath === undefined) delete process.env.REVIEWS_DB_PATH;
    else process.env.REVIEWS_DB_PATH = savedPath;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("drops an old review from the module but keeps it on the site", async () => {
    await fs.writeFile(
      dbFile,
      JSON.stringify([
        storeRow({
          id: "old",
          slug: "older-film",
          title: "Older Film",
          publishedAt: "2026-10-01T10:00:00.000Z",
        }),
        storeRow({
          id: "new",
          slug: "newer-film",
          title: "Newer Film",
          publishedAt: "2026-10-20T10:00:00.000Z",
        }),
      ]),
      "utf8",
    );

    const published = getLatestReviews(1000);
    const inWindow = reviewsPublishedWithin(published, NOW);

    // Still on the site (archive, sitemap, taxonomy hubs).
    expect(published.map((r) => r.slug)).toContain("older-film");
    // Out of the weekly module.
    expect(inWindow.map((r) => r.slug)).not.toContain("older-film");
    expect(inWindow.map((r) => r.slug)).toContain("newer-film");
  });

  it("keeps drafts and other brands out of the module", async () => {
    await fs.writeFile(
      dbFile,
      JSON.stringify([
        storeRow({ id: "d", slug: "draft-film", status: "draft" }),
        storeRow({ id: "f", slug: "future-film", publishedAt: "2026-12-01T10:00:00.000Z" }),
      ]),
      "utf8",
    );

    const inWindow = reviewsPublishedWithin(getLatestReviews(1000), NOW);
    expect(inWindow.map((r) => r.slug)).not.toContain("draft-film");
    expect(inWindow.map((r) => r.slug)).not.toContain("future-film");
  });

  it("links every review the week brought from the homepage module", async () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      storeRow({
        id: `batch-${i}`,
        slug: `batch-film-${i}`,
        title: `Batch Film ${i}`,
        movie: { title: `Batch Film ${i}`, year: "2026", genres: ["Drama"] },
        publishedAt: new Date(NOW.getTime() - i * 3_600_000).toISOString(),
      }),
    );
    await fs.writeFile(dbFile, JSON.stringify(rows), "utf8");

    const inWindow = reviewsPublishedWithin(getLatestReviews(1000), NOW);
    expect(inWindow).toHaveLength(20);

    const html = await render({ reviews: inWindow, now: NOW });
    for (const r of inWindow) {
      expect(html).toContain(`href="/reviews/${r.slug}"`);
    }
    // Every new review is one click from the homepage, not only the archive.
    const hrefs = html.match(/href="\/reviews\/[^"]+"/g) ?? [];
    expect(hrefs).toHaveLength(20);
  });
});

describe("new this week module (rendered)", () => {
  it("renders title, year, score, verdict and a freshness label", async () => {
    const html = await render({ reviews: [review()], now: NOW });

    expect(html).toContain("New movie reviews this week");
    expect(html).toContain("Masaan");
    expect(html).toContain("(2015)");
    expect(html).toContain("7.5");
    expect(html).toContain("/10");
    expect(html).toContain("Watch it. Ghaywan&#39;s Varanasi debut earns its sadness.");
    expect(html).toContain("Yesterday");
    expect(html).toContain("October 20, 2026");
    expect(html).toContain("1 review");
  });

  it("links each row to the review page", async () => {
    const html = await render({ reviews: [review()], now: NOW });
    expect(html).toContain('href="/reviews/masaan-2015-review"');
  });

  it("renders nothing at all when the week brought no published review", async () => {
    const html = await render({ reviews: [], now: NOW });
    expect(html.trim()).toBe("");
    expect(html).not.toContain("New movie reviews this week");
    expect(html).not.toContain("<h2");
  });

  it("lists a review once, on the same URL its title hub links to", async () => {
    const html = await render({ reviews: [review(), review()], now: NOW });
    const hrefs = html.match(/href="\/reviews\/masaan-2015-review"/g) ?? [];
    expect(hrefs).toHaveLength(1);
    // The title hub (/movies/<tmdbId>) links back to the same canonical
    // review URL, so the internal links never split.
    expect(html).toContain('href="/reviews/masaan-2015-review"');
  });

  it("shows no score for a review the owner has not scored yet", async () => {
    const html = await render({ reviews: [review({ rating: 0 })], now: NOW });
    expect(html).not.toContain("0.0");
    expect(html).not.toContain("/10");
    expect(html).toContain("Not scored yet");
  });
});
