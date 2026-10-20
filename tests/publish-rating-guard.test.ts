import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Publish-time rating gate (src/lib/publish-guard.ts).
 *
 * House rule: the rating is the OWNER's call. A draft may sit at rating 0
 * until it is scored, but a review must never GO LIVE that way — the public
 * page renders "rated X/10" (src/pages/reviews/[slug].astro) and the Review
 * JSON-LD carries reviewRating.ratingValue (src/lib/seo/jsonld.ts).
 *
 * These tests drive the REAL admin handlers (/api/admin/save-draft +
 * /api/admin/publish) against a temp store, with a real admin session, so
 * the gate is proven wired into the publish path and not just in a helper.
 */

const REQUIRED_ERROR = 'Set a rating before publishing this review.';

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

// Sessions-enabled :memory: DB (migration 0006 contract, never data/local.db).
async function makeSessionDb() {
  const Database = (await import('better-sqlite3')).default;
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const schema = await import('../src/lib/db/schema');
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const ddl = await fs.readFile(
    path.join(process.cwd(), 'migrations', '0006_sessions.sql'),
    'utf8',
  );
  sqlite.exec(ddl);
  const db = drizzle(sqlite, { schema }) as never;
  return { db };
}

describe('admin publish: rating gate', () => {
  let dir: string;
  let db: unknown;
  let token: string;
  let csrfToken: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'publish-rating-'));
    process.env.REVIEWS_DB_PATH = path.join(dir, 'reviews.json');
    // The publish path announces the new URL to IndexNow — stub the
    // network so a test run never touches the real endpoint.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );
    vi.resetModules();
    ({ db } = await makeSessionDb());
    const session = await import('../src/lib/auth/session');
    ({ token, csrfToken } = await session.createSession('editor@example.com', db as never));
  });

  afterEach(() => {
    delete process.env.REVIEWS_DB_PATH;
    vi.unstubAllGlobals();
  });

  function adminReq(body: Record<string, unknown>) {
    return {
      method: 'POST',
      headers: { 'x-csrf-token': csrfToken, cookie: `admin_session=${token}` },
      cookies: { admin_session: token },
      db,
      body,
    };
  }

  /** Seed a draft row straight into the store (like a seed import does). */
  async function makeDraft(rating: number | undefined) {
    const store = await import('../src/pages/api/admin/_store');
    const now = new Date().toISOString();
    const id = store.newId();
    await store.upsertReview({
      id,
      title: 'Masaan',
      slug: 'masaan-2015-review',
      excerpt: 'Watch it.',
      markdown: '# Masaan\n\nA patient drama.',
      status: 'draft',
      ...(rating === undefined ? {} : { rating }),
      redirects: [],
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  it('refuses to publish a review whose rating is 0 (clear message, row stays a draft)', async () => {
    const id = await makeDraft(0);
    const publish = (await import('../src/pages/api/admin/publish')).default;
    const res = mockRes();

    await (publish as Function)(adminReq({ id }), res as never);

    expect(res.statusCode).toBe(400);
    expect((res.body as { ok: boolean }).ok).toBe(false);
    expect((res.body as { error: string }).error).toBe(REQUIRED_ERROR);

    const store = await import('../src/pages/api/admin/_store');
    const after = await store.getReviewById(id);
    expect(after?.status).toBe('draft');
    expect(after?.publishedAt).toBeUndefined();
  });

  it('refuses to publish a review whose rating is missing or null', async () => {
    const publish = (await import('../src/pages/api/admin/publish')).default;
    for (const rating of [undefined, null]) {
      const id = await makeDraft(rating as number | undefined);
      const res = mockRes();
      await (publish as Function)(adminReq({ id }), res as never);
      expect(res.statusCode).toBe(400);
      expect((res.body as { error: string }).error).toBe(REQUIRED_ERROR);
      const store = await import('../src/pages/api/admin/_store');
      expect((await store.getReviewById(id))?.status).toBe('draft');
    }
  });

  it('refuses to publish a review whose rating is out of range', async () => {
    const publish = (await import('../src/pages/api/admin/publish')).default;
    for (const rating of [-1, 11]) {
      const id = await makeDraft(rating);
      const res = mockRes();
      await (publish as Function)(adminReq({ id }), res as never);
      expect(res.statusCode).toBe(400);
      expect((res.body as { error: string }).error).toContain('between 0 and 10');
      const store = await import('../src/pages/api/admin/_store');
      expect((await store.getReviewById(id))?.status).toBe('draft');
    }
  });

  it('publishes a review with a valid rating (row flips to published, publishedAt stamped)', async () => {
    const id = await makeDraft(8);
    const publish = (await import('../src/pages/api/admin/publish')).default;
    const res = mockRes();

    await (publish as Function)(adminReq({ id }), res as never);

    expect(res.statusCode).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
    const store = await import('../src/pages/api/admin/_store');
    const after = await store.getReviewById(id);
    expect(after?.status).toBe('published');
    expect(after?.publishedAt).toBeTruthy();
    expect(after?.rating).toBe(8);
  });

  it('still saves a draft with rating 0 (the owner scores it later)', async () => {
    const saveDraft = (await import('../src/pages/api/admin/save-draft')).default;
    const res = mockRes();

    await (
      saveDraft as Function
    )(
      adminReq({
        title: 'Masaan',
        slug: 'masaan-2015-review',
        excerpt: 'Watch it.',
        markdown: '# Masaan\n\nA patient drama.',
        rating: 0,
      }),
      res as never,
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
    const store = await import('../src/pages/api/admin/_store');
    const row = await store.getReviewById((res.body as { id: string }).id);
    expect(row?.status).toBe('draft');
    expect(row?.rating).toBe(0);
  });

  it('a draft saved with rating 0 stays unpublished until it is scored', async () => {
    const saveDraft = (await import('../src/pages/api/admin/save-draft')).default;
    const saveRes = mockRes();
    await (
      saveDraft as Function
    )(
      adminReq({
        title: 'Masaan',
        slug: 'masaan-2015-review',
        markdown: '# Masaan\n\nA patient drama.',
        rating: 0,
      }),
      saveRes as never,
    );
    const id = (saveRes.body as { id: string }).id;

    const publish = (await import('../src/pages/api/admin/publish')).default;
    const publishRes = mockRes();
    await (publish as Function)(adminReq({ id }), publishRes as never);
    expect(publishRes.statusCode).toBe(400);
    expect((publishRes.body as { error: string }).error).toBe(REQUIRED_ERROR);

    // Owner scores it -> publish succeeds.
    const scoreRes = mockRes();
    await (
      saveDraft as Function
    )(
      adminReq({
        id,
        title: 'Masaan',
        slug: 'masaan-2015-review',
        markdown: '# Masaan\n\nA patient drama.',
        rating: 8.5,
      }),
      scoreRes as never,
    );
    const okRes = mockRes();
    await (publish as Function)(adminReq({ id }), okRes as never);
    expect(okRes.statusCode).toBe(200);
    const store = await import('../src/pages/api/admin/_store');
    expect((await store.getReviewById(id))?.status).toBe('published');
  });
});

describe('publish gate: scope', () => {
  it('leaves member reviews alone (their own rating rules: null|0..10)', async () => {
    const { validateReviewInput } = await import('../src/lib/members/reviews');
    const base = { tmdbId: 336203, body: 'A patient drama worth your time.', title: 'Masaan' };
    // rating 0 and a missing rating are still valid for members.
    expect(validateReviewInput({ ...base, rating: 0 }).ok).toBe(true);
    expect(validateReviewInput({ ...base, rating: null }).ok).toBe(true);
    expect(validateReviewInput({ ...base }).ok).toBe(true);
    expect(validateReviewInput({ ...base, rating: 11 }).ok).toBe(false);
  });

  it('gate helper: 0 / missing / null / out-of-range are refused, real scores pass', async () => {
    const { checkPublishRating, PUBLISH_RATING_REQUIRED_ERROR } = await import(
      '../src/lib/publish-guard'
    );
    expect(checkPublishRating(0)).toEqual({ ok: false, error: PUBLISH_RATING_REQUIRED_ERROR });
    expect(checkPublishRating(undefined).ok).toBe(false);
    expect(checkPublishRating(null).ok).toBe(false);
    expect(checkPublishRating(11).ok).toBe(false);
    expect(checkPublishRating(-1).ok).toBe(false);
    expect(checkPublishRating(0.5).ok).toBe(true);
    expect(checkPublishRating(8).ok).toBe(true);
    expect(checkPublishRating(9.2).ok).toBe(true);
    expect(checkPublishRating(10).ok).toBe(true);
  });
});

describe('seed import: refuses to publish an unrated seed', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-rating-'));
  });

  async function makeSeed(slug: string, opts: { publishedAt?: string; rating?: number } = {}) {
    const file = path.join(dir, `${slug}.md`);
    const md = [
      '---',
      `title: Seed ${slug}`,
      `slug: ${slug}`,
      `rating: ${opts.rating ?? 0}`,
      ...(opts.publishedAt ? [`published_at: "${opts.publishedAt}"`] : []),
      'excerpt: Seed excerpt here.',
      'movie_title: Seed Film',
      '---',
      '',
      `# Seed ${slug}`,
      '',
      'Seed body copy.',
      '',
    ].join('\n');
    await fs.writeFile(file, md, 'utf8');
    return file;
  }

  it('a seed asking to publish without a rating lands as a draft and is reported', async () => {
    const { importMarkdown } = await import('../scripts/import');
    const db = path.join(dir, 'reviews.json');
    const file = await makeSeed('unrated-seed', { publishedAt: '2026-10-17T09:00:00.000Z' });
    const r = await importMarkdown(file, { dbPath: db });
    expect(r.refused.length).toBe(1);
    expect(r.refused[0]).toContain(REQUIRED_ERROR);
    const rows = JSON.parse(await fs.readFile(db, 'utf8'));
    expect(rows[0].status).toBe('draft');
    expect(rows[0].publishedAt ?? null).toBeNull();
  });

  it('a scored seed still publishes itself (unchanged behaviour)', async () => {
    const { importMarkdown } = await import('../scripts/import');
    const db = path.join(dir, 'reviews.json');
    const file = await makeSeed('scored-seed', { publishedAt: '2026-10-17T09:00:00.000Z', rating: 7 });
    const r = await importMarkdown(file, { dbPath: db });
    expect(r.refused).toEqual([]);
    const rows = JSON.parse(await fs.readFile(db, 'utf8'));
    expect(rows[0].status).toBe('published');
    expect(rows[0].publishedAt).toBe('2026-10-17T09:00:00.000Z');
  });

  it('an unrated seed with no published_at stays a draft (owner scores it later)', async () => {
    const { importMarkdown } = await import('../scripts/import');
    const db = path.join(dir, 'reviews.json');
    const file = await makeSeed('draft-seed', { rating: 0 });
    const r = await importMarkdown(file, { dbPath: db });
    expect(r.refused).toEqual([]);
    const rows = JSON.parse(await fs.readFile(db, 'utf8'));
    expect(rows[0].status).toBe('draft');
    expect(rows[0].rating).toBe(0);
  });

  it('a batch run with one unrated publish seed exits 0, warns, and imports the rest', async () => {
    const { runImport } = await import('../scripts/import');
    const db = path.join(dir, 'reviews.json');
    await makeSeed('unrated-seed', { publishedAt: '2026-10-17T09:00:00.000Z', rating: 0 });
    await makeSeed('scored-seed', { publishedAt: '2026-10-17T09:00:00.000Z', rating: 7 });
    await makeSeed('plain-draft-seed', { rating: 0 });

    const warnings: string[] = [];
    const spy = vi
      .spyOn(console, 'error')
      .mockImplementation((...args: unknown[]) => {
        warnings.push(args.map((a) => String(a)).join(' '));
      });

    let exitCode: number;
    try {
      exitCode = await runImport(dir, { dbPath: db });
    } finally {
      spy.mockRestore();
    }

    // One content mistake must never block the run (or the release).
    expect(exitCode).toBe(0);

    // Loud warning: names the slug + tells the owner what to do.
    const warning = warnings.find((w) => w.includes('unrated-seed'));
    expect(warning).toBeTruthy();
    expect(warning).toContain('unrated-seed');
    expect(warning).toContain('Set a rating');
    expect(warning).toContain('/admin');

    // The unrated seed is a draft (never published with rating 0)...
    const rows = JSON.parse(await fs.readFile(db, 'utf8'));
    const unrated = rows.find((r: { slug: string }) => r.slug === 'unrated-seed');
    expect(unrated.status).toBe('draft');
    expect(unrated.publishedAt ?? null).toBeNull();
    expect(unrated.rating).toBe(0);

    // ...and the remaining seeds still imported (and published) normally.
    const scored = rows.find((r: { slug: string }) => r.slug === 'scored-seed');
    expect(scored.status).toBe('published');
    expect(scored.publishedAt).toBe('2026-10-17T09:00:00.000Z');
    const plain = rows.find((r: { slug: string }) => r.slug === 'plain-draft-seed');
    expect(plain.status).toBe('draft');
    expect(rows).toHaveLength(3);
  });
});
