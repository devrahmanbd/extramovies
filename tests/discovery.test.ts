import { describe, expect, it, vi, beforeEach } from 'vitest';

const DEMO_GENRES = [
  { id: 28, name: 'Action' },
  { id: 35, name: 'Comedy' },
  { id: 878, name: 'Science Fiction' },
];

describe('parseDiscoverFilters (pure)', () => {
  it('parses q/genre/year/watch and flags hasFilters', async () => {
    const { parseDiscoverFilters } = await import('../src/lib/tmdb/discover');
    const f = parseDiscoverFilters(
      new URLSearchParams('q=dune&genre=878&year=2024&watch=stream')
    );
    expect(f).toMatchObject({ q: 'dune', genre: '878', year: 2024, watch: 'stream', hasFilters: true });
  });

  it('accepts plain record params and trims input', async () => {
    const { parseDiscoverFilters } = await import('../src/lib/tmdb/discover');
    const f = parseDiscoverFilters({ q: '  dune  ' });
    expect(f.q).toBe('dune');
    expect(f.hasFilters).toBe(true);
  });

  it('rejects bad year/watch values but keeps valid siblings', async () => {
    const { parseDiscoverFilters } = await import('../src/lib/tmdb/discover');
    expect(parseDiscoverFilters(new URLSearchParams('year=abcd')).year).toBeNull();
    expect(parseDiscoverFilters(new URLSearchParams('year=1700')).year).toBeNull();
    const f = parseDiscoverFilters(new URLSearchParams('year=2024&watch=torrent'));
    expect(f.year).toBe(2024);
    expect(f.watch).toBeNull();
    expect(f.hasFilters).toBe(true);
  });

  it('empty params → hasFilters false (indexable canonical view)', async () => {
    const { parseDiscoverFilters } = await import('../src/lib/tmdb/discover');
    const f = parseDiscoverFilters(new URLSearchParams(''));
    expect(f.hasFilters).toBe(false);
    expect(f.year).toBeNull();
    expect(f.watch).toBeNull();
  });

  it('buildMoviesHref round-trips through the parser', async () => {
    const { parseDiscoverFilters, buildMoviesHref } = await import('../src/lib/tmdb/discover');
    const href = buildMoviesHref({ q: 'dune', genre: '878', year: 2024, watch: 'free' });
    const back = parseDiscoverFilters(new URLSearchParams(href.split('?')[1]));
    expect(back).toMatchObject({ q: 'dune', genre: '878', year: 2024, watch: 'free' });
    expect(buildMoviesHref({})).toBe('/movies');
  });
});

describe('resolveGenreId (pure)', () => {
  it('accepts numeric ids and case-insensitive names', async () => {
    const { resolveGenreId } = await import('../src/lib/tmdb/discover');
    expect(resolveGenreId(DEMO_GENRES, '878')).toBe(878);
    expect(resolveGenreId(DEMO_GENRES, 'science fiction')).toBe(878);
    expect(resolveGenreId(DEMO_GENRES, '  Comedy ')).toBe(35);
  });

  it('returns null for unknown/empty genre params', async () => {
    const { resolveGenreId } = await import('../src/lib/tmdb/discover');
    expect(resolveGenreId(DEMO_GENRES, 'western')).toBeNull();
    expect(resolveGenreId(DEMO_GENRES, '')).toBeNull();
  });
});

describe('mapToTile + toContentProviders (pure)', () => {
  it('maps TMDB fields only, null-safe', async () => {
    const { mapToTile } = await import('../src/lib/tmdb/discover');
    const t = mapToTile({
      id: 550,
      title: 'Fight Club',
      release_date: '1999-10-15',
      poster_path: '/p.jpg',
      vote_average: 8.4,
    });
    expect(t.tmdbId).toBe(550);
    expect(t.year).toBe(1999);
    expect(t.posterUrl).toContain('/p.jpg');
    expect(t.rating).toBe(8.4);
    const bare = mapToTile({ id: 1 });
    expect(bare.title).toBe('Untitled');
    expect(bare.year).toBeNull();
    expect(bare.posterUrl).toBeNull();
    expect(bare.rating).toBeNull();
  });

  it('adapts streaming providers to the WhereToWatch shape', async () => {
    const { toContentProviders } = await import('../src/lib/tmdb/discover');
    const out = toContentProviders({
      tmdbId: 550,
      region: 'US',
      link: 'https://example.com',
      streaming: [{ providerId: 8, providerName: 'Flix', logoUrl: 'https://img/l.png', displayPriority: 1 }],
      rent: [],
      buy: [],
      free: [],
      fetchedAt: '2026-01-01T00:00:00.000Z',
      hideSection: false,
    });
    expect(out.streaming).toEqual([{ name: 'Flix', logoUrl: 'https://img/l.png' }]);
    expect(out.hideSection).toBe(false);
    expect(out.link).toBe('https://example.com');
  });
});

