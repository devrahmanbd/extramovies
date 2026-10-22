import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { experimental_AstroContainer } from "astro/container";
import UpcomingPage from "../src/pages/upcoming.astro";

/**
 * The /upcoming page — the editorial "what is coming" list.
 *
 * Hermetic: every test drives a fixture store (REVIEWS_DB_PATH) and stubs
 * the network, so the assertions never depend on TMDB, on the site's own
 * review corpus, or on the box's TMDB key.
 *
 * The rules under test (AGENTS.md §3, §5):
 *   - the page answers 200 and groups the films by release month, oldest
 *     month first;
 *   - a film we have published a review for links to that review and to its
 *     hub; a film we have not says so in plain words;
 *   - NO unreleased film carries a rating, a score or a verdict;
 *   - the page is indexable and sits in the sitemap as a site page;
 *   - with no TMDB answer it still answers 200 with an honest empty state;
 *   - the chrome links to /upcoming in both themes.
 */

const root = path.resolve(__dirname, "..");
const savedEnv = { ...process.env };
const realFetch = globalThis.fetch;

/** A published store row (src/pages/api/admin/_store.ts Review shape). */
function row(opts: {
  id: string;
  slug: string;
  title: string;
  publishedAt: string;
  status?: "published" | "draft";
  tmdbId?: number;
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
    movie: {
      title: opts.title.replace(/ Review.*$/, ""),
      year: "2026",
      ...(opts.tmdbId ? { tmdbId: opts.tmdbId } : {}),
    },
    ...(opts.tmdbId ? { tmdbId: opts.tmdbId } : {}),
  };
}

/** Point the store at a throwaway fixture file. */
function useFixtureStore(rows: unknown[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "upcoming-store-"));
  const file = path.join(dir, "reviews.json");
  fs.writeFileSync(file, JSON.stringify(rows));
  process.env.REVIEWS_DB_PATH = file;
  return file;
}

/** Render the route the way SSR would (the real page component). */
async function renderPage(route = "/upcoming"): Promise<{
  status: number;
  html: string;
  main: string;
}> {
  const container = await experimental_AstroContainer.create();
  const response = await container.renderToResponse(UpcomingPage as never, {
    request: new Request(`https://extramovies.test${route}`),
  });
  const html = await response.text();
  const start = html.indexOf("<main");
  const end = html.indexOf("</main>");
  return {
    status: response.status,
    html,
    main: start >= 0 && end > start ? html.slice(start, end) : html,
  };
}

/** The sitemap the route serves, as XML. */
async function sitemapXml(): Promise<string> {
  const { GET } = await import("../src/pages/sitemap.xml");
  const res = (await GET({ url: new URL("https://example.com/sitemap.xml") } as never)) as Response;
  return res.text();
}

/** A date inside the window the page asks TMDB for, in a known month. */
function dateInMonth(monthsAhead: number, day: number): string {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthsAhead, day),
  );
  return d.toISOString().slice(0, 10);
}

/** An independent month label (not the page's own helper). */
function monthLabelOf(isoDate: string): string {
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(isoDate);
  if (!m) throw new Error(`bad fixture date: ${isoDate}`);
  return `${names[Number(m[2]) - 1]} ${m[1]}`;
}

/** The TMDB films the stub answers /discover/movie with. */
interface FixtureFilm {
  id: number;
  title: string;
  release_date: string;
}

const FILM_A: FixtureFilm = { id: 900001, title: "Fixture Film A", release_date: "" };
const FILM_B: FixtureFilm = { id: 900002, title: "Fixture Film B", release_date: "" };
const FILM_C: FixtureFilm = { id: 900003, title: "Fixture Film C", release_date: "" };
const LATER_ID = 1540305;

function fixtureFilms(): FixtureFilm[] {
  FILM_A.release_date = dateInMonth(1, 6);
  FILM_B.release_date = dateInMonth(1, 20);
  FILM_C.release_date = dateInMonth(2, 12);
  return [FILM_A, FILM_B, FILM_C];
}

/**
 * The TMDB stub: /discover/movie answers the window list, /movie/<id>
 * answers the credits. Anything else is a network error (no test may reach
 * the real internet).
 */
