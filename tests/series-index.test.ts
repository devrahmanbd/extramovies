import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { experimental_AstroContainer } from "astro/container";
import SeriesIndexPage from "../src/pages/series/index.astro";

/**
 * The /series index — the page the brand query ("extramovies web series")
 * lands on.
 *
 * Hermetic: every test drives a fixture store (REVIEWS_DB_PATH) and stubs
 * the network, so the assertions never depend on the site's own review
 * corpus, on TMDB, or on the box's TMDB key.
 *
 * The rules under test (AGENTS.md §3, §5):
 *   - the index lists the site's own PUBLISHED series reviews, newest first;
 *   - it is indexable when it has content and `noindex, follow` when it has
 *     none (and it still renders — an honest empty state, never a blank);
 *   - a series hub joins the sitemap only when a published series review is
 *     attached to it, and a film hub only when the review is NOT a series;
 *   - the chrome links to /series in both themes.
 */

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

const savedEnv = { ...process.env };
const realFetch = globalThis.fetch;

/** A published store row (src/pages/api/admin/_store.ts Review shape). */
function row(opts: {
  id: string;
  slug: string;
  title: string;
  publishedAt: string;
  status?: "published" | "draft";
  mediaType?: "movie" | "tv";
  tmdbId?: number;
  imdbId?: string;
}) {
  return {
    id: opts.id,
    title: opts.title,
    slug: opts.slug,
    excerpt: `${opts.title}, in one honest line.`,
    markdown: `The body of ${opts.title}.`,
    status: opts.status ?? "published",
    rating: 6.5,
    createdAt: opts.publishedAt,
    updatedAt: opts.publishedAt,
    publishedAt: opts.publishedAt,
    ...(opts.mediaType ? { mediaType: opts.mediaType } : {}),
    ...(opts.imdbId ? { imdbId: opts.imdbId } : {}),
    movie: {
      title: opts.title.replace(/ Review.*$/, ""),
      year: "2015",
      ...(opts.tmdbId ? { tmdbId: opts.tmdbId } : {}),
    },
    ...(opts.tmdbId ? { tmdbId: opts.tmdbId } : {}),
  };
}

/** Point the store at a throwaway fixture file. */
function useFixtureStore(rows: unknown[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "series-index-store-"));
  const file = path.join(dir, "reviews.json");
  fs.writeFileSync(file, JSON.stringify(rows));
  process.env.REVIEWS_DB_PATH = file;
  return file;
}

/** Render a page component the way SSR would (the real route output). */
async function renderPage(Page: unknown, route: string): Promise<string> {
  const container = await experimental_AstroContainer.create();
  return container.renderToString(Page as never, {
    request: new Request(`https://extramovies.test${route}`),
  });
}

/** The sitemap the route serves, as XML. */
async function sitemapXml(): Promise<string> {
  const { GET } = await import("../src/pages/sitemap.xml");
  const res = (await GET({ url: new URL("https://example.com/sitemap.xml") } as never)) as Response;
  return res.text();
}

beforeEach(() => {
  delete process.env.SITE_ID;
  delete process.env.SITE_THEME;
  delete process.env.SITE_URL;
  // No network in tests: the media-type lookup fails soft to "unknown", so a
  // row is only ever a series when the fixture pins it.
  globalThis.fetch = (async () => {
    throw new Error("network disabled in tests");
  }) as never;
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  process.env = { ...savedEnv };
  const { clearMediaTypeCache } = await import("../src/lib/tmdb/media-type");
  clearMediaTypeCache();
});