describe('findReviewForTmdbId (pure)', () => {
  it('matches on PublicReview.tmdbId, null on miss', async () => {
    const { findReviewForTmdbId } = await import('../src/lib/tmdb/discover');
    const { DEMO_REVIEWS } = await import('../src/lib/seo/content');
    expect(findReviewForTmdbId(DEMO_REVIEWS, 550)).toBeNull(); // demo rows carry null tmdbId
    const withMatch = [
      ...DEMO_REVIEWS,
      { ...DEMO_REVIEWS[0]!, slug: 'linked', tmdbId: 550 },
    ];
    expect(findReviewForTmdbId(withMatch, 550)?.slug).toBe('linked');
    expect(findReviewForTmdbId(withMatch, NaN as number)).toBeNull();
  });
});

describe('discover cache fail-soft', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    process.env.TMDB_API_KEY = 'k';
    const { clearDiscoverCache } = await import('../src/lib/tmdb/discover');
    clearDiscoverCache();
  });

  it('network failure → [] (never throws)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('tmdb down'));
    const { getTrending, searchMovies, discoverMovies, listTmdbGenres, parseDiscoverFilters } =
      await import('../src/lib/tmdb/discover');
    await expect(getTrending()).resolves.toEqual([]);
    await expect(searchMovies('dune')).resolves.toEqual([]);
    await expect(
      discoverMovies(parseDiscoverFilters(new URLSearchParams('genre=28')))
    ).resolves.toEqual([]);
    await expect(listTmdbGenres()).resolves.toEqual([]);
  });

  it('1h cache serves trending without a second fetch', async () => {
    const payload = {
      results: [
        { id: 1, title: 'A', release_date: '2024-01-01', poster_path: '/a.jpg', vote_average: 7 },
      ],
    };
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => payload } as Response);
    const { getTrending } = await import('../src/lib/tmdb/discover');
    const first = await getTrending();
    const second = await getTrending();
    expect(first).toHaveLength(1);
    expect(second).toEqual(first);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('missing TMDB key → [] (setup empty state path)', async () => {
    delete process.env.TMDB_API_KEY;
    const { getTrending, hasTmdbKey } = await import('../src/lib/tmdb/discover');
    expect(hasTmdbKey()).toBe(false);
    await expect(getTrending()).resolves.toEqual([]);
    process.env.TMDB_API_KEY = 'k';
  });
});

describe('activeTheme env reader', () => {
  it('defaults to publication, honors SITE_THEME=discovery', async () => {
    const { activeTheme } = await import('../src/lib/tmdb/discover');
    expect(activeTheme({})).toBe('publication');
    expect(activeTheme({ SITE_THEME: 'discovery' })).toBe('discovery');
    expect(activeTheme({ SITE_THEME: 'DISCOVERY' })).toBe('discovery');
    expect(activeTheme({ SITE_THEME: 'publication' })).toBe('publication');
  });

  it('currentTheme never throws (publication fallback)', async () => {
    const { currentTheme } = await import('../src/lib/tmdb/discover');
    const t = await currentTheme();
    expect(['discovery', 'publication']).toContain(t);
  });
});

