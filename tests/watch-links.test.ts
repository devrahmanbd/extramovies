import { describe, it, expect } from 'vitest';
import {
  normalizeCustomLink,
  normalizeCustomWatch,
  hasCustomWatch,
  initialOf,
  MAX_LINKS_PER_KIND,
} from '../src/lib/watch-links';
import { listPresets, brandLayout } from '../src/lib/branding/resolve';

describe('custom watch links: validation', () => {
  it('accepts a good link', () => {
    expect(normalizeCustomLink({ label: 'Archive Stream', url: 'https://example.com/watch' }, 'free'))
      .toEqual({ label: 'Archive Stream', url: 'https://example.com/watch', kind: 'free' });
  });

  it('rejects javascript:, relative, and empty urls', () => {
    expect(normalizeCustomLink({ label: 'X', url: 'javascript:alert(1)' }, 'free')).toBeNull();
    expect(normalizeCustomLink({ label: 'X', url: '/watch' }, 'free')).toBeNull();
    expect(normalizeCustomLink({ label: 'X', url: '' }, 'paid')).toBeNull();
    expect(normalizeCustomLink({ label: '', url: 'https://example.com' }, 'paid')).toBeNull();
    expect(normalizeCustomLink(null, 'free')).toBeNull();
  });

  it('normalizes whole payload: dedupes, caps, drops junk', () => {
    const out = normalizeCustomWatch({
      free: [
        { label: 'A', url: 'https://a.example.com' },
        { label: 'A', url: 'https://a.example.com' },
        { label: 'Bad', url: 'not-a-url' },
      ],
      paid: 'not-an-array',
      unknown: [],
    });
    expect(out.free).toHaveLength(1);
    expect(out.paid).toEqual([]);
  });

  it('caps links per kind', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ label: `S${i}`, url: `https://s${i}.example.com` }));
    expect(normalizeCustomWatch({ free: many, paid: [] }).free).toHaveLength(MAX_LINKS_PER_KIND);
  });

  it('hasCustomWatch detects presence', () => {
    expect(hasCustomWatch(null)).toBe(false);
    expect(hasCustomWatch({ free: [], paid: [] })).toBe(false);
    expect(hasCustomWatch({ free: [{ label: 'A', url: 'https://a.example.com', kind: 'free' }], paid: [] })).toBe(true);
  });

  it('initialOf handles edge labels', () => {
    expect(initialOf('netflix')).toBe('N');
    expect(initialOf('')).toBe('•');
  });
});

describe('brand presets: magazine layout', () => {
  it('ships a magazine preset alongside journal presets', () => {
    const ids = listPresets().map((p) => p.id);
    expect(ids).toContain('reel-magazine');
    expect(ids).toContain('noir-cinema');
  });

  it('layout resolves with journal default for legacy presets', () => {
    const presets = Object.fromEntries(listPresets().map((p) => [p.id, p]));
    expect(brandLayout(presets['reel-magazine']!)).toBe('magazine');
    expect(brandLayout(presets['noir-cinema']!)).toBe('journal');
  });
});
