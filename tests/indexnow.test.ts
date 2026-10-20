import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  INDEXNOW_DEFAULT_KEY,
  INDEXNOW_ENDPOINT,
  INDEXNOW_MAX_URLS,
  indexnowKey,
  notifyIndexNow,
} from '../src/lib/seo/indexnow';

/**
 * IndexNow integration (src/lib/seo/indexnow.ts).
 *
 * IndexNow is an open "these URLs changed, look now" protocol shared by
 * Bing, Yandex and friends. Two properties matter here and both are
 * tested below:
 *
 *  1. The pinger only ever announces OUR OWN URLs (http/https, same host)
 *     to the shared endpoint, with the site's public key.
 *  2. It NEVER throws into the publish path: a dead endpoint, a rejected
 *     request or a timeout is swallowed and reported as counts.
 *
 * The key is public by design (the protocol fetches it from the site
 * root), so it is asserted here, not hidden.
 */

const SITE = 'https://extramovies.org';
const REVIEW = `${SITE}/reviews/masaan-2015-review`;

let savedSiteUrl: string | undefined;
let savedKey: string | undefined;

function okResponse(): Response {
  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  savedSiteUrl = process.env.SITE_URL;
  savedKey = process.env.INDEXNOW_KEY;
  process.env.SITE_URL = SITE;
  delete process.env.INDEXNOW_KEY;
});

afterEach(() => {
  if (savedSiteUrl === undefined) delete process.env.SITE_URL;
  else process.env.SITE_URL = savedSiteUrl;
  if (savedKey === undefined) delete process.env.INDEXNOW_KEY;
  else process.env.INDEXNOW_KEY = savedKey;
  vi.unstubAllGlobals();
});

