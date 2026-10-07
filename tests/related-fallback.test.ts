import { describe, expect, it } from 'vitest';
import { relatedReviews } from '../src/lib/related';
import type { PublicReview } from '../src/lib/seo/content';

function row(overrides: Partial<PublicReview> = {}): PublicReview {
  return {
    slug: 'film-a',
    reviewTitle: 'Review A',
    movieTitle: 'Film A',
    year: 2024,
    genres: ['Drama'],
    runtimeMinutes: 100,
    rating: 7,
    verdict: 'Fine.',
    excerpt: 'Fine film.',
    bodyMarkdown: 'Body.',
    posterUrl: null,
    backdropUrl: null,
    director: null,
    cast: [],
    publishedAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    authorName: 'The Editor',
    providers: null,
    tmdbId: null,
    ...overrides,
  } as PublicReview;
}

describe('relatedReviews', () => {
  it('ranks shared genres first', () => {
    const current = row({ slug: 'x', genres: ['Horror'] });
    const same = row({ slug: 'same', genres: ['Horror'], publishedAt: '2026-09-01T00:00:00.000Z' });
    const other = row({ slug: 'other', genres: ['Comedy'], publishedAt: '2026-10-05T00:00:00.000Z' });
    const out = relatedReviews(current, [current, same, other], 3);
    expect(out[0]?.slug).toBe('same');
  });

  it('tops up with latest when nothing shares genres (never empty)', () => {
    const current = row({ slug: 'x', genres: ['Horror'] });
    const a = row({ slug: 'a', genres: ['Comedy'], publishedAt: '2026-10-05T00:00:00.000Z' });
    const b = row({ slug: 'b', genres: ['Drama'], publishedAt: '2026-10-01T00:00:00.000Z' });
    const out = relatedReviews(current, [current, a, b], 3);
    expect(out.map((r) => r.slug)).toEqual(['a', 'b']);
  });

  it('never includes the current review and respects the limit', () => {
    const current = row({ slug: 'x', genres: ['Horror'] });
    const rest = [1, 2, 3, 4].map((i) =>
      row({ slug: `f${i}`, genres: ['Horror'], publishedAt: `2026-09-0${i}T00:00:00.000Z` })
    );
    const out = relatedReviews(current, [current, ...rest], 3);
    expect(out).toHaveLength(3);
    expect(out.some((r) => r.slug === 'x')).toBe(false);
  });
});