function stubTmdb(opts: { films: FixtureFilm[]; later?: boolean }): void {
  const films = opts.films;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const raw = typeof input === "string" ? input : String(input);
    const url = new URL(raw);
    if (url.hostname !== "api.themoviedb.org") {
      throw new Error(`network disabled in tests: ${url.toString()}`);
    }
    // TMDB's API lives under /3 — compare the path after that prefix.
    const path = url.pathname.replace(/^\/3/, "");
    if (path === "/discover/movie") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ results: films }),
      } as unknown as Response;
    }
    if (path === `/movie/${LATER_ID}`) {
      if (!opts.later) {
        return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: LATER_ID,
          title: "Call of Duty",
          release_date: "2028-06-28",
          runtime: 0,
          credits: {
            crew: [{ name: "Peter Berg", job: "Director" }],
            cast: [{ name: "Mads Mikkelsen", order: 0 }],
          },
        }),
      } as unknown as Response;
    }
    const film = films.find((f) => path === `/movie/${f.id}`);
    if (film) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: film.id,
          title: film.title,
          release_date: film.release_date,
          runtime: 120,
          credits: {
            crew: [{ name: "Fixture Director", job: "Director" }],
            cast: [
              { name: "Fixture Cast One", order: 0 },
              { name: "Fixture Cast Two", order: 1 },
            ],
          },
          certifications: {},
        }),
      } as unknown as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
  }) as never;
}

beforeEach(async () => {
  process.env.TMDB_API_KEY = "test-key";
  delete process.env.SITE_ID;
  delete process.env.SITE_THEME;
  delete process.env.SITE_URL;
  const { clearDiscoverCache } = await import("../src/lib/tmdb/discover");
  clearDiscoverCache();
  const { clearUpcomingDetailsCache } = await import("../src/lib/tmdb/upcoming");
  clearUpcomingDetailsCache();
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  process.env = { ...savedEnv };
  const { clearDiscoverCache } = await import("../src/lib/tmdb/discover");
  clearDiscoverCache();
  const { clearUpcomingDetailsCache } = await import("../src/lib/tmdb/upcoming");
  clearUpcomingDetailsCache();
});

describe("upcoming page: the route answers 200 and groups the films by month", () => {
  it("renders the month buckets, oldest month first", async () => {
    useFixtureStore([]);
    stubTmdb({ films: fixtureFilms(), later: true });

    const { status, html, main } = await renderPage();

    expect(status).toBe(200);
    expect(main).toContain("<h1");
    // One heading per month bucket, in the order the months come.
    const headings = [...main.matchAll(/<h3 id="up-month-(\d{4}-\d{2})"[^>]*>([^<]+)<\/h3>/g)];
    expect(headings).toHaveLength(2);
    expect(headings[0]?.[1]).toBe(dateInMonth(1, 6).slice(0, 7));
    expect(headings[1]?.[1]).toBe(dateInMonth(2, 12).slice(0, 7));
    expect(headings[0]?.[2]).toBe(monthLabelOf(dateInMonth(1, 6)));
    expect(headings[1]?.[2]).toBe(monthLabelOf(dateInMonth(2, 12)));
    // Every film is on the page, with its release date.
    expect(main).toContain("Fixture Film A");
    expect(main).toContain("Fixture Film B");
    expect(main).toContain("Fixture Film C");
    expect(main).toContain(`<time datetime="${FILM_A.release_date}"`);
    // The credits TMDB states are printed.
    expect(main).toContain("Fixture Director");
    expect(main).toContain("Fixture Cast One");
  });

  it("each film sits under the month it is released in", async () => {
    useFixtureStore([]);
    stubTmdb({ films: fixtureFilms(), later: true });

    const { main } = await renderPage();
    const firstMonth = main.slice(
      main.indexOf(`up-month-${dateInMonth(1, 6).slice(0, 7)}`),
      main.indexOf(`up-month-${dateInMonth(2, 12).slice(0, 7)}`),
    );
    const secondMonth = main.slice(
      main.indexOf(`up-month-${dateInMonth(2, 12).slice(0, 7)}`),
    );
    expect(firstMonth).toContain("Fixture Film A");
    expect(firstMonth).toContain("Fixture Film B");
    expect(firstMonth).not.toContain("Fixture Film C");
    expect(secondMonth).toContain("Fixture Film C");
    expect(secondMonth).not.toContain("Fixture Film A");
  });

  it("the later bucket holds the film that sits beyond the window", async () => {
    useFixtureStore([]);
    stubTmdb({ films: fixtureFilms(), later: true });

    const { main } = await renderPage();
    expect(main).toContain("Later, further out");
    expect(main).toContain("Call of Duty");
    expect(main).toContain("2028-06-28");
    // The date is called provisional, not promised.
    expect(main).toMatch(/provisional/i);
  });
});