describe('indexnow: the pinger', () => {
  it('POSTs { host, key, urlList } to the IndexNow endpoint', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);

    const result = await notifyIndexNow([REVIEW]);

    expect(result).toEqual({ pinged: 1, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(INDEXNOW_ENDPOINT);
    expect(url).toBe('https://api.indexnow.org/indexnow');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toContain(
      'application/json',
    );
    expect(JSON.parse(String(init.body))).toEqual({
      host: 'extramovies.org',
      key: INDEXNOW_DEFAULT_KEY,
      urlList: [REVIEW],
    });
  });

  it('never pings a URL on a different host', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);

    const result = await notifyIndexNow([
      'https://example.com/not-ours',
      'https://cinemavilla.in/reviews/other-brand',
      'ftp://extramovies.org/reviews/nope',
      REVIEW,
    ]);

    // One request, and only OUR URL is in it.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.urlList).toEqual([REVIEW]);
    expect(body.host).toBe('extramovies.org');
    // The three rejected URLs are reported, not silently dropped.
    expect(result).toEqual({ pinged: 1, failed: 3 });
  });

  it('sends nothing at all when every URL is on another host', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);

    const result = await notifyIndexNow(['https://example.com/only']);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ pinged: 0, failed: 1 });
  });

  it('does nothing for an empty list', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);

    expect(await notifyIndexNow([])).toEqual({ pinged: 0, failed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a rejected fetch does not throw — the failure is reported', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = await notifyIndexNow([REVIEW]);
      expect(result).toEqual({ pinged: 0, failed: 1 });
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('a non-2xx answer does not throw — the failure is reported', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('bad request', { status: 400 })),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = await notifyIndexNow([REVIEW]);
      expect(result).toEqual({ pinged: 0, failed: 1 });
    } finally {
      warn.mockRestore();
    }
  });

  it('caps the url list at the protocol limit (10,000 per request)', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);

    const urls = Array.from(
      { length: INDEXNOW_MAX_URLS + 1 },
      (_, i) => `${SITE}/reviews/film-${i}`,
    );
    const result = await notifyIndexNow(urls);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(
      String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    );
    const second = JSON.parse(
      String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body),
    );
    expect(first.urlList).toHaveLength(INDEXNOW_MAX_URLS);
    expect(second.urlList).toHaveLength(1);
    expect(result).toEqual({ pinged: INDEXNOW_MAX_URLS + 1, failed: 0 });
  });

  it('the key is public: env override wins, default otherwise', async () => {
    expect(indexnowKey()).toBe(INDEXNOW_DEFAULT_KEY);
    expect(INDEXNOW_DEFAULT_KEY).toMatch(/^[0-9a-f]{32}$/);

    process.env.INDEXNOW_KEY = 'abc123';
    expect(indexnowKey()).toBe('abc123');

    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    await notifyIndexNow([REVIEW]);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).key).toBe('abc123');
  });

  it('the key file at the site root holds exactly the key', async () => {
    const file = path.join(
      process.cwd(),
      'public',
      `${INDEXNOW_DEFAULT_KEY}.txt`,
    );
    const content = await fs.readFile(file, 'utf8');
    expect(content.trim()).toBe(INDEXNOW_DEFAULT_KEY);
    expect(content.trim()).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('indexnow: the publish path', () => {
  let dir: string;
  let db: unknown;
  let token: string;
  let csrfToken: string;

  // Sessions-enabled :memory: DB (same contract as publish-rating-guard).
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
    const drizzleDb = drizzle(sqlite, { schema }) as never;
    return { db: drizzleDb };
  }

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

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'indexnow-publish-'));
    process.env.REVIEWS_DB_PATH = path.join(dir, 'reviews.json');
    vi.resetModules();
    ({ db } = await makeSessionDb());
    const session = await import('../src/lib/auth/session');
    ({ token, csrfToken } = await session.createSession('editor@example.com', db as never));
  });

  afterEach(() => {
    delete process.env.REVIEWS_DB_PATH;
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

  async function makeDraft() {
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
      rating: 8,
      redirects: [],
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  it('the publish still succeeds when the IndexNow ping fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('indexnow unreachable');
      }),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const id = await makeDraft();
    const publish = (await import('../src/pages/api/admin/publish')).default;
    const res = mockRes();

    try {
      await (publish as Function)(adminReq({ id }), res as never);
    } finally {
      warn.mockRestore();
    }

    // The publish result is untouched by the dead ping.
    expect(res.statusCode).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
    const store = await import('../src/pages/api/admin/_store');
    expect((await store.getReviewById(id))?.status).toBe('published');
  });

  it('a successful publish announces the review URL to IndexNow', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const id = await makeDraft();
    const publish = (await import('../src/pages/api/admin/publish')).default;
    const res = mockRes();

    await (publish as Function)(adminReq({ id }), res as never);

    expect(res.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(INDEXNOW_ENDPOINT);
    const body = JSON.parse(String(init.body));
    expect(body.host).toBe('extramovies.org');
    expect(body.key).toBe(INDEXNOW_DEFAULT_KEY);
    expect(body.urlList).toEqual([
      'https://extramovies.org/reviews/masaan-2015-review',
    ]);
  });
});

describe('indexnow: the seed importer', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'indexnow-import-'));
  });

  async function makeSeed(slug: string) {
    const file = path.join(dir, `${slug}.md`);
    const md = [
      '---',
      `title: Seed ${slug}`,
      `slug: ${slug}`,
      'rating: 8',
      'published_at: "2026-10-17T09:00:00.000Z"',
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

  it('announces a published seed and never fails the import', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { importMarkdown } = await import('../scripts/import');
    const db = path.join(dir, 'reviews.json');
    const file = await makeSeed('seed-film');

    const r = await importMarkdown(file, { dbPath: db });

    expect(r.imported).toBe(1);
    const rows = JSON.parse(await fs.readFile(db, 'utf8'));
    expect(rows[0].status).toBe('published');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(INDEXNOW_ENDPOINT);
    const body = JSON.parse(String(init.body));
    expect(body.host).toBe('extramovies.org');
    expect(body.key).toBe(INDEXNOW_DEFAULT_KEY);
    expect(body.urlList).toEqual(['https://extramovies.org/reviews/seed-film']);
  });

  it('a failing ping never fails the import', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('indexnow unreachable');
      }),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { importMarkdown } = await import('../scripts/import');
    const db = path.join(dir, 'reviews.json');
    const file = await makeSeed('seed-film-two');

    try {
      const r = await importMarkdown(file, { dbPath: db });
      expect(r.imported).toBe(1);
      expect(r.errors).toEqual([]);
    } finally {
      warn.mockRestore();
    }

    const rows = JSON.parse(await fs.readFile(db, 'utf8'));
    expect(rows[0].status).toBe('published');
  });
});
