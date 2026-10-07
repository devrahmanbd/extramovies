import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

// Members slice — reviews + follows + member API guards.
// Real :memory: sqlite doubles (same pattern as watchlist/member-auth slices):
// DDL comes from the auth crew migration so the contract stays in one place.

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

describe('member review validation edges', () => {
  it('rejects bad tmdbId / media / rating / title / body', async () => {
    const m = await import('../src/lib/members/reviews');
    for (const bad of [0, -1, 1.5, NaN, 'abc', null, undefined]) {
      expect(m.validateReviewInput({ tmdbId: bad, body: 'x'.repeat(30) }).ok).toBe(false);
    }
    expect(m.validateReviewInput({ tmdbId: 550, media: 'book', body: 'x'.repeat(30) }).ok).toBe(
      false,
    );
    for (const badRating of [-1, 11, 5.5, 'great']) {
      expect(
        m.validateReviewInput({ tmdbId: 550, rating: badRating, body: 'x'.repeat(30) }).ok,
      ).toBe(false);
    }
    expect(
      m.validateReviewInput({ tmdbId: 550, title: 't'.repeat(121), body: 'x'.repeat(30) }).ok,
    ).toBe(false);
    expect(m.validateReviewInput({ tmdbId: 550, body: 'too short' }).ok).toBe(false);
    expect(m.validateReviewInput({ tmdbId: 550, body: 'x'.repeat(5001) }).ok).toBe(false);
    expect(m.validateReviewInput({ tmdbId: 550 }).ok).toBe(false);
  });

  it('accepts null/omitted rating, empty title, boundary bodies, numeric strings', async () => {
    const m = await import('../src/lib/members/reviews');
    const base = { tmdbId: 550, body: 'x'.repeat(20) };
    expect(m.validateReviewInput(base)).toMatchObject({ ok: true });
    expect(m.validateReviewInput({ ...base, rating: null, title: '' })).toMatchObject({
      ok: true,
    });
    expect(m.validateReviewInput({ ...base, rating: 0 }).ok).toBe(true);
    expect(m.validateReviewInput({ ...base, rating: 10 }).ok).toBe(true);
    expect(m.validateReviewInput({ ...base, media: 'tv' }).ok).toBe(true);
    expect(m.validateReviewInput({ ...base, body: 'y'.repeat(5000) }).ok).toBe(true);
    expect(m.validateReviewInput({ ...base, tmdbId: '550' }).ok).toBe(true);
    const v = m.validateReviewInput({ ...base, tmdbId: '550' });
    if (v.ok) expect(v.value.tmdbId).toBe(550);
  });
});

