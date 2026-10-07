import { describe, expect, it } from 'vitest';

const SAMPLE = {
  title: 'Dune: Part Two',
  slug: 'dune-part-two',
  rating: 9,
  movie_id: '550',
  imdb_id: 'tt15239678',
  tmdb_id: 693134,
  published_at: '2026-02-01T00:00:00.000Z',
  seo_title: 'Dune: Part Two Review — Sandworms Earn It',
  seo_description: 'A 9/10 review of Villeneuve’s sequel.',
  body: '# Dune: Part Two\n\nLoved the sandworm ride.\n',
};

describe('portability: Markdown export/import round-trip', () => {
  it('exports all contract frontmatter fields + body', async () => {
    const { reviewToMarkdown } = await import('../src/lib/portability');
    const md = reviewToMarkdown(SAMPLE);
    for (const f of [
      'title:',
      'slug:',
      'rating:',
      'movie_id:',
      'imdb_id:',
      'tmdb_id:',
      'published_at:',
      'seo_title:',
      'seo_description:',
    ]) {
      expect(md).toContain(f);
    }
    expect(md).toContain('Loved the sandworm ride.');
  });

  it('imports the same file losslessly', async () => {
    const { reviewToMarkdown, markdownToReview } = await import('../src/lib/portability');
    const md = reviewToMarkdown(SAMPLE);
    const { review, warnings } = markdownToReview(md);
    expect(warnings).toEqual([]);
    expect(review.title).toBe(SAMPLE.title);
    expect(review.slug).toBe(SAMPLE.slug);
    expect(review.rating).toBe(9);
    expect(review.tmdb_id).toBe(693134);
    expect(review.imdb_id).toBe('tt15239678');
    expect(review.body).toContain('sandworm');
  });

  it('validates reviews (title/slug/rating/body)', async () => {
    const { validatePortableReview } = await import('../src/lib/portability');
    expect(validatePortableReview({ title: '', slug: '', body: '' })).toContain('title required');
    expect(
      validatePortableReview({ title: 'T', slug: 't', rating: 99, body: 'b' }),
    ).toContain('rating must be 0..10');
    expect(
      validatePortableReview({ title: 'T', slug: 't', rating: 8, body: 'b' }),
    ).toEqual([]);
  });
});

describe('portability: migration', () => {
  it('migrates legacy headline/permalink/text shape', async () => {
    const { migrateLegacyReview } = await import('../src/lib/portability');
    const { review, migrated, notes } = migrateLegacyReview({
      headline: 'Old Review',
      permalink: 'Old Review!!',
      text: 'Body here',
    });
    expect(migrated).toBe(true);
    expect(review.title).toBe('Old Review');
    expect(review.slug).toBe('old-review');
    expect(review.body).toBe('Body here');
    expect(notes.length).toBeGreaterThan(0);
  });

  it('idempotent on already-portable input', async () => {
    const { migrateLegacyReview } = await import('../src/lib/portability');
    const { migrated } = migrateLegacyReview({ title: 'T', slug: 't', body: 'b' });
    expect(migrated).toBe(false);
  });

  it('db snapshot serialize/deserialize round-trips; bad JSON is safe', async () => {
    const { serializeDb, deserializeDb } = await import('../src/lib/portability');
    const raw = serializeDb([{ id: '1', title: 'T' }]);
    expect(deserializeDb(raw).reviews).toHaveLength(1);
    const bad = deserializeDb('not json');
    expect(bad.reviews).toEqual([]);
    expect(bad.error).toBeTruthy();
    const missing = deserializeDb('{"version":1}');
    expect(missing.error).toContain('reviews');
  });
});