// --- Streaming-guide rebuild (append-only): list= + new endpoints ---
describe('parseDiscoverList + list titles (pure)', () => {
  it('parses list= and rejects unknown values', async () => {
    const { parseDiscoverList, buildListHref, LIST_TITLES } = await import('../src/lib/tmdb/discover');
    expect(parseDiscoverList(new URLSearchParams('list=trending'))).toBe('trending');
    expect(parseDiscoverList(new URLSearchParams('list=now_playing'))).toBe('now_playing');
    expect(parseDiscoverList(new URLSearchParams('list=nope'))).toBeNull();
    expect(parseDiscoverList(new URLSearchParams(''))).toBeNull();
    expect(buildListHref('free')).toBe('/movies?list=free');
    // Plain language only — no technical labels in titles
    for (const t of Object.values(LIST_TITLES)) {
      expect(t).not.toMatch(/tmdb|api|monetization/i);
    }
    expect(LIST_TITLES.free).toBe('Watch free');
    expect(LIST_TITLES.stream).toBe('Available to stream');
  });

  it('parseDiscoverFilters carries list and flags hasFilters', async () => {
    const { parseDiscoverFilters, buildMoviesHref } = await import('../src/lib/tmdb/discover');
    const f = parseDiscoverFilters(new URLSearchParams('list=popular'));
    expect(f.list).toBe('popular');
    expect(f.hasFilters).toBe(true);
    const href = buildMoviesHref({ list: 'upcoming' });
    expect(href).toBe('/movies?list=upcoming');
    const back = parseDiscoverFilters(new URLSearchParams(href.split('?')[1]));
    expect(back.list).toBe('upcoming');
    // Existing behavior intact: empty still indexable
    expect(parseDiscoverFilters(new URLSearchParams('')).hasFilters).toBe(false);
    expect(parseDiscoverFilters(new URLSearchParams('list=bogus')).list).toBeNull();
  });
});

describe('streaming-guide fetchers fail-soft + cached', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    process.env.TMDB_API_KEY = 'k';
    const { clearDiscoverCache } = await import('../src/lib/tmdb/discover');
    clearDiscoverCache();
  });

  it('network failure → [] for every new endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('tmdb down'));
    const { getPopular, getTopRated, getNowPlaying, getUpcoming, discoverBy, getListTiles } =
      await import('../src/lib/tmdb/discover');
    await expect(getPopular()).resolves.toEqual([]);
    await expect(getTopRated()).resolves.toEqual([]);
    await expect(getNowPlaying()).resolves.toEqual([]);
    await expect(getUpcoming()).resolves.toEqual([]);
    await expect(discoverBy('free')).resolves.toEqual([]);
    await expect(discoverBy('stream')).resolves.toEqual([]);
    await expect(getListTiles('trending')).resolves.toEqual([]);
    await expect(getListTiles('free')).resolves.toEqual([]);
    // @ts-expect-error — unknown list resolves []
    await expect(getListTiles('bogus')).resolves.toEqual([]);
  });

  it('1h cache serves popular without a second fetch; monetization mapped', async () => {
    const payload = {
      results: [
        { id: 2, title: 'B', release_date: '2024-02-01', poster_path: '/b.jpg', vote_average: 8 },
      ],
    };
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => payload } as Response);
    const { getPopular, discoverBy, clearDiscoverCache } = await import('../src/lib/tmdb/discover');
    clearDiscoverCache();
    const first = await getPopular();
    const second = await getPopular();
    expect(first).toHaveLength(1);
    expect(second).toEqual(first);
    expect(spy).toHaveBeenCalledTimes(1);
    // discoverBy maps stream → flatrate, free → free|ads
    clearDiscoverCache();
    spy.mockClear();
    await discoverBy('stream', 'US');
    const streamUrl = spy.mock.calls[0]?.[0] as string;
    expect(streamUrl).toContain('with_watch_monetization_types=flatrate');
    expect(streamUrl).toContain('watch_region=US');
    clearDiscoverCache();
    spy.mockClear();
    await discoverBy('free', 'US');
    const freeUrl = spy.mock.calls[0]?.[0] as string;
    expect(freeUrl).toContain(encodeURIComponent('free|ads'));
  });

  it('missing TMDB key → [] for new endpoints', async () => {
    delete process.env.TMDB_API_KEY;
    const { getPopular, getNowPlaying, getUpcoming, discoverBy, hasTmdbKey } =
      await import('../src/lib/tmdb/discover');
    expect(hasTmdbKey()).toBe(false);
    await expect(getPopular()).resolves.toEqual([]);
    await expect(getNowPlaying()).resolves.toEqual([]);
    await expect(getUpcoming()).resolves.toEqual([]);
    await expect(discoverBy('rent')).resolves.toEqual([]);
    process.env.TMDB_API_KEY = 'k';
  });
});