describe('member review upsert semantics (real sqlite)', () => {
  it('creates, updates in place on re-post, isolates users and titles', async () => {
    const { db } = await makeSocialDb();
    const reviews = await import('../src/lib/members/reviews');
    const a = await seedUser(db, 'reviewer_a', 'a@example.com');
    const b = await seedUser(db, 'reviewer_b', 'b@example.com');

    const first = await reviews.createOrUpdateReview(db as never, a.id, {
      tmdbId: 550,
      media: 'movie',
      rating: 8,
      title: 'Great',
      body: 'A genuinely great film worth watching twice.',
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.created).toBe(true);

    const second = await reviews.createOrUpdateReview(db as never, a.id, {
      tmdbId: 550,
      media: 'movie',
      rating: 9,
      title: 'Even better',
      body: 'On rewatch this film really holds up well indeed.',
    });
    expect(second).toMatchObject({ ok: true, created: false, id: first.id });

    const other = await reviews.createOrUpdateReview(db as never, b.id, {
      tmdbId: 550,
      body: 'A different take on this exact same film here.',
    });
    expect(other.ok).toBe(true);
    if (!other.ok) return;
    expect(other.id).not.toBe(first.id);

    const tv = await reviews.createOrUpdateReview(db as never, a.id, {
      tmdbId: 550,
      media: 'tv',
      body: 'Same numeric id but a series entry, still valid text.',
    });
    expect(tv.ok).toBe(true);

    const forMovie = await reviews.listForMovie(db as never, 550, 'movie', 20);
    expect(forMovie).toHaveLength(2); // one per user (tv row excluded)
    expect(forMovie[0].handle).toBe('reviewer_b'); // newest first
    expect(forMovie[1].rating).toBe(9); // updated value survived
    expect(forMovie[1].displayName).toBe('reviewer_a');

    const mine = await reviews.listForUser(db as never, a.id, 50);
    expect(mine).toHaveLength(2);
    expect(await reviews.countReviewsForUser(db as never, a.id)).toBe(2);
    expect(await reviews.countReviewsForUser(db as never, b.id)).toBe(1);
  });
});

describe('follows: no-self-follow, toggle, counts', () => {
  it('blocks self-follow, toggles, and counts both directions', async () => {
    const { db } = await makeSocialDb();
    const follows = await import('../src/lib/members/follows');
    const a = await seedUser(db, 'follower_a', 'fa@example.com');
    const c = await seedUser(db, 'follower_c', 'fc@example.com');

    expect(await follows.toggleFollow(db as never, a.id, 'follower_a')).toMatchObject({
      ok: false,
      error: 'cannot follow yourself',
    });
    expect(await follows.toggleFollow(db as never, a.id, 'ghost_handle')).toMatchObject({
      ok: false,
      error: 'user not found',
    });

    expect(await follows.isFollowing(db as never, a.id, c.id)).toBe(false);
    expect(await follows.toggleFollow(db as never, a.id, 'follower_c')).toMatchObject({
      ok: true,
      following: true,
    });
    expect(await follows.isFollowing(db as never, a.id, c.id)).toBe(true);
    expect(await follows.counts(db as never, c.id)).toMatchObject({
      followers: 1,
      following: 0,
    });
    expect(await follows.counts(db as never, a.id)).toMatchObject({
      followers: 0,
      following: 1,
    });
    expect(await follows.toggleFollow(db as never, a.id, 'follower_c')).toMatchObject({
      ok: true,
      following: false,
    });
    expect(await follows.counts(db as never, c.id)).toMatchObject({ followers: 0 });
  });

  it('counts coerces driver string totals (mocked db)', async () => {
    const follows = await import('../src/lib/members/follows');
    const calls: unknown[] = [];
    const mockedDb = {
      execute: async (q: unknown) => {
        calls.push(q);
        return { rows: [{ count: '3' }] };
      },
    };
    expect(await follows.counts(mockedDb as never, 'u_x')).toMatchObject({
      followers: 3,
      following: 3,
    });
    expect(calls).toHaveLength(2);
  });
});

describe('member API guards + happy paths', () => {
  it('POST /api/member/reviews: 401 anon/admin, 403 bad CSRF, 400 bad body, 200 upsert', async () => {
    const { db } = await makeSocialDb();
    const session = await import('../src/lib/auth/session');
    const handler = (await import('../src/pages/api/member/reviews')).default as Function;
    const user = await seedUser(db, 'api_reviewer', 'apirev@example.com');

    const anon = mockRes() as never;
    await handler({ method: 'POST', body: {}, headers: {}, cookies: {}, db } as never, anon);
    expect((anon as unknown as ReturnType<typeof mockRes>).statusCode).toBe(401);

    const admin = await session.createSession('editor@example.com', db as never);
    const adminRes = mockRes() as never;
    await handler(memberReq(admin.token, admin.csrfToken, { db }), adminRes);
    expect((adminRes as unknown as ReturnType<typeof mockRes>).statusCode).toBe(401);

    const { token, csrfToken } = await session.createMemberSession(user.id, user.email, db as never);
    const noCsrf = mockRes() as never;
    await handler(memberReq(token, null, { db }), noCsrf);
    expect((noCsrf as unknown as ReturnType<typeof mockRes>).statusCode).toBe(403);

    const badBody = mockRes() as never;
    await handler(
      memberReq(token, csrfToken, { db, body: { tmdbId: 550, body: 'short' } }),
      badBody,
    );
    expect((badBody as unknown as ReturnType<typeof mockRes>).statusCode).toBe(400);

    const goodBody = {
      tmdbId: 550,
      media: 'movie',
      rating: 8,
      title: 'Solid',
      body: 'A solid film with great pacing and strong craft.',
    };
    const okRes = mockRes() as never;
    await handler(memberReq(token, csrfToken, { db, body: goodBody }), okRes);
    expect((okRes as unknown as ReturnType<typeof mockRes>).statusCode).toBe(200);
    const payload = (okRes as unknown as ReturnType<typeof mockRes>).body as {
      ok: boolean;
      id: string;
    };
    expect(payload.ok).toBe(true);
    expect(payload.id).toBeTruthy();

    const again = mockRes() as never;
    await handler(
      memberReq(token, csrfToken, {
        db,
        body: { ...goodBody, body: 'Updated take after a second viewing, still good.' },
      }),
      again,
    );
    expect(((again as unknown as ReturnType<typeof mockRes>).body as { id: string }).id).toBe(
      payload.id,
    );

    const getRes = mockRes() as never;
    await handler(
      { method: 'GET', query: { tmdbId: '550', media: 'movie' }, headers: {}, cookies: {}, db } as never,
      getRes,
    );
    expect((getRes as unknown as ReturnType<typeof mockRes>).statusCode).toBe(200);
    const listed = (getRes as unknown as ReturnType<typeof mockRes>).body as {
      ok: boolean;
      reviews: { handle: string }[];
    };
    expect(listed.reviews).toHaveLength(1);
    expect(listed.reviews[0].handle).toBe('api_reviewer');

    const badGet = mockRes() as never;
    await handler(
      { method: 'GET', query: {}, headers: {}, cookies: {}, db } as never,
      badGet,
    );
    expect((badGet as unknown as ReturnType<typeof mockRes>).statusCode).toBe(400);
  });

  it('POST /api/follow: 401 anon, 400 self, 404 ghost, toggle 200 with counts', async () => {
    const { db } = await makeSocialDb();
    const session = await import('../src/lib/auth/session');
    const handler = (await import('../src/pages/api/follow')).default as Function;
    const me = await seedUser(db, 'follow_me', 'fm@example.com');
    await seedUser(db, 'follow_target', 'ft@example.com');
    const { token, csrfToken } = await session.createMemberSession(me.id, me.email, db as never);

    const anon = mockRes() as never;
    await handler(
      { method: 'POST', body: { handle: 'follow_target' }, headers: {}, cookies: {}, db } as never,
      anon,
    );
    expect((anon as unknown as ReturnType<typeof mockRes>).statusCode).toBe(401);

    const self = mockRes() as never;
    await handler(memberReq(token, csrfToken, { db, body: { handle: 'follow_me' } }), self);
    expect((self as unknown as ReturnType<typeof mockRes>).statusCode).toBe(400);

    const ghost = mockRes() as never;
    await handler(memberReq(token, csrfToken, { db, body: { handle: 'ghost_handle' } }), ghost);
    expect((ghost as unknown as ReturnType<typeof mockRes>).statusCode).toBe(404);

    const on = mockRes() as never;
    await handler(
      memberReq(token, csrfToken, { db, body: { handle: 'follow_target' } }),
      on,
    );
    expect((on as unknown as ReturnType<typeof mockRes>).statusCode).toBe(200);
    expect((on as unknown as ReturnType<typeof mockRes>).body).toMatchObject({
      ok: true,
      following: true,
      followers: 1,
    });

    const off = mockRes() as never;
    await handler(
      memberReq(token, csrfToken, { db, body: { handle: 'follow_target' } }),
      off,
    );
    expect((off as unknown as ReturnType<typeof mockRes>).body).toMatchObject({
      ok: true,
      following: false,
      followers: 0,
    });
  });
});