describe("series index: the data source is the published store rows", () => {
  it("lists the published series reviews, newest first, and only those", async () => {
    useFixtureStore([
      row({
        id: "s1",
        slug: "neverland-2011-review",
        title: "Neverland Review",
        publishedAt: "2026-10-21T09:00:00.000Z",
        mediaType: "tv",
        tmdbId: 43720,
        imdbId: "tt1720619",
      }),
      row({
        id: "s2",
        slug: "hitler-the-rise-of-evil-2003-review",
        title: "Hitler: The Rise of Evil Review",
        publishedAt: "2026-10-20T09:00:00.000Z",
        mediaType: "tv",
        tmdbId: 46976,
        imdbId: "tt0346293",
      }),
      row({
        id: "f1",
        slug: "a-film-review",
        title: "A Film Review",
        publishedAt: "2026-10-22T09:00:00.000Z",
        mediaType: "movie",
        tmdbId: 693134,
        imdbId: "tt15239678",
      }),
      row({
        id: "s3",
        slug: "draft-series-review",
        title: "Draft Series Review",
        publishedAt: "2026-10-23T09:00:00.000Z",
        status: "draft",
        mediaType: "tv",
        tmdbId: 12345,
      }),
    ]);

    const { getSeriesReviews, getMovieReviews } = await import("../src/lib/seo/series-reviews");
    const series = await getSeriesReviews(100);
    expect(series.map((r) => r.slug)).toEqual([
      "neverland-2011-review",
      "hitler-the-rise-of-evil-2003-review",
    ]);
    // The film review is not a series; the draft never appears anywhere.
    expect(series.some((r) => r.slug === "a-film-review")).toBe(false);
    expect(series.some((r) => r.slug === "draft-series-review")).toBe(false);
    const films = await getMovieReviews(100);
    expect(films.some((r) => r.slug === "a-film-review")).toBe(true);
    expect(films.some((r) => r.slug === "neverland-2011-review")).toBe(false);
  });

  it("the page renders the series titles, the review links and the hub links", async () => {
    useFixtureStore([
      row({
        id: "s1",
        slug: "neverland-2011-review",
        title: "Neverland Review",
        publishedAt: "2026-10-21T09:00:00.000Z",
        mediaType: "tv",
        tmdbId: 43720,
        imdbId: "tt1720619",
      }),
      row({
        id: "f1",
        slug: "a-film-review",
        title: "A Film Review",
        publishedAt: "2026-10-22T09:00:00.000Z",
        mediaType: "movie",
        tmdbId: 693134,
      }),
    ]);

    const html = await renderPage(SeriesIndexPage, "/series");
    expect(html).toContain("<h1");
    // The review's own title and the link to the review.
    expect(html).toContain("Neverland Review");
    expect(html).toContain('href="/reviews/neverland-2011-review"');
    // The link to the series hub.
    expect(html).toContain('href="/series/43720"');
    // A film review is not listed here.
    expect(html).not.toContain('href="/reviews/a-film-review"');
    // Indexable because the page has content.
    expect(html).toContain('<meta name="robots" content="index, follow">');
  });

  it("the intro says what the section is and claims no size", async () => {
    useFixtureStore([
      row({
        id: "s1",
        slug: "neverland-2011-review",
        title: "Neverland Review",
        publishedAt: "2026-10-21T09:00:00.000Z",
        mediaType: "tv",
        tmdbId: 43720,
      }),
    ]);
    const { seriesIntro, seriesDescription, seriesCountText } = await import(
      "../src/lib/seo/series-reviews"
    );
    const intro = seriesIntro("Extramovies", 3);
    expect(intro).toBe("Every web and television series Extramovies has reviewed, newest first.");
    // No invented size, no "complete collection" language.
    expect(intro).not.toMatch(/complete|every series|all series|\d+\s+series/i);
    expect(seriesDescription("Extramovies")).not.toMatch(/complete|collection/i);
    expect(seriesCountText(1)).toBe("1 review");
    expect(seriesCountText(3)).toBe("3 reviews");
    // With nothing published the intro says exactly that.
    expect(seriesIntro("Extramovies", 0)).toBe(
      "No web or television series review is published on Extramovies yet.",
    );
    expect(seriesDescription("Extramovies", 0)).not.toMatch(/has reviewed/i);
  });

  it("the meta description lands in the 150-160 band, never cut mid-phrase", async () => {
    const { seriesDescription } = await import("../src/lib/seo/series-reviews");
    const withContent = seriesDescription("Extramovies", 3);
    expect(withContent.length).toBeGreaterThanOrEqual(150);
    expect(withContent.length).toBeLessThanOrEqual(160);
    expect(withContent).not.toContain("…");
    const empty = seriesDescription("Extramovies", 0);
    expect(empty.length).toBeGreaterThanOrEqual(150);
    expect(empty.length).toBeLessThanOrEqual(160);
    expect(empty).not.toContain("…");
  });
});

