import { describe, expect, it, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.TMDB_API_KEY = "k";
});

describe("parseImportArgs (pure)", () => {
  it("defaults to both/popular/10/US/200/no-resume", async () => {
    const { parseImportArgs } = await import("../scripts/import-tmdb");
    expect(parseImportArgs([])).toMatchObject({
      media: "both",
      source: "popular",
      genreId: null,
      pages: 10,
      region: "US",
      limit: 200,
      resume: false,
    });
  });

  it("parses all flags incl. genre:ID + resume", async () => {
    const { parseImportArgs } = await import("../scripts/import-tmdb");
    const o = parseImportArgs([
      "--media=tv",
      "--source=genre:28",
      "--pages=5",
      "--region=gb",
      "--limit=60",
      "--resume",
    ]);
    expect(o).toMatchObject({
      media: "tv",
      source: "genre",
      genreId: 28,
      pages: 5,
      region: "GB",
      limit: 60,
      resume: true,
    });
  });

  it("supports space-separated values", async () => {
    const { parseImportArgs } = await import("../scripts/import-tmdb");
    const o = parseImportArgs(["--media", "movie", "--pages", "3"]);
    expect(o.media).toBe("movie");
    expect(o.pages).toBe(3);
  });

  it("throws on invalid media/source/pages/limit", async () => {
    const { parseImportArgs } = await import("../scripts/import-tmdb");
    expect(() => parseImportArgs(["--media=film"])).toThrow(/media/);
    expect(() => parseImportArgs(["--source=nope"])).toThrow(/source/);
    expect(() => parseImportArgs(["--source=genre:abc"])).toThrow(/genre/);
    expect(() => parseImportArgs(["--pages=0"])).toThrow(/pages/);
    expect(() => parseImportArgs(["--limit=0"])).toThrow(/limit/);
  });

  it("falls back to US on bad region (fail-soft)", async () => {
    const { parseImportArgs } = await import("../scripts/import-tmdb");
    expect(parseImportArgs(["--region=USA"]).region).toBe("US");
  });
});

describe("rate-limiter math (pure)", () => {
  it("4 req/s -> 250ms gap", async () => {
    const { delayMsForRate, IMPORT_REQ_PER_SEC } = await import(
      "../scripts/import-tmdb"
    );
    expect(IMPORT_REQ_PER_SEC).toBe(4);
    expect(delayMsForRate(4)).toBe(250);
    expect(delayMsForRate(2)).toBe(500);
    expect(delayMsForRate(0)).toBe(250);
  });

  it("waitMsForThrottle honors elapsed time", async () => {
    const { waitMsForThrottle } = await import("../scripts/import-tmdb");
    expect(waitMsForThrottle(0, 1000)).toBe(0); // first request free
    expect(waitMsForThrottle(1000, 1100, 4)).toBe(150); // 250-100
    expect(waitMsForThrottle(1000, 1300, 4)).toBe(0); // gap elapsed
  });
});

describe("resume-state logic (pure)", () => {
  it("buildSourceKey shapes cursors", async () => {
    const { buildSourceKey } = await import("../scripts/import-tmdb");
    expect(buildSourceKey("movie", "popular")).toBe("movie:popular");
    expect(buildSourceKey("tv", "trending")).toBe("tv:trending");
    expect(buildSourceKey("movie", "genre", 28)).toBe("movie:genre:28");
  });

  it("resolveStartPage restarts at 1 without --resume", async () => {
    const { resolveStartPage } = await import("../scripts/import-tmdb");
    expect(resolveStartPage(7, false)).toBe(1);
    expect(resolveStartPage(null, true)).toBe(1);
    expect(resolveStartPage(7, true)).toBe(8);
    expect(resolveStartPage(-3, true)).toBe(1);
  });

  it("shouldFetchPage respects caps", async () => {
    const { shouldFetchPage } = await import("../scripts/import-tmdb");
    expect(shouldFetchPage(1, 10, null)).toBe(true);
    expect(shouldFetchPage(11, 10, null)).toBe(false);
    expect(shouldFetchPage(6, 10, 5)).toBe(false);
    expect(shouldFetchPage(0, 10, null)).toBe(false);
  });

  it("shouldFailExit only on persistent failures", async () => {
    const { shouldFailExit } = await import("../scripts/import-tmdb");
    expect(shouldFailExit(10, 0)).toBe(false);
    expect(shouldFailExit(0, 1)).toBe(true);
    expect(shouldFailExit(10, 2)).toBe(false);
    expect(shouldFailExit(10, 3)).toBe(true);
  });
});

