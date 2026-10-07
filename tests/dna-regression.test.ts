import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import {
  normalizeCustomLink,
  normalizeCustomWatch,
  MAX_LINKS_PER_KIND,
} from '../src/lib/watch-links';
import { listPresets, brandLayout } from '../src/lib/branding/resolve';

describe('dna regression: every brand preset resolves a layout via brandLayout', () => {
  it('resolves journal|magazine for all shipped presets', async () => {
    const presets = listPresets();
    expect(presets.length).toBeGreaterThan(0);
    for (const p of presets) {
      expect(['journal', 'magazine']).toContain(brandLayout(p));
    }
  });

  it('magazine preset stays magazine, legacy journal presets default to journal', async () => {
    const byId = Object.fromEntries(listPresets().map((p) => [p.id, p]));
    expect(byId['reel-magazine']).toBeTruthy();
    expect(brandLayout(byId['reel-magazine']!)).toBe('magazine');
    for (const id of ['noir-cinema', 'golden-hour', 'midnight-festival']) {
      expect(byId[id]).toBeTruthy();
      expect(brandLayout(byId[id]!)).toBe('journal');
    }
  });

  it('legacy preset without layout field defaults to journal', async () => {
    const presets = Object.fromEntries(listPresets().map((p) => [p.id, p]));
    const legacy = { ...presets['noir-cinema']! };
    delete (legacy as { layout?: unknown }).layout;
    expect(brandLayout(legacy)).toBe('journal');
  });
});

describe('dna regression: design.md contract', () => {
  it('exists and contains Provenance + Tokens + stream-support rules', async () => {
    const raw = await fs.readFile(new URL('../design.md', import.meta.url), 'utf8');
    expect(raw).toContain('## Provenance');
    expect(raw).toContain('## Tokens');
    expect(raw).toContain('## Stream support');
    // Tokens source of truth.
    expect(raw).toContain('tokens.css');
    // Stream-support product rules (not just paint).
    expect(raw).toContain('watch-providers');
    expect(raw).toContain('Free sites');
    expect(raw).toContain('Paid watch');
    expect(raw).toContain('nofollow');
  });
});

describe('dna regression: customWatch normalize keeps manual-link guarantees', () => {
  it('https-only: accepts https, rejects javascript:/relative/empty', async () => {
    expect(
      normalizeCustomLink({ label: 'Archive Stream', url: 'https://example.com/watch' }, 'free'),
    ).toMatchObject({ label: 'Archive Stream', kind: 'free' });
    expect(normalizeCustomLink({ label: 'X', url: 'javascript:alert(1)' }, 'free')).toBeNull();
    expect(normalizeCustomLink({ label: 'X', url: '/watch' }, 'free')).toBeNull();
    expect(normalizeCustomLink({ label: 'X', url: '' }, 'paid')).toBeNull();
    expect(normalizeCustomLink({ label: '', url: 'https://example.com' }, 'paid')).toBeNull();
    expect(normalizeCustomLink(null, 'free')).toBeNull();
  });

  it('dedupes identical label+url pairs', async () => {
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

  it('caps links per kind at MAX_LINKS_PER_KIND', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      label: `S${i}`,
      url: `https://s${i}.example.com`,
    }));
    const out = normalizeCustomWatch({ free: many, paid: [] });
    expect(out.free).toHaveLength(MAX_LINKS_PER_KIND);
  });
});