describe("series index: the empty state is honest and not indexed", () => {
  it("renders a page (never a blank) with an empty state and noindex", async () => {
    useFixtureStore([
      row({
        id: "f1",
        slug: "a-film-review",
        title: "A Film Review",
        publishedAt: "2026-10-22T09:00:00.000Z",
        mediaType: "movie",
        tmdbId: 693134,
      }),
    ]);

    const html = await renderPage(SeriesIndexPage, "/series");
    // The page renders: a title, a heading and the empty state.
    expect(html).toContain("<h1");
    expect(html).toContain("Web series reviews");
    expect(html).toContain("Nothing to list here yet");
    expect(html).toContain('href="/reviews"');
    // The intro says there is nothing published, instead of implying a
    // collection the site does not have.
    expect(html).toContain("No web or television series review is published on");
    expect(html).not.toContain("has reviewed, newest first");
    // Nothing to index, so the page says so.
    expect(html).toContain('<meta name="robots" content="noindex, follow">');
    // And it is not pretending to list anything.
    expect(html).not.toContain('href="/reviews/a-film-review"');
  });

  it("is not listed in the sitemap when it is empty", async () => {
    useFixtureStore([
      row({
        id: "f1",
        slug: "a-film-review",
        title: "A Film Review",
        publishedAt: "2026-10-22T09:00:00.000Z",
        mediaType: "movie",
        tmdbId: 693134,
      }),
    ]);
    const xml = await sitemapXml();
    expect(xml).not.toContain("<loc>https://example.com/series</loc>");
    expect(xml).toContain("<loc>https://example.com/reviews/a-film-review</loc>");
  });

  it("is listed in the sitemap once it has content", async () => {
    useFixtureStore([
      row({
        id: "s1",
        slug: "neverland-2011-review",
        title: "Neverland Review",
        publishedAt: "2026-10-21T09:00:00.000Z",
        mediaType: "tv",
        tmdbId: 43720,
        imdbId: "tt1720619",
      }),
    ]);
    const xml = await sitemapXml();
    expect(xml).toContain("<loc>https://example.com/series</loc>");
  });
});

describe("series hubs in the sitemap: review-driven, like the film hubs", () => {
  it("lists the hub of a published series review, not a film hub for it", async () => {
    useFixtureStore([
      row({
        id: "s1",
        slug: "neverland-2011-review",
        title: "Neverland Review",
        publishedAt: "2026-10-21T09:00:00.000Z",
        mediaType: "tv",
        tmdbId: 43720,
        imdbId: "tt1720619",
      }),
    ]);
    const xml = await sitemapXml();
    expect(xml).toContain("<loc>https://example.com/series/43720</loc>");
    // The same number in the film namespace is a different film: it must not
    // be listed as one.
    expect(xml).not.toContain("<loc>https://example.com/movies/43720</loc>");
    // The review itself is still listed.
    expect(xml).toContain("<loc>https://example.com/reviews/neverland-2011-review</loc>");
  });

  it("does not list a hub for a series review without a TMDB id", async () => {
    useFixtureStore([
      row({
        id: "s1",
        slug: "unlinked-series-review",
        title: "Unlinked Series Review",
        publishedAt: "2026-10-21T09:00:00.000Z",
        mediaType: "tv",
      }),
    ]);
    const xml = await sitemapXml();
    expect(xml).toContain("<loc>https://example.com/series</loc>");
    expect(xml).not.toContain("<loc>https://example.com/series/unlinked");
    expect(xml).not.toMatch(/<loc>https:\/\/example\.com\/series\/\d+<\/loc>/);
  });

  it("keeps the film hub for a film review", async () => {
    useFixtureStore([
      row({
        id: "f1",
        slug: "a-film-review",
        title: "A Film Review",
        publishedAt: "2026-10-22T09:00:00.000Z",
        mediaType: "movie",
        tmdbId: 693134,
      }),
    ]);
    const xml = await sitemapXml();
    expect(xml).toContain("<loc>https://example.com/movies/693134</loc>");
    expect(xml).not.toContain("<loc>https://example.com/series/693134</loc>");
  });
});