describe("TV mapping (pure, never throws)", () => {
  it("averageRuntime means episode_run_time[]", async () => {
    const { averageRuntime } = await import("../src/lib/tmdb/series");
    expect(averageRuntime([45, 50])).toBe(48);
    expect(averageRuntime([30])).toBe(30);
    expect(averageRuntime([])).toBeNull();
    expect(averageRuntime(null)).toBeNull();
    expect(averageRuntime(["x"])).toBeNull();
    expect(averageRuntime(42)).toBe(42);
  });

  it("safeShowDefaults has sane shape", async () => {
    const { safeShowDefaults } = await import("../src/lib/tmdb/series");
    const s = safeShowDefaults(1399, "US");
    expect(s.title).toBe("Untitled");
    expect(s.tmdbId).toBe(1399);
    expect(s.credits).toEqual({ creators: [], topCast: [] });
    expect(s.imdbId).toBeNull();
  });

  it("mapTvDetails maps a full payload", async () => {
    const { mapTvDetails } = await import("../src/lib/tmdb/series");
    const show = mapTvDetails(
      {
        id: 1399,
        name: "Game of Thrones",
        original_name: "Game of Thrones",
        overview: "Iron throne.",
        first_air_date: "2011-04-17",
        episode_run_time: [55, 65],
        number_of_seasons: 8,
        number_of_episodes: 73,
        status: "Ended",
        genres: [{ id: 10765, name: "Sci-Fi & Fantasy" }],
        poster_path: "/p.jpg",
        backdrop_path: "/b.jpg",
        vote_average: 8.4,
        vote_count: 20000,
        popularity: 100.5,
        created_by: [{ id: 1, name: "D. Benioff", profile_path: null }],
      },
      {
        cast: [
          { id: 10, name: "Emilia Clarke", character: "Daenerys", order: 0, profile_path: null },
        ],
        crew: [],
      },
      "US"
    );
    expect(show.title).toBe("Game of Thrones");
    expect(show.year).toBe(2011);
    expect(show.runtimeMinutes).toBe(60);
    expect(show.seasons).toBe(8);
    expect(show.episodes).toBe(73);
    expect(show.credits.creators.map((c) => c.name)).toEqual(["D. Benioff"]);
    expect(show.credits.topCast[0]?.name).toBe("Emilia Clarke");
    expect(show.posterUrl).toContain("/p.jpg");
  });

  it("mapTvDetails never throws on garbage", async () => {
    const { mapTvDetails } = await import("../src/lib/tmdb/series");
    expect(() => mapTvDetails({ bogus: true }, null, "US")).not.toThrow();
    expect(() => mapTvDetails(null, undefined, "US")).not.toThrow();
    expect(() => mapTvDetails("nope", 42, "US" as never)).not.toThrow();
    const s = mapTvDetails({ bogus: 1 }, { wrong: [] }, "US");
    expect(s.title).toBe("Untitled");
    expect(s.seasons).toBeNull();
    expect(s.credits.topCast).toEqual([]);
  });

  it("seriesToDbRow keeps tmdb:{id} shape + JSON columns", async () => {
    const { seriesToDbRow } = await import("../scripts/import-tmdb");
    const { mapTvDetails } = await import("../src/lib/tmdb/series");
    const show = mapTvDetails(
      { id: 5, name: "X", genres: [{ id: 1, name: "Drama" }] },
      { cast: [] },
      "US"
    );
    const row = seriesToDbRow(show);
    expect(row.id).toBe("tmdb:5");
    expect(row.media_type).toBe("tv");
    expect(JSON.parse(row.genres)).toEqual(["Drama"]);
  });
});

describe("fail-soft network (mocked fetch, no real network)", () => {
  it("getTvMetaSafe: network down -> ok:false + Untitled (never throws)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("tmdb down"));
    const { getTvMetaSafe } = await import("../src/lib/tmdb/series");
    const res = await getTvMetaSafe(1399, "US");
    expect(res.ok).toBe(false);
    expect(res.show.title).toBe("Untitled");
    expect(res.error).toBeTruthy();
  });

  it("getTvMetaSafe: garbage JSON -> ok:true with defaults (mirrors movies)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => ({ ok: true, json: async () => ({ bogus: true }) }) as Response
    );
    const { getTvMetaSafe } = await import("../src/lib/tmdb/series");
    const res = await getTvMetaSafe(1, "US");
    expect(res.ok).toBe(true);
    expect(res.show.title).toBe("Untitled");
  });

  it("getTvProvidersRaw: failure -> null", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("down"));
    const { getTvProvidersRaw } = await import("../src/lib/tmdb/series");
    await expect(getTvProvidersRaw(1399)).resolves.toBeNull();
  });

  it("fetchListPage parses ids + total_pages, skips malformed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ id: 1 }, { id: "x" }, {}, { id: 2 }],
        total_pages: 42,
      }),
    } as Response);
    const { fetchListPage } = await import("../scripts/import-tmdb");
    const out = await fetchListPage("tv", "popular", null, 1, "US", "k");
    expect(out.ids).toEqual([1, 2]);
    expect(out.totalPages).toBe(42);
  });

  it("fetchListPage throws on HTTP failure (caller counts it)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      json: async () => ({}),
    } as unknown as Response);
    const { fetchListPage } = await import("../scripts/import-tmdb");
    await expect(
      fetchListPage("movie", "popular", null, 1, "US", "k")
    ).rejects.toThrow(/429/);
  });
});
