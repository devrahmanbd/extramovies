import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

// Task S2 — TV write path + search entry points.
// Temp :memory: sqlite doubles only (never data/reviews.json or data/local.db).

function mockRes() {
  const headers: Record<string, string> = {};
  return {
    statusCode: 200,
    body: null as unknown,
    headers,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader(k: string, v: string) {
      headers[k] = v;
    },
  };
}

async function makeSocialDb() {
  const Database = (await import('better-sqlite3')).default;
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const schema = await import('../src/lib/db/schema');
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const ddl = await fs.readFile(path.join(process.cwd(), 'migrations', '0004_social.sql'), 'utf8');
  sqlite.exec(ddl);
  sqlite.exec(await fs.readFile(path.join(process.cwd(), 'migrations', '0006_sessions.sql'), 'utf8'));
  const db = drizzle(sqlite, { schema }) as never;
  return { db };
}

async function seedUser(db: never, handle: string, email: string) {
  const store = await import('../src/lib/users/store');
  const created = await store.createUser(db, {
    handle,
    displayName: handle,
    email,
    password: '0123456789abcdef',
  });
  if (!created.ok) throw new Error(`seed failed: ${created.error}`);
  return created.user;
}

function memberReq(token: string, csrf: string | null, extra: Record<string, unknown> = {}) {
  const headers: Record<string, string> = { cookie: `admin_session=${token}` };
  if (csrf) headers['x-csrf-token'] = csrf;
  return {
    method: 'POST',
    body: {},
    headers,
    cookies: { admin_session: token },
    socket: { remoteAddress: 'test' },
    ...extra,
  } as never;
}

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('S2 media plumbing: tv + movie coexist on one tmdbId, lists filter by media', () => {
  it('POST tv then POST movie on same tmdbId creates two rows; GET filters by media', async () => {
    const { db } = await makeSocialDb();
    const session = await import('../src/lib/auth/session');
    const handler = (await import('../src/pages/api/member/reviews')).default as Function;
    const user = await seedUser(db, 's2_reviewer', 's2@example.com');
    const { token, csrfToken } = await session.createMemberSession(user.id, user.email, db as never);

    const tvBody = {
      tmdbId: 1399,
      media: 'tv',
      rating: 9,
      title: 'Great show',
      body: 'A genuinely great series worth watching twice over.',
    };
    const tvRes = mockRes() as never;
    await handler(memberReq(token, csrfToken, { db, body: tvBody }), tvRes);
    expect((tvRes as unknown as ReturnType<typeof mockRes>).statusCode).toBe(200);
    const tvId = ((tvRes as unknown as ReturnType<typeof mockRes>).body as { id: string }).id;
    expect(tvId).toBeTruthy();

    const movieBody = {
      tmdbId: 1399,
      media: 'movie',
      rating: 7,
      title: 'Same id film',
      body: 'Same numeric id but the movie entry, still valid text.',
    };
    const movieRes = mockRes() as never;
    await handler(memberReq(token, csrfToken, { db, body: movieBody }), movieRes);
    expect((movieRes as unknown as ReturnType<typeof mockRes>).statusCode).toBe(200);
    const movieId = ((movieRes as unknown as ReturnType<typeof mockRes>).body as { id: string }).id;
    expect(movieId).toBeTruthy();
    expect(movieId).not.toBe(tvId);

    const getTv = mockRes() as never;
    await handler(
      { method: 'GET', query: { tmdbId: '1399', media: 'tv' }, headers: {}, cookies: {}, db } as never,
      getTv,
    );
    expect((getTv as unknown as ReturnType<typeof mockRes>).statusCode).toBe(200);
    const tvListed = (getTv as unknown as ReturnType<typeof mockRes>).body as {
      ok: boolean;
      reviews: { title: string }[];
    };
    expect(tvListed.reviews).toHaveLength(1);
    expect(tvListed.reviews[0].title).toBe('Great show');

    const getMovie = mockRes() as never;
    await handler(
      { method: 'GET', query: { tmdbId: '1399', media: 'movie' }, headers: {}, cookies: {}, db } as never,
      getMovie,
    );
    const movieListed = (getMovie as unknown as ReturnType<typeof mockRes>).body as {
      ok: boolean;
      reviews: { title: string }[];
    };
    expect(movieListed.reviews).toHaveLength(1);
    expect(movieListed.reviews[0].title).toBe('Same id film');

    const badMedia = mockRes() as never;
    await handler(
      { method: 'GET', query: { tmdbId: '1399', media: 'book' }, headers: {}, cookies: {}, db } as never,
      badMedia,
    );
    expect((badMedia as unknown as ReturnType<typeof mockRes>).statusCode).toBe(400);
  });

  it('POST rejects invalid media at the API boundary', async () => {
    const { db } = await makeSocialDb();
    const session = await import('../src/lib/auth/session');
    const handler = (await import('../src/pages/api/member/reviews')).default as Function;
    const user = await seedUser(db, 's2_media', 's2m@example.com');
    const { token, csrfToken } = await session.createMemberSession(user.id, user.email, db as never);
    const bad = mockRes() as never;
    await handler(
      memberReq(token, csrfToken, {
        db,
        body: { tmdbId: 1399, media: 'podcast', body: 'This body is long enough to pass validation.' },
      }),
      bad,
    );
    expect((bad as unknown as ReturnType<typeof mockRes>).statusCode).toBe(400);
  });
});

