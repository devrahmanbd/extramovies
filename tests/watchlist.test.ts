import { describe, expect, it, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

// Watchlist slice — store CRUD (in-memory sqlite double), validation, API guards.
// DB-only; file-store fallback is out of scope.

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

async function makeTestDb() {
  const Database = (await import('better-sqlite3')).default;
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const { sql } = await import('drizzle-orm');
  const sqlite = new Database(':memory:');
  sqlite.exec(
    `CREATE TABLE watchlist_items (
      user_id TEXT NOT NULL,
      tmdb_id INTEGER NOT NULL,
      media_type TEXT NOT NULL DEFAULT 'movie',
      status TEXT NOT NULL DEFAULT 'planned',
      added_at TEXT NOT NULL,
      PRIMARY KEY (user_id, tmdb_id, media_type)
    )`
  );
  // Sessions contract (migration 0006) so guard tests never touch data/local.db.
  sqlite.exec(
    await fs.readFile(path.join(process.cwd(), 'migrations', '0006_sessions.sql'), 'utf8'),
  );
  const db = drizzle(sqlite) as never;
  return { db, sql };
}

describe('watchlist store validation', () => {
  it('rejects non-positive / non-integer tmdbId', async () => {
    const store = await import('../src/lib/watchlist/store');
    for (const bad of [0, -1, 1.5, NaN, 'abc' as never, null as never, undefined as never]) {
      await expect(store.validateWatchlistInput(bad as never, 'movie')).rejects.toThrow();
    }
  });

  it('rejects unknown media', async () => {
    const store = await import('../src/lib/watchlist/store');
    await expect(store.validateWatchlistInput(123, 'book' as never)).rejects.toThrow();
    await expect(store.validateWatchlistInput(123, 'movie')).resolves.toEqual({
      tmdbId: 123,
      media: 'movie',
    });
    await expect(store.validateWatchlistInput(123, 'tv')).resolves.toEqual({
      tmdbId: 123,
      media: 'tv',
    });
  });

  it('defaults media to movie', async () => {
    const store = await import('../src/lib/watchlist/store');
    await expect(store.validateWatchlistInput(7)).resolves.toEqual({ tmdbId: 7, media: 'movie' });
  });
});

describe('watchlist store CRUD (dbExecute-compatible double)', () => {
  it('add → isOnList → count → list → remove', async () => {
    const store = await import('../src/lib/watchlist/store');
    const { db } = await makeTestDb();
    const uid = `u-${Date.now()}`;

    await store.addToList(db as never, uid, 550, 'movie');
    expect(await store.isOnList(db as never, uid, 550, 'movie')).toBe(true);
    expect(await store.isOnList(db as never, uid, 551, 'movie')).toBe(false);
    expect(await store.countForUser(db as never, uid)).toBe(1);

    await store.addToList(db as never, uid, 1399, 'tv');
    expect(await store.countForUser(db as never, uid)).toBe(2);

    const list = await store.listForUser(db as never, uid);
    expect(list.length).toBe(2);
    // newest first
    expect(list[0]!.tmdb_id).toBe(1399);

    // idempotent re-add keeps single row
    await store.addToList(db as never, uid, 550, 'movie');
    expect(await store.countForUser(db as never, uid)).toBe(2);

    await store.removeFromList(db as never, uid, 550, 'movie');
    expect(await store.isOnList(db as never, uid, 550, 'movie')).toBe(false);
    expect(await store.countForUser(db as never, uid)).toBe(1);
  });

  it('list caps at 200, newest first', async () => {
    const store = await import('../src/lib/watchlist/store');
    const { db } = await makeTestDb();
    const uid = `cap-${Date.now()}`;
    for (let i = 1; i <= 205; i++) {
      await store.addToList(db as never, uid, i, 'movie');
    }
    const list = await store.listForUser(db as never, uid);
    expect(list.length).toBe(200);
    expect(await store.countForUser(db as never, uid)).toBe(205);
  });

  it('movie and tv with same tmdbId are distinct rows', async () => {
    const store = await import('../src/lib/watchlist/store');
    const { db } = await makeTestDb();
    const uid = `distinct-${Date.now()}`;
    await store.addToList(db as never, uid, 100, 'movie');
    await store.addToList(db as never, uid, 100, 'tv');
    expect(await store.countForUser(db as never, uid)).toBe(2);
    expect(await store.isOnList(db as never, uid, 100, 'movie')).toBe(true);
    expect(await store.isOnList(db as never, uid, 100, 'tv')).toBe(true);
  });
});

describe('watchlist API guards', () => {
  it('POST /api/list/add without session → 401', async () => {
    const { default: handler } = await import('../src/pages/api/list/add');
    const req = { method: 'POST', body: { tmdbId: 550, media: 'movie' }, headers: {}, cookies: {}, query: {} } as never;
    const res = mockRes() as never;
    await (handler as Function)(req, res);
    expect((res as unknown as ReturnType<typeof mockRes>).statusCode).toBe(401);
  });

  it('POST without CSRF even with session → 403', async () => {
    const { db } = await makeTestDb();
    const { createMemberSession } = await import('../src/lib/auth/session');
    const { default: handler } = await import('../src/pages/api/list/add');
    const { token } = await createMemberSession('u_member', 'member@example.com', db as never);
    const req = {
      method: 'POST',
      body: { tmdbId: 550, media: 'movie' },
      headers: { cookie: `admin_session=${token}` },
      cookies: { admin_session: token },
      query: {},
      db,
    } as never;
    const res = mockRes() as never;
    await (handler as Function)(req, res);
    expect((res as unknown as ReturnType<typeof mockRes>).statusCode).toBe(403);
  });

  it('POST with session + CSRF validates tmdbId → 400 on bad input', async () => {
    const { db } = await makeTestDb();
    const { createMemberSession } = await import('../src/lib/auth/session');
    const { default: handler } = await import('../src/pages/api/list/add');
    const { token, csrfToken } = await createMemberSession('u_member2', 'member2@example.com', db as never);
    const req = {
      method: 'POST',
      body: { tmdbId: -5, media: 'movie' },
      headers: { 'x-csrf-token': csrfToken, cookie: `admin_session=${token}` },
      cookies: { admin_session: token },
      query: {},
      db,
    } as never;
    const res = mockRes() as never;
    await (handler as Function)(req, res);
    expect((res as unknown as ReturnType<typeof mockRes>).statusCode).toBe(400);
  });

  it('GET /api/list/status without auth → 200 {onList:false, count:null}', async () => {
    const { default: handler } = await import('../src/pages/api/list/status');
    const req = { method: 'GET', headers: {}, cookies: {}, query: { tmdbId: '550', media: 'movie' } } as never;
    const res = mockRes() as never;
    await (handler as Function)(req, res);
    const out = res as unknown as ReturnType<typeof mockRes>;
    expect(out.statusCode).toBe(200);
    expect(out.body).toMatchObject({ onList: false, count: null });
  });

  it('GET /api/list/status with bad tmdbId → 400', async () => {
    const { default: handler } = await import('../src/pages/api/list/status');
    const req = { method: 'GET', headers: {}, cookies: {}, query: { tmdbId: 'abc' } } as never;
    const res = mockRes() as never;
    await (handler as Function)(req, res);
    expect((res as unknown as ReturnType<typeof mockRes>).statusCode).toBe(400);
  });
});
