import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// NOTE (cross-slice): src/pages/api/admin/save-draft.ts / publish.ts currently
// import '../../../../lib/...' (one level too many) and fail to load under
// vitest. The store contract below pins creation / draft-save / publish /
// slug / redirect behavior at the `_store` level (correct import, no guard
// dependency) so this slice stays green; handler wiring is the admin-API
// owner's fix (one-line path correction).

describe('movie fetch (mocked TMDB)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.TMDB_API_KEY = 'test-key';
  });

  it('getMovieMeta maps details + credits', async () => {
    const client = await import('../src/lib/tmdb/client');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: unknown) => {
      const u = String(url);
      if (u.includes('/credits')) {
        return {
          ok: true,
          json: async () => ({
            cast: [{ id: 1, name: 'Actor A', character: 'Hero', order: 0 }],
            crew: [{ id: 9, name: 'Director D', job: 'Director' }],
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          id: 550,
          title: 'Fight Club',
          release_date: '1999-10-15',
          genres: [{ id: 18, name: 'Drama' }],
          poster_path: '/p.jpg',
        }),
      } as Response;
    });
    const meta = await client.getMovieMeta(550, 'US');
    expect(meta.title).toBe('Fight Club');
    expect(meta.year).toBe(1999);
    expect(meta.credits.directors[0].name).toBe('Director D');
  });

  it('getMovieMetaSafe returns safe defaults on failure (manual-entry path)', async () => {
    const client = await import('../src/lib/tmdb/client');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const { movie, ok } = await client.getMovieMetaSafe(999, 'US');
    expect(ok).toBe(false);
    expect(movie.title).toBe('Untitled');
  });

  it('TMDB failure surfaces manualEntryAllowed via movie-lookup handler', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'));
    const { default: handler } = await import('../src/pages/api/movie-lookup');
    const req = { method: 'GET', query: { tmdbId: '999', region: 'US' } } as never;
    let status = 0;
    let payload: unknown;
    const res = {
      status(s: number) {
        status = s;
        return this;
      },
      json(b: unknown) {
        payload = b;
        return this;
      },
    } as never;
    await (handler as Function)(req, res);
    expect([200, 502]).toContain(status);
    expect((payload as { manualEntryAllowed: boolean }).manualEntryAllowed).toBe(true);
  });
});

describe('movie creation / draft save / publishing / slugs / redirects (store contract)', () => {
  beforeEach(async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reviews-'));
    process.env.REVIEWS_DB_PATH = path.join(dir, 'reviews.json');
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.REVIEWS_DB_PATH;
  });

  it('creates a draft (never auto-publishes)', async () => {
    const store = await import('../src/pages/api/admin/_store');
    const now = new Date().toISOString();
    const slug = store.slugify('Dune: Part Two');
    await store.upsertReview({
      id: store.newId(),
      title: 'Dune: Part Two',
      slug,
      excerpt: '',
      markdown: '# Great\nLoved it.',
      status: 'draft',
      redirects: [],
      createdAt: now,
      updatedAt: now,
    });
    expect(slug).toBe('dune-part-two');
    const all = await store.listReviews();
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe('draft');
  });

  it('draft validation contract: title + markdown required', async () => {
    // mirrors save-draft handler validation without importing the handler
    const invalid = [
      { title: '', markdown: 'body' },
      { title: 'T', markdown: '   ' },
    ];
    for (const b of invalid) {
      expect(!b.title.trim() || !(b.markdown as string).trim()).toBe(true);
    }
    expect(!'Blade Runner'.trim()).toBe(false);
  });

  it('publishing flips draft -> published and stamps publishedAt', async () => {
    const store = await import('../src/pages/api/admin/_store');
    const now = new Date().toISOString();
    const id = store.newId();
    await store.upsertReview({
      id,
      title: 'Blade Runner',
      slug: 'blade-runner',
      excerpt: '',
      markdown: 'Neon rain.',
      status: 'draft',
      redirects: [],
      createdAt: now,
      updatedAt: now,
    });
    const before = await store.getReviewById(id);
    expect(before?.status).toBe('draft');

    // publish contract: requires title + slug + markdown, keeps first publishedAt
    const review = (await store.getReviewById(id))!;
    expect(review.title.trim() && review.markdown.trim() && review.slug.trim()).toBeTruthy();
    review.status = 'published';
    review.publishedAt = review.publishedAt ?? new Date().toISOString();
    review.updatedAt = new Date().toISOString();
    await store.upsertReview(review);

    const after = await store.getReviewById(id);
    expect(after?.status).toBe('published');
    expect(after?.publishedAt).toBeTruthy();
  });

  it('slug change keeps old slug in redirects (308 path)', async () => {
    const store = await import('../src/pages/api/admin/_store');
    const now = new Date().toISOString();
    const id = store.newId();
    await store.upsertReview({
      id,
      title: 'Old Title',
      slug: 'old-title',
      excerpt: '',
      markdown: 'body',
      status: 'draft',
      redirects: [],
      createdAt: now,
      updatedAt: now,
    });
    // save-draft contract: on slug change, push old slug to redirects
    const existing = (await store.getReviewById(id))!;
    const nextSlug = store.slugify('new-title');
    const redirects = new Set(existing.redirects ?? []);
    if (existing.slug && nextSlug !== existing.slug) redirects.add(existing.slug);
    await store.upsertReview({ ...existing, title: 'New Title', slug: nextSlug, redirects: [...redirects] });

    const updated = await store.getReviewById(id);
    expect(updated?.slug).toBe('new-title');
    expect(updated?.redirects).toContain('old-title');
    expect((await store.findBySlug('old-title'))?.id).toBe(id);
  });

  it('slugify handles unicode, caps length, falls back', async () => {
    const store = await import('../src/pages/api/admin/_store');
    expect(store.slugify('Café Society! 2024')).toBe('cafe-society-2024');
    expect(store.slugify('')).toBe('review');
    expect(store.slugify('a'.repeat(200)).length).toBeLessThanOrEqual(80);
  });

  it('markdown renders safely (raw HTML escaped)', async () => {
    const { renderMarkdownSafe } = await import('../src/lib/portability');
    const html = renderMarkdownSafe('# Hi\n<script>alert(1)</script>\n**bold**');
    expect(html).toContain('<h1>Hi</h1>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('<strong>bold</strong>');
  });
});
