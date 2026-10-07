import { describe, expect, it, vi, beforeEach } from 'vitest';

describe('streaming section hides on failure', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('normalize hides when no providers', async () => {
    const { normalizeWatchProviders } = await import('../src/lib/streaming');
    const p = normalizeWatchProviders({ id: 1, results: {} }, 1, 'US');
    expect(p.hideSection).toBe(true);
  });

  it('/api/streaming returns hideSection=true + 200 on upstream failure', async () => {
    process.env.TMDB_API_KEY = 'k';
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('tmdb down'));
    const { default: handler } = await import('../src/pages/api/streaming');
    const req = { method: 'GET', query: { tmdbId: '550', region: 'US' } } as never;
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
    expect(status).toBe(200);
    expect((payload as { providers: { hideSection: boolean } }).providers.hideSection).toBe(true);
  });

  it('missing TMDB key fails soft (hideSection, ok=false)', async () => {
    delete process.env.TMDB_API_KEY;
    const { getStreamingAvailability } = await import('../src/lib/streaming');
    const { providers, ok } = await getStreamingAvailability(550, 'US');
    expect(ok).toBe(false);
    expect(providers.hideSection).toBe(true);
    process.env.TMDB_API_KEY = 'k';
  });
});

describe('SEO meta + JSON-LD + sitemap + RSS', () => {
  it('builds SEO meta with length caps', async () => {
    const { buildSeoMeta } = await import('../src/lib/portability');
    const m = buildSeoMeta({
      title: 'Dune Review',
      slug: 'dune-review',
      siteUrl: 'https://reviews.example.com',
      siteName: 'The Long Take',
      seoDescription: 'x'.repeat(500),
    });
    expect(m.canonical).toBe('https://reviews.example.com/dune-review');
    expect(m.description.length).toBeLessThanOrEqual(155);
    expect(m.ogType).toBe('article');
  });

  it('builds Movie + Review JSON-LD with rating', async () => {
    const { buildJsonLd } = await import('../src/lib/portability');
    const [movie, review] = buildJsonLd({
      title: 'Dune',
      slug: 'dune',
      siteUrl: 'https://reviews.example.com',
      rating: 9,
      publishedAt: '2026-01-01T00:00:00.000Z',
      director: 'Denis Villeneuve',
      year: 2024,
    });
    expect(movie['@type']).toBe('Movie');
    expect((review as Record<string, unknown>)['@type']).toBe('Review');
    expect(
      ((review as Record<string, unknown>).reviewRating as Record<string, unknown>).ratingValue,
    ).toBe(9);
  });

  it('sitemap escapes + includes lastmod', async () => {
    const { buildSitemapXml } = await import('../src/lib/portability');
    const xml = buildSitemapXml(
      [{ slug: 'dune-review', updatedAt: '2026-01-01T00:00:00.000Z' }],
      'https://reviews.example.com',
    );
    expect(xml).toContain('<loc>https://reviews.example.com/dune-review</loc>');
    expect(xml).toContain('<lastmod>');
  });

  it('RSS has channel + items with pubDate', async () => {
    const { buildRssXml } = await import('../src/lib/portability');
    const xml = buildRssXml(
      [{ title: 'Dune', slug: 'dune', excerpt: 'Great', publishedAt: '2026-01-01T00:00:00.000Z' }],
      { siteUrl: 'https://reviews.example.com', siteName: 'The Long Take' },
    );
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain('<title>Dune</title>');
    expect(xml).toContain('<pubDate>');
  });
});