describe("series index: the chrome links to /series in both themes", () => {
  /** The footer markup (the chrome the reader sees on every page). */
  function footerOf(html: string): string {
    const start = html.indexOf("<footer");
    return start >= 0 ? html.slice(start) : "";
  }

  it("carries the link in the discovery chrome", async () => {
    process.env.SITE_THEME = "discovery";
    useFixtureStore([]);
    const html = await renderPage(SeriesIndexPage, "/series");
    expect(footerOf(html)).toContain('href="/series"');
    expect(html).toContain('href="/series"');
  });

  it("carries the link in the publication chrome", async () => {
    process.env.SITE_THEME = "publication";
    useFixtureStore([]);
    const html = await renderPage(SeriesIndexPage, "/series");
    expect(footerOf(html)).toContain('href="/series"');
    expect(html).toContain('href="/series"');
  });
});

describe("media type: the row's own tag wins, and the lookup never guesses", () => {
  it("a pinned media type is the answer, with no lookup at all", async () => {
    const { resolveMediaType, pinnedMediaType } = await import("../src/lib/seo/series-reviews");
    const review = {
      slug: "x",
      reviewTitle: "X",
      movieTitle: "X",
      year: 2015,
      genres: [],
      runtimeMinutes: null,
      rating: 6,
      verdict: "v",
      excerpt: "v",
      bodyMarkdown: "b",
      posterUrl: null,
      backdropUrl: null,
      director: null,
      cast: [],
      publishedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      authorName: "The Editor",
      providers: null,
      tmdbId: 43720,
      mediaType: "tv" as const,
    };
    expect(pinnedMediaType(review)).toBe("tv");
    expect(await resolveMediaType(review)).toBe("tv");
  });

  it("a row the site cannot classify stays unknown, never a guess", async () => {
    const { resolveMediaType } = await import("../src/lib/seo/series-reviews");
    const review = {
      slug: "x",
      reviewTitle: "X",
      movieTitle: "X",
      year: 2015,
      genres: [],
      runtimeMinutes: null,
      rating: 6,
      verdict: "v",
      excerpt: "v",
      bodyMarkdown: "b",
      posterUrl: null,
      backdropUrl: null,
      director: null,
      cast: [],
      publishedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      authorName: "The Editor",
      providers: null,
      tmdbId: 43720,
    };
    // The network is stubbed to fail: the answer is "unknown", not a guess.
    expect(await resolveMediaType(review)).toBeNull();
  });

  it("the title matcher folds accents and punctuation", async () => {
    const { normalizeTitle } = await import("../src/lib/tmdb/media-type");
    expect(normalizeTitle("Hitler: The Rise of Evil")).toBe("hitler the rise of evil");
    expect(normalizeTitle("Ang Probinsyano")).toBe("ang probinsyano");
    expect(normalizeTitle("  Neverland  ")).toBe("neverland");
  });
});

describe("series index: the route is a live route for the legacy archive", () => {
  it("the legacy router passes /series through to the app", async () => {
    const { isLiveRoute, LIVE_ROUTE_PATTERNS } = await import("../src/lib/legacy/router");
    expect(LIVE_ROUTE_PATTERNS).toContain("/series");
    expect(isLiveRoute("/series")).toBe(true);
  });

  it("the page is a real file on disk", () => {
    expect(fs.existsSync(path.join(root, "src", "pages", "series", "index.astro"))).toBe(true);
  });
});
