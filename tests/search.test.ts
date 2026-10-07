import { describe, expect, it } from 'vitest';

describe('search FTS (portable, no DB required)', () => {
  it('finds by title with prefix + ranks title over body', async () => {
    const { searchReviews } = await import('../src/lib/portability');
    const docs = [
      { title: 'Dune: Part Two', slug: 'dune-2', body: 'sand worms epic', excerpt: '' },
      { title: 'Oppenheimer', slug: 'opp', body: 'dune mentioned once here', excerpt: '' },
    ];
    const hits = searchReviews(docs, 'dune');
    expect(hits[0].slug).toBe('dune-2');
  });

  it('AND semantics: all tokens must match', async () => {
    const { searchReviews } = await import('../src/lib/portability');
    const docs = [
      { title: 'Dune Review', slug: 'a', body: 'sand', excerpt: '' },
      { title: 'Dune Messiah', slug: 'b', body: 'sand worms', excerpt: '' },
    ];
    const hits = searchReviews(docs, 'dune worms');
    expect(hits.map((h) => h.slug)).toEqual(['b']);
  });

  it('empty / stopword query returns []', async () => {
    const { searchReviews } = await import('../src/lib/portability');
    expect(searchReviews([{ title: 'A', slug: 'a' }], '')).toEqual([]);
    expect(searchReviews([{ title: 'A', slug: 'a' }], 'a')).toEqual([]);
  });

  it('tokenize normalizes unicode + drops single chars', async () => {
    const { tokenize } = await import('../src/lib/portability');
    expect(tokenize('Café A I')).toContain('cafe');
    expect(tokenize('a i')).toEqual([]);
  });
});
