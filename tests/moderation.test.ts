import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

// Moderation slice — reports + hide/unhide (migration 0005_moderation.sql).
// Real :memory: sqlite doubles (same pattern as the members slice):
// DDL = 0004_social + 0005_moderation so the contract stays in migrations.

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

async function makeModerationDb() {
  const Database = (await import('better-sqlite3')).default;
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const schema = await import('../src/lib/db/schema');
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  for (const file of ['0004_social.sql', '0005_moderation.sql', '0006_sessions.sql']) {
    const ddl = await fs.readFile(path.join(process.cwd(), 'migrations', file), 'utf8');
    sqlite.exec(ddl);
  }
  const db = drizzle(sqlite, { schema }) as never;
  return { db, sqlite };
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

function authedReq(token: string, csrf: string | null, extra: Record<string, unknown> = {}) {
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

async function seedReview(db: never, userId: string, tmdbId: number, body: string) {
  const reviews = await import('../src/lib/members/reviews');
  const out = await reviews.createOrUpdateReview(db as never, userId, {
    tmdbId,
    media: 'movie',
    rating: 7,
    title: 'T',
    body,
  });
  if (!out.ok) throw new Error(`review seed failed: ${out.error}`);
  return out.id;
}

describe('reportReview validation + idempotency + self-report', () => {
  it('rejects bad reasons and unknown reviews', async () => {
    const { db } = await makeModerationDb();
    const mod = await import('../src/lib/members/moderation');
    const author = await seedUser(db, 'mod_author_a', 'maa@example.com');
    const reporter = await seedUser(db, 'mod_reporter_a', 'mra@example.com');
    const reviewId = await seedReview(db, author.id, 550, 'A genuinely great film worth watching twice.');

    expect(await mod.reportReview(db as never, reporter.id, reviewId, 'ok')).toMatchObject({
      ok: false,
      error: 'invalid reason',
    });
    expect(await mod.reportReview(db as never, reporter.id, reviewId, '  ')).toMatchObject({
      ok: false,
      error: 'invalid reason',
    });
    expect(await mod.reportReview(db as never, reporter.id, reviewId, 'x'.repeat(201))).toMatchObject({
      ok: false,
      error: 'invalid reason',
    });
    expect(await mod.reportReview(db as never, reporter.id, 'mr_missing', 'spam content here')).toMatchObject({
      ok: false,
      error: 'review not found',
    });
    expect(await mod.reportReview(db as never, reporter.id, '', 'spam content here')).toMatchObject({
      ok: false,
      error: 'invalid reviewId',
    });
  });

  it('rejects self-reports', async () => {
    const { db } = await makeModerationDb();
    const mod = await import('../src/lib/members/moderation');
    const author = await seedUser(db, 'mod_self', 'self@example.com');
    const reviewId = await seedReview(db, author.id, 551, 'My own thoughtful review of this fine film.');
    expect(await mod.reportReview(db as never, author.id, reviewId, 'spammy behaviour')).toMatchObject({
      ok: false,
      error: 'cannot report own review',
    });
  });

  it('is idempotent for repeat reports from the same reporter', async () => {
    const { db, sqlite } = await makeModerationDb();
    const mod = await import('../src/lib/members/moderation');
    const author = await seedUser(db, 'mod_author_b', 'mab@example.com');
    const reporter = await seedUser(db, 'mod_reporter_b', 'mrb@example.com');
    const reviewId = await seedReview(db, author.id, 552, 'Another solid film with great pacing and craft.');

    const first = await mod.reportReview(db as never, reporter.id, reviewId, 'off topic rant here');
    expect(first.ok).toBe(true);
    const second = await mod.reportReview(db as never, reporter.id, reviewId, 'a different reason text');
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.id).toBe(first.id);
    const count = sqlite
      .prepare('SELECT COUNT(*) AS n FROM review_reports WHERE review_id = ?')
      .get(reviewId) as { n: number };
    expect(count.n).toBe(1);
  });
});

describe('hidden reviews excluded from public lists', () => {
  it('listForMovie + listForUser skip hidden until restored', async () => {
    const { db } = await makeModerationDb();
    const reviews = await import('../src/lib/members/reviews');
    const mod = await import('../src/lib/members/moderation');
    const author = await seedUser(db, 'mod_hide_a', 'mha@example.com');
    const reviewId = await seedReview(db, author.id, 553, 'A film worth hiding for moderation testing here.');

    expect(await reviews.listForMovie(db as never, 553, 'movie', 20)).toHaveLength(1);
    expect(await reviews.listForUser(db as never, author.id, 50)).toHaveLength(1);

    expect(await mod.setReviewStatus(db as never, reviewId, 'hidden')).toMatchObject({
      ok: true,
      status: 'hidden',
    });
    expect(await reviews.listForMovie(db as never, 553, 'movie', 20)).toHaveLength(0);
    expect(await reviews.listForUser(db as never, author.id, 50)).toHaveLength(0);

    expect(await mod.setReviewStatus(db as never, reviewId, 'visible')).toMatchObject({
      ok: true,
      status: 'visible',
    });
    expect(await reviews.listForMovie(db as never, 553, 'movie', 20)).toHaveLength(1);
    expect(await reviews.listForUser(db as never, author.id, 50)).toHaveLength(1);
  });

  it('setReviewStatus validates input', async () => {
    const { db } = await makeModerationDb();
    const mod = await import('../src/lib/members/moderation');
    expect(await mod.setReviewStatus(db as never, 'mr_missing', 'hidden')).toMatchObject({
      ok: false,
      error: 'review not found',
    });
    expect(await mod.setReviewStatus(db as never, '', 'hidden')).toMatchObject({
      ok: false,
      error: 'invalid id',
    });
    expect(await mod.setReviewStatus(db as never, 'mr_x', 'deleted')).toMatchObject({
      ok: false,
      error: 'invalid status',
    });
  });
});

describe('POST /api/member/report guards + happy path', () => {
  it('401 anon/admin, 403 bad CSRF, 400/404 edges, 200 ok', async () => {
    const { db } = await makeModerationDb();
    const session = await import('../src/lib/auth/session');
    const handler = (await import('../src/pages/api/member/report')).default as Function;
    const author = await seedUser(db, 'rep_author', 'ra@example.com');
    const reporter = await seedUser(db, 'rep_reporter', 'rr@example.com');
    const reviewId = await seedReview(db, author.id, 554, 'A reportable review with enough text to be valid.');

    const anon = mockRes() as never;
    await handler(
      { method: 'POST', body: { reviewId, reason: 'spammy content' }, headers: {}, cookies: {}, db } as never,
      anon,
    );
    expect((anon as unknown as ReturnType<typeof mockRes>).statusCode).toBe(401);

    const admin = await session.createSession('editor@example.com', db as never);
    const adminRes = mockRes() as never;
    await handler(authedReq(admin.token, admin.csrfToken, { db, body: { reviewId, reason: 'spam' } }), adminRes);
    expect((adminRes as unknown as ReturnType<typeof mockRes>).statusCode).toBe(401);

    const { token, csrfToken } = await session.createMemberSession(reporter.id, reporter.email, db as never);
    const noCsrf = mockRes() as never;
    await handler(authedReq(token, null, { db, body: { reviewId, reason: 'spam content' } }), noCsrf);
    expect((noCsrf as unknown as ReturnType<typeof mockRes>).statusCode).toBe(403);

    const short = mockRes() as never;
    await handler(authedReq(token, csrfToken, { db, body: { reviewId, reason: 'no' } }), short);
    expect((short as unknown as ReturnType<typeof mockRes>).statusCode).toBe(400);

    const ghost = mockRes() as never;
    await handler(authedReq(token, csrfToken, { db, body: { reviewId: 'mr_missing', reason: 'spam content' } }), ghost);
    expect((ghost as unknown as ReturnType<typeof mockRes>).statusCode).toBe(404);

    const { token: authorToken, csrfToken: authorCsrf } = await session.createMemberSession(author.id, author.email, db as never);
    const self = mockRes() as never;
    await handler(authedReq(authorToken, authorCsrf, { db, body: { reviewId, reason: 'i dislike my review' } }), self);
    expect((self as unknown as ReturnType<typeof mockRes>).statusCode).toBe(400);
    expect(((self as unknown as ReturnType<typeof mockRes>).body as { error: string }).error).toBe(
      'cannot report own review',
    );

    const okRes = mockRes() as never;
    await handler(authedReq(token, csrfToken, { db, body: { reviewId, reason: 'off topic rant' } }), okRes);
    expect((okRes as unknown as ReturnType<typeof mockRes>).statusCode).toBe(200);
    expect((okRes as unknown as ReturnType<typeof mockRes>).body).toMatchObject({ ok: true });

    // Idempotent repeat via the API also 200s.
    const again = mockRes() as never;
    await handler(authedReq(token, csrfToken, { db, body: { reviewId, reason: 'still off topic' } }), again);
    expect((again as unknown as ReturnType<typeof mockRes>).statusCode).toBe(200);
  });
});

describe('POST /api/admin/moderation list + hide/show + guards', () => {
  it('401 anon, 403 bad CSRF, 400/404 edges, list/hide/show round-trip', async () => {
    const { db } = await makeModerationDb();
    const session = await import('../src/lib/auth/session');
    const reviews = await import('../src/lib/members/reviews');
    const mod = await import('../src/lib/members/moderation');
    const handler = (await import('../src/pages/api/admin/moderation')).default as Function;
    const author = await seedUser(db, 'adm_author', 'aa@example.com');
    const reporter = await seedUser(db, 'adm_reporter', 'ar@example.com');
    const reviewId = await seedReview(db, author.id, 555, 'A flaggable review with enough text to be valid.');
    const reported = await mod.reportReview(db as never, reporter.id, reviewId, 'spoiler dump here');
    expect(reported.ok).toBe(true);

    const anon = mockRes() as never;
    await handler({ method: 'POST', body: { action: 'list' }, headers: {}, cookies: {}, db } as never, anon);
    expect((anon as unknown as ReturnType<typeof mockRes>).statusCode).toBe(401);

    const admin = await session.createSession('editor@example.com', db as never);
    const noCsrf = mockRes() as never;
    await handler(authedReq(admin.token, null, { db, body: { action: 'list' } }), noCsrf);
    expect((noCsrf as unknown as ReturnType<typeof mockRes>).statusCode).toBe(403);

    const badAction = mockRes() as never;
    await handler(authedReq(admin.token, admin.csrfToken, { db, body: { action: 'nuke' } }), badAction);
    expect((badAction as unknown as ReturnType<typeof mockRes>).statusCode).toBe(400);

    const badId = mockRes() as never;
    await handler(authedReq(admin.token, admin.csrfToken, { db, body: { action: 'hide' } }), badId);
    expect((badId as unknown as ReturnType<typeof mockRes>).statusCode).toBe(400);

    const ghost = mockRes() as never;
    await handler(
      authedReq(admin.token, admin.csrfToken, { db, body: { action: 'hide', id: 'mr_missing' } }),
      ghost,
    );
    expect((ghost as unknown as ReturnType<typeof mockRes>).statusCode).toBe(404);

    const list = mockRes() as never;
    await handler(authedReq(admin.token, admin.csrfToken, { db, body: { action: 'list' } }), list);
    expect((list as unknown as ReturnType<typeof mockRes>).statusCode).toBe(200);
    const items = ((list as unknown as ReturnType<typeof mockRes>).body as {
      ok: boolean;
      items: { id: string; tmdbId: number; reports: number; handle: string }[];
    }).items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: reviewId, tmdbId: 555, reports: 1, handle: 'adm_author' });

    const hide = mockRes() as never;
    await handler(authedReq(admin.token, admin.csrfToken, { db, body: { action: 'hide', id: reviewId } }), hide);
    expect((hide as unknown as ReturnType<typeof mockRes>).statusCode).toBe(200);
    expect((hide as unknown as ReturnType<typeof mockRes>).body).toMatchObject({ ok: true, status: 'hidden' });
    expect(await reviews.listForMovie(db as never, 555, 'movie', 20)).toHaveLength(0);

    const show = mockRes() as never;
    await handler(authedReq(admin.token, admin.csrfToken, { db, body: { action: 'show', id: reviewId } }), show);
    expect((show as unknown as ReturnType<typeof mockRes>).statusCode).toBe(200);
    expect((show as unknown as ReturnType<typeof mockRes>).body).toMatchObject({ ok: true, status: 'visible' });
    expect(await reviews.listForMovie(db as never, 555, 'movie', 20)).toHaveLength(1);
  });
});
