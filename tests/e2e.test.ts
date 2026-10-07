import { describe, expect, it, vi, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Full e2e (mocked externals):
 * movieID -> metadata -> streaming -> research -> AI -> humanize -> SEO
 * -> Markdown -> publish -> public page (SEO + JSON-LD + hidden streaming on fail)
 */
describe('e2e: review pipeline with mocked externals', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.TMDB_API_KEY = 'tmdb-test';
    process.env.OMDB_API_KEY = 'omdb-test';
    process.env.OPENROUTER_API_KEY = 'or-test';
  });

  it('runs end to end and publishes', async () => {
    // --- mock all network: TMDB, OMDb, OpenRouter -------------------------
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: unknown, init?: unknown) => {
      const u = String(url);
      if (u.includes('api.themoviedb.org/3/movie/550/credits')) {
        return {
          ok: true,
          json: async () => ({
            cast: [{ id: 1, name: 'Timothée', character: 'Paul', order: 0 }],
            crew: [{ id: 2, name: 'Denis Villeneuve', job: 'Director' }],
          }),
        } as Response;
      }
      if (u.includes('api.themoviedb.org/3/movie/550/watch/providers')) {
        // streaming FAILS here -> section must hide
        return { ok: false, status: 500, statusText: 'err' } as Response;
      }
      if (u.includes('api.themoviedb.org/3/movie/550')) {
        return {
          ok: true,
          json: async () => ({
            id: 550,
            imdb_id: 'tt15239678',
            title: 'Dune: Part Two',
            release_date: '2024-03-01',
            overview: 'Paul rides the worm.',
            genres: [{ id: 1, name: 'Sci-Fi' }],
          }),
        } as Response;
      }
      if (u.includes('omdbapi.com')) {
        return {
          ok: true,
          json: async () => ({ Response: 'True', imdbRating: '8.6' }),
        } as Response;
      }
      if (u.includes('openrouter.ai')) {
        const body = JSON.parse(String((init as { body: string }).body));
        const sys: string = body.messages?.[0]?.content ?? '';
        let text = 'Draft review body. Paul rides the worm. 9/10 energy.';
        if (sys.includes('SEO editor')) {
          text = '{"title":"Dune: Part Two Review","metaDescription":"A great sequel.","slug":"dune-part-two"}';
        } else if (sys.includes('fact-checker')) {
          text = 'CLEAN';
        } else if (sys.includes('Quality pass')) {
          text = 'Humanized review body. Concrete sand, loud ornithopters.';
        }
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: text } }],
            model: 'mock',
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
        } as Response;
      }
      throw new Error(`unexpected fetch: ${u}`);
    });

    // 1. metadata
    const tmdb = await import('../src/lib/tmdb/client');
    const { movie, ok } = await tmdb.getMovieMetaSafe(550, 'US');
    expect(ok).toBe(true);
    expect(movie.title).toBe('Dune: Part Two');

    // 2. streaming fails -> hide
    const streaming = await import('../src/lib/streaming');
    const fail = await streaming.getStreamingAvailability(550, 'US');
    expect(fail.providers.hideSection).toBe(true);

    // 3. research store (opinion-only ok, no crash)
    const rs = await import('../src/lib/ai/research-store');
    expect(rs.shouldResearch({ userPrompt: 'Just my opinion, no context needed.' }).needed).toBe(false);
    const mem = rs.createMemoryResearchStore();
    await mem.saveSource({
      reviewId: 'e2e',
      url: 'https://example.com/interview',
      title: 'Director interview',
      source: 'web',
      retrievedAt: new Date().toISOString(),
      notes: 'Practical sets.',
      claims: [{ kind: 'FACT', text: 'Shot in Abu Dhabi.' }],
    });

    // 4-7. AI: full pipeline -> humanized -> SEO
    const pipeline = await import('../src/lib/ai/pipeline');
    const taste = (await import('../src/lib/ai/taste')).DEFAULT_TASTE;
    const store = pipeline.createMemoryJobStore();
    const job: pipeline.ReviewJob = {
      id: 'e2e-1',
      uxStage: 'fetching',
      input: {
        movie: { title: movie.title, year: movie.year ?? undefined, director: 'Denis Villeneuve' },
        rating: 9,
        userPrompt: 'The sandworm ride earned every minute.',
        taste,
        researchSources: await mem.listSources('e2e'),
        systemRules: 'Write a personal review. Honor the rating.',
      },
      outputs: {},
      updatedAt: new Date().toISOString(),
    };
    await store.create(job);
    const done = await pipeline.runFullReview(job, store);
    expect(done.uxStage).toBe('ready');
    expect(done.outputs.finalMarkdown).toContain('Humanized');
    expect(done.outputs.seo?.slug).toBe('dune-part-two');

    // 8. Markdown render (public page body)
    const { renderMarkdownSafe, buildSeoMeta, buildJsonLd } = await import('../src/lib/portability');
    const html = renderMarkdownSafe(done.outputs.finalMarkdown!);
    expect(html).toContain('<p>');

    // 9. publish via admin store (isolated temp DB)
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-'));
    process.env.REVIEWS_DB_PATH = path.join(dir, 'reviews.json');
    const adminStore = await import('../src/pages/api/admin/_store');
    const review = {
      id: adminStore.newId(),
      title: 'Dune: Part Two',
      slug: done.outputs.seo!.slug,
      excerpt: 'Sandworms earn it.',
      markdown: done.outputs.finalMarkdown!,
      status: 'published' as const,
      rating: 9,
      region: 'US',
      seo: { seoTitle: done.outputs.seo!.title, metaDesc: done.outputs.seo!.metaDescription },
      redirects: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
    };
    await adminStore.upsertReview(review);
    const pub = await adminStore.getReviewById(review.id);
    expect(pub?.status).toBe('published');

    // 10. public page head: SEO meta + JSON-LD, streaming hidden
    const meta = buildSeoMeta({
      title: pub!.title,
      slug: pub!.slug,
      siteUrl: 'https://reviews.example.com',
      siteName: 'The Long Take',
      seoTitle: pub!.seo?.seoTitle,
      seoDescription: pub!.seo?.metaDesc,
      excerpt: pub!.excerpt,
    });
    expect(meta.canonical).toContain('dune-part-two');
    const ld = buildJsonLd({
      title: pub!.title,
      slug: pub!.slug,
      siteUrl: 'https://reviews.example.com',
      rating: 9,
      publishedAt: pub!.publishedAt,
    });
    expect(ld).toHaveLength(2);
    expect(fail.providers.hideSection).toBe(true); // UI hides streaming section
    delete process.env.REVIEWS_DB_PATH;
  });
});