describe('S2 searchShowsByTitle helper: fail-soft', () => {
  it('returns [] on empty/blank input without touching the network', async () => {
    const { searchShowsByTitle } = await import('../src/lib/tmdb/client');
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      throw new Error('must not fetch');
    }) as never;
    expect(await searchShowsByTitle('')).toEqual([]);
    expect(await searchShowsByTitle('   ')).toEqual([]);
    expect(called).toBe(false);
  });

  it('returns [] when fetch fails and when no key is configured', async () => {
    const { searchShowsByTitle, setTmdbKeyOverride } = await import('../src/lib/tmdb/client');
    globalThis.fetch = (async () => {
      throw new Error('network down');
    }) as never;
    setTmdbKeyOverride('dummy-key-for-test');
    try {
      expect(await searchShowsByTitle('breaking bad')).toEqual([]);
    } finally {
      setTmdbKeyOverride(null);
    }

    const saved = process.env.TMDB_API_KEY;
    delete process.env.TMDB_API_KEY;
    setTmdbKeyOverride(null);
    try {
      // fetch stays stubbed-throwing so this is deterministic even if
      // import.meta.env carries a key in some runtimes.
      expect(await searchShowsByTitle('breaking bad')).toEqual([]);
    } finally {
      if (saved !== undefined) process.env.TMDB_API_KEY = saved;
    }
  });

  it('returns results on success', async () => {
    const { searchShowsByTitle, setTmdbKeyOverride } = await import('../src/lib/tmdb/client');
    setTmdbKeyOverride('dummy-key-for-test');
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({
        results: [{ id: 1399, name: 'Breaking Bad', first_air_date: '2008-01-20' }],
      }),
    })) as never;
    try {
      const out = await searchShowsByTitle('breaking bad');
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ id: 1399, name: 'Breaking Bad' });
    } finally {
      setTmdbKeyOverride(null);
    }
  });
});

describe('S2 mapShowToTile: pure TV -> tile mapping, null-tolerant', () => {
  it('maps name/date/poster/rating/overview', async () => {
    const { mapShowToTile } = await import('../src/lib/tmdb/client');
    expect(
      mapShowToTile({
        id: 1399,
        name: 'Breaking Bad',
        overview: 'A chemistry teacher turns meth kingpin.',
        first_air_date: '2008-01-20',
        poster_path: '/p.jpg',
        backdrop_path: '/b.jpg',
        vote_average: 9.5,
      }),
    ).toMatchObject({
      tmdbId: 1399,
      title: 'Breaking Bad',
      year: 2008,
      posterUrl: 'https://image.tmdb.org/t/p/w342/p.jpg',
      rating: 9.5,
      backdropUrl: 'https://image.tmdb.org/t/p/w1280/b.jpg',
    });
  });

  it('tolerates missing/garbage fields', async () => {
    const { mapShowToTile } = await import('../src/lib/tmdb/client');
    const blank = mapShowToTile({ id: 7 } as never);
    expect(blank).toMatchObject({
      tmdbId: 7,
      title: 'Untitled',
      year: null,
      posterUrl: null,
      rating: null,
      backdropUrl: null,
      overview: null,
    });
    expect(mapShowToTile({ id: 8, name: '  ', first_air_date: 'soon', vote_average: NaN } as never)).toMatchObject({
      title: 'Untitled',
      year: null,
      rating: null,
    });
    const long = mapShowToTile({ id: 9, name: 'X', overview: `  ${'y'.repeat(500)}  ` } as never);
    expect(long.overview).toHaveLength(180);
  });
});
