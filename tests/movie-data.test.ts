/**
 * Movie data layer tests — dependency-free (node:test + node:assert).
 * Run:  npx tsx --test tests/movie-data.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapCredits, imageUrl } from "../src/lib/tmdb/client";
import {
  toManualMovieMeta,
  safeMovieDefaults,
  DEFAULT_REGION,
} from "../src/lib/tmdb/types";
import type { TmdbWatchProviders } from "../src/lib/tmdb/types";
import {
  normalizeWatchProviders,
  emptyProviders,
  attributionText,
  ATTRIBUTION_TEXT,
  MAX_PROVIDERS_PER_CATEGORY,
} from "../src/lib/streaming";
import {
  isFresh,
  resolveRegion,
  MemoryMovieCache,
  movieToDbRow,
  providersToDbRows,
  provenanceRow,
  dbMovieId,
} from "../src/lib/cache";

describe("mapCredits", () => {
  it("extracts directors and top 10 cast", () => {
    const cast = Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      name: `Actor ${i + 1}`,
      character: `Role ${i + 1}`,
      profile_path: null,
      order: i,
    }));
    const credits = mapCredits({
      cast,
      crew: [
        { id: 99, name: "Jane Doe", job: "Director", profile_path: null },
        { id: 100, name: "John Smith", job: "Producer", profile_path: null },
      ],
    });
    assert.deepEqual(
      credits.directors.map((d) => d.name),
      ["Jane Doe"]
    );
    assert.equal(credits.topCast.length, 10);
    assert.equal(credits.topCast[0]?.name, "Actor 1");
  });

  it("handles missing cast/crew", () => {
    assert.deepEqual(mapCredits({}), { directors: [], topCast: [] });
  });
});

describe("imageUrl", () => {
  it("returns null for missing path", () => {
    assert.equal(imageUrl(null), null);
    assert.equal(imageUrl(undefined), null);
  });
  it("builds full TMDB image URL", () => {
    assert.equal(
      imageUrl("/abc.jpg", "w500"),
      "https://image.tmdb.org/t/p/w500/abc.jpg"
    );
  });
});

describe("normalizeWatchProviders", () => {
  const raw: TmdbWatchProviders = {
    id: 550,
    results: {
      US: {
        link: "https://www.themoviedb.org/movie/550/watch?locale=US",
        flatrate: [
          { provider_id: 8, provider_name: "Netflix", display_priority: 2 },
          { provider_id: 9, provider_name: "Hulu", display_priority: 1 },
        ],
        rent: [{ provider_id: 2, provider_name: "Apple TV", display_priority: 5 }],
        buy: [],
        free: [{ provider_id: 7, provider_name: "Pluto TV", display_priority: 3 }],
        ads: [{ provider_id: 10, provider_name: "Freevee", display_priority: 4 }],
      },
    },
  };

  it("normalizes to Streaming/Rent/Buy/Free, merges ads into free", () => {
    const p = normalizeWatchProviders(raw, 550, "us");
    assert.equal(p.region, "US");
    assert.equal(p.hideSection, false);
    assert.deepEqual(
      p.streaming.map((x) => x.providerName),
      ["Hulu", "Netflix"]
    );
    assert.deepEqual(
      p.rent.map((x) => x.providerName),
      ["Apple TV"]
    );
    assert.deepEqual(p.buy, []);
    assert.deepEqual(
      p.free.map((x) => x.providerName),
      ["Pluto TV", "Freevee"]
    );
    assert.match(p.link ?? "", /themoviedb\.org/);
  });

  it("hides section when region missing", () => {
    const p = normalizeWatchProviders(raw, 550, "FR");
    assert.equal(p.hideSection, true);
    assert.deepEqual(p.streaming, []);
  });

  it("hides section when region present but empty", () => {
    const p = normalizeWatchProviders({ id: 1, results: { US: {} } }, 1, "US");
    assert.equal(p.hideSection, true);
  });

  it("caps providers per category and dedupes", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      provider_id: i,
      provider_name: `P${i}`,
      display_priority: 20 - i,
    }));
    const p = normalizeWatchProviders(
      { id: 1, results: { US: { flatrate: [...many, ...many] } } },
      1,
      "US"
    );
    assert.ok(p.streaming.length <= MAX_PROVIDERS_PER_CATEGORY);
  });

  it("never invents availability: emptyProviders hides section", () => {
    const p = emptyProviders(550, "US");
    assert.equal(p.hideSection, true);
    assert.deepEqual(p.streaming, []);
  });
});

describe("manual entry + safe defaults", () => {
  it("toManualMovieMeta sets manualEntry and shapes credits", () => {
    const m = toManualMovieMeta(
      { title: "Indie Gem", directorName: "A. Director" },
      "gb"
    );
    assert.equal(m.manualEntry, true);
    assert.equal(m.region, "GB");
    assert.equal(m.credits.directors[0]?.name, "A. Director");
  });

  it("safeMovieDefaults has sane shape", () => {
    const m = safeMovieDefaults(123, "US");
    assert.equal(m.title, "Untitled");
    assert.deepEqual(m.genres, []);
    assert.deepEqual(m.credits, { directors: [], topCast: [] });
  });
});

describe("cache", () => {
  it("isFresh respects TTL", () => {
    assert.equal(isFresh(new Date().toISOString(), 1000), true);
    assert.equal(isFresh(new Date(Date.now() - 2000).toISOString(), 1000), false);
    assert.equal(isFresh("not-a-date", 1000), false);
  });

  it("resolveRegion validates and falls back", () => {
    assert.equal(resolveRegion("gb"), "GB");
    assert.equal(resolveRegion("USA"), DEFAULT_REGION);
    assert.equal(resolveRegion(undefined), DEFAULT_REGION);
  });

  it("MemoryMovieCache round-trips movie + providers", async () => {
    const cache = new MemoryMovieCache();
    const movie = safeMovieDefaults(1, "US");
    await cache.setMovie(movie);
    assert.equal((await cache.getMovie(1, "us"))?.value.tmdbId, 1);
    const prov = emptyProviders(1, "US");
    await cache.setProviders(prov);
    assert.equal((await cache.getProviders(1, "US"))?.value.hideSection, true);
  });
});

describe("db row mappers (foundation schema)", () => {
  it("movieToDbRow maps onto movies columns", () => {
    const m = toManualMovieMeta(
      { title: "Dune: Part Two", tmdbId: 693134 },
      "US"
    );
    const row = movieToDbRow({ ...m, tmdbId: 693134, year: 2024 });
    assert.equal(row.id, dbMovieId(693134));
    assert.equal(row.tmdb_id, 693134);
    assert.equal(row.title, "Dune: Part Two");
    assert.match(row.slug, /693134$/);
    assert.deepEqual(JSON.parse(row.directors), []);
  });

  it("providersToDbRows emits one row per provider with category quality", () => {
    const p = normalizeWatchProviders(
      {
        id: 550,
        results: {
          US: {
            flatrate: [{ provider_id: 8, provider_name: "Netflix" }],
            rent: [{ provider_id: 2, provider_name: "Apple TV" }],
          },
        },
      },
      550,
      "US"
    );
    const rows = providersToDbRows(p);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.movie_id === dbMovieId(550) && r.region === "US"));
    assert.deepEqual(
      rows.map((r) => r.quality).sort(),
      ["rent", "streaming"]
    );
  });

  it("provenanceRow carries kind + movie link", () => {
    const row = provenanceRow(550, "tmdb", new Date().toISOString());
    assert.equal(row.kind, "tmdb");
    assert.equal(row.movie_id, dbMovieId(550));
  });
});

describe("attribution", () => {
  it("includes timestamp and region", () => {
    const t = attributionText("US", "2026-01-01T00:00:00.000Z");
    assert.match(t, /TMDB/);
    assert.match(t, /JustWatch/);
    assert.match(t, /US/);
    assert.match(ATTRIBUTION_TEXT, /JustWatch/);
  });
});
