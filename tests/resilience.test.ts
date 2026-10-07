import { describe, expect, it, vi, beforeEach } from 'vitest';

describe('resilience: OpenRouter failure keeps draft', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('pipeline run throws but prior draft/outputs are preserved', async () => {
    process.env.OPENROUTER_API_KEY = 'test';
    const pipeline = await import('../src/lib/ai/pipeline');
    const store = pipeline.createMemoryJobStore();
    const job: pipeline.ReviewJob = {
      id: 'j1',
      uxStage: 'writing',
      input: {
        movie: { title: 'Dune', year: 2024 },
        rating: 9,
        userPrompt: 'Loved the sandworm ride.',
        taste: (await import('../src/lib/ai/taste')).DEFAULT_TASTE,
        researchSources: [],
        systemRules: 'rules',
      },
      outputs: { draft: 'Existing draft — must survive.' },
      updatedAt: new Date().toISOString(),
    };
    await store.create(job);

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('OpenRouter 503'));

    await expect(pipeline.runFullReview(job, store)).rejects.toThrow();
    const kept = await store.get('j1');
    // in-memory store keeps the job object; draft written before failure survives
    expect(kept).toBeTruthy();
    expect(job.outputs.draft).toContain('Existing draft');
  });

  it('generate-review handler returns 500 (not draft loss) on AI failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('AI down'));
    process.env.OPENROUTER_API_KEY = 'test';
    const { default: handler } = await import('../src/pages/api/generate/generate-review');
    const req = {
      method: 'POST',
      body: {
        movie: { title: 'Dune' },
        rating: 8,
        userPrompt: 'Great.',
        taste: {},
      },
    } as never;
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
    expect(status).toBe(500);
    expect((payload as { error: string }).error).toBeTruthy();
  });
});

describe('resilience: TMDB failure -> manual entry', () => {
  it('toManualMovieMeta shapes a publishable movie without TMDB', async () => {
    const { toManualMovieMeta } = await import('../src/lib/tmdb/types');
    const m = toManualMovieMeta(
      { title: 'Lost Indie', overview: 'No TMDB.', directorName: 'Jane' },
      'US',
    );
    expect(m.manualEntry).toBe(true);
    expect(m.title).toBe('Lost Indie');
    expect(m.credits.directors[0].name).toBe('Jane');
  });
});

describe('resilience: malformed external API is safe', () => {
  it('getMovieMetaSafe never throws on garbage JSON', async () => {
    process.env.TMDB_API_KEY = 'k';
    const client = await import('../src/lib/tmdb/client');
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => ({ ok: true, json: async () => ({ bogus: true }) }) as Response,
    );
    const { movie, ok } = await client.getMovieMetaSafe(1, 'US');
    expect(ok).toBe(true); // maps with defaults
    expect(movie.title).toBe('Untitled');
  });

  it('movie-lookup rejects invalid tmdbId with 400 (no crash)', async () => {
    const { default: handler } = await import('../src/pages/api/movie-lookup');
    const req = { method: 'GET', query: { tmdbId: 'not-a-number' } } as never;
    let status = 0;
    const res = {
      status(s: number) {
        status = s;
        return this;
      },
      json() {
        return this;
      },
    } as never;
    await (handler as Function)(req, res);
    expect(status).toBe(400);
  });

  it('markdown import never throws on malformed frontmatter', async () => {
    const { markdownToReview } = await import('../src/lib/portability');
    const { review, warnings } = markdownToReview('---\n: : : broken\nno-close', 'fallback');
    expect(review.slug).toBeTruthy();
    expect(Array.isArray(warnings)).toBe(true);
  });

  it('OMDb failure returns null (fail-soft)', async () => {
    process.env.OMDB_API_KEY = 'k';
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'));
    const { getOmdbEnrichment } = await import('../src/lib/omdb');
    await expect(getOmdbEnrichment('tt0111161')).resolves.toBeNull();
  });
});