describe("upcoming page: the coverage marker says what we have done", () => {
  it("a film we have reviewed links to the review and to the hub", async () => {
    useFixtureStore([
      row({
        id: "u1",
        slug: "fixture-film-a-2026-review",
        title: "Fixture Film A Review",
        publishedAt: "2026-10-21T09:00:00.000Z",
        tmdbId: FILM_A.id,
      }),
    ]);
    stubTmdb({ films: fixtureFilms(), later: true });

    const { main } = await renderPage();
    expect(main).toContain('href="/reviews/fixture-film-a-2026-review"');
    expect(main).toContain(`href="/movies/${FILM_A.id}"`);
  });

  it("a film we have not reviewed says so in plain words", async () => {
    useFixtureStore([
      row({
        id: "u1",
        slug: "fixture-film-a-2026-review",
        title: "Fixture Film A Review",
        publishedAt: "2026-10-21T09:00:00.000Z",
        tmdbId: FILM_A.id,
      }),
    ]);
    stubTmdb({ films: fixtureFilms(), later: true });

    const { main } = await renderPage();
    // The two films we have not written about say so.
    expect(main).toContain("We have not reviewed it yet.");
    // And they carry no review link.
    expect(main).not.toContain('href="/reviews/fixture-film-b-2026-review"');
    expect(main).not.toContain('href="/reviews/fixture-film-c-2026-review"');
  });
});

describe("upcoming page: an unreleased film never carries a number", () => {
  it("prints no rating, no score and no verdict for any film", async () => {
    useFixtureStore([
      row({
        id: "u1",
        slug: "fixture-film-a-2026-review",
        title: "Fixture Film A Review",
        publishedAt: "2026-10-21T09:00:00.000Z",
        tmdbId: FILM_A.id,
      }),
    ]);
    stubTmdb({ films: fixtureFilms(), later: true });

    const { main } = await renderPage();
    // No rating vocabulary at all.
    expect(main).not.toMatch(/\bratings?\b|\bverdicts?\b|\bscores?\b|\bout of ten\b/i);
    // No number in the "X/10" shape.
    expect(main).not.toMatch(/\d+(\.\d+)?\s*\/\s*10/);
    // The runtime is the only number the page prints.
    expect(main).toContain("2h");
  });
});

describe("upcoming page: the page is indexable and in the sitemap", () => {
  it("carries index, follow and a canonical of its own", async () => {
    useFixtureStore([]);
    stubTmdb({ films: fixtureFilms(), later: true });

    const { html } = await renderPage();
    expect(html).toContain('<meta name="robots" content="index, follow">');
    expect(html).toContain('<link rel="canonical" href="https://extramovies.test/upcoming">');
    expect(html).toContain("Upcoming movies and release dates");
  });

  it("is listed in the sitemap as a site page", async () => {
    useFixtureStore([]);
    const xml = await sitemapXml();
    expect(xml).toContain("<loc>https://example.com/upcoming</loc>");
  });
});

describe("upcoming page: the empty state is honest and still answers 200", () => {
  it("renders the empty state when TMDB has nothing for the window", async () => {
    useFixtureStore([]);
    stubTmdb({ films: [], later: false });

    const { status, html, main } = await renderPage();
    expect(status).toBe(200);
    expect(main).toContain("<h1");
    expect(main).toContain("No release dates to show");
    expect(main).toContain("nothing has been guessed");
    // It stays indexable: the page exists, it is just empty today.
    expect(html).toContain('<meta name="robots" content="index, follow">');
  });

  it("renders the empty state when TMDB cannot be reached at all", async () => {
    useFixtureStore([]);
    globalThis.fetch = (async () => {
      throw new Error("network disabled in tests");
    }) as never;

    const { status, main } = await renderPage();
    expect(status).toBe(200);
    expect(main).toContain("No release dates to show");
    expect(main).toContain("could not load the release calendar");
  });

  it("says what is missing when there is no TMDB key", async () => {
    delete process.env.TMDB_API_KEY;
    useFixtureStore([]);
    stubTmdb({ films: [], later: false });

    const { status, main } = await renderPage();
    expect(status).toBe(200);
    expect(main).toContain("No release dates to show");
    expect(main).toContain("needs a TMDB key");
  });
});

describe("upcoming page: the chrome links to /upcoming in both themes", () => {
  function footerOf(html: string): string {
    const start = html.indexOf("<footer");
    return start >= 0 ? html.slice(start) : "";
  }

  it("carries the link in the discovery chrome", async () => {
    process.env.SITE_THEME = "discovery";
    useFixtureStore([]);
    stubTmdb({ films: [], later: false });

    const { html } = await renderPage();
    expect(footerOf(html)).toContain('href="/upcoming"');
  });

  it("carries the link in the publication chrome", async () => {
    process.env.SITE_THEME = "publication";
    useFixtureStore([]);
    stubTmdb({ films: [], later: false });

    const { html } = await renderPage();
    expect(footerOf(html)).toContain('href="/upcoming"');
  });

  it("the browse page links to it as well", async () => {
    const movies = fs.readFileSync(path.join(root, "src", "pages", "movies", "index.astro"), "utf8");
    expect(movies).toContain('href="/upcoming"');
  });
});
