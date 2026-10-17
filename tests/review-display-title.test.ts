import { describe, expect, it } from 'vitest';
import { reviewDisplayTitle } from '../src/lib/seo/content';

describe('reviewDisplayTitle', () => {
  it('keeps the "{Movie} (Year) review:" prefix for demo-style titles', () => {
    expect(reviewDisplayTitle('The Batman', 'The Batman Finds the Detective in the Costume', '2022')).toBe(
      'The Batman (2022) review: The Batman Finds the Detective in the Costume',
    );
    expect(reviewDisplayTitle('Joker', 'Joker Is Craft in Search of a Reason')).toBe(
      'Joker review: Joker Is Craft in Search of a Reason',
    );
  });

  it('skips the prefix when the title already carries its own review lead', () => {
    expect(reviewDisplayTitle('Jailer 2', 'Jailer 2 Review: Rajini and Nelson Deliver the Mass Sequel Fans Paid For', '2026')).toBe(
      'Jailer 2 Review: Rajini and Nelson Deliver the Mass Sequel Fans Paid For',
    );
    expect(reviewDisplayTitle('Matchbox the Movie', 'Matchbox the Movie Review: Great Stunts, Thin Script, Blatant Toy Sale')).toBe(
      'Matchbox the Movie Review: Great Stunts, Thin Script, Blatant Toy Sale',
    );
  });

  it('falls back safely on missing pieces', () => {
    expect(reviewDisplayTitle('', 'Some Title')).toBe('Some Title');
    expect(reviewDisplayTitle('Movie', '')).toBe('');
    expect(reviewDisplayTitle('Movie', 'A Review-Led Title')).toBe('A Review-Led Title');
  });
});
