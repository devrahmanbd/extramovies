import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  brandLeadingDescription,
  brandLeadingTitle,
  getHomepageCopy,
  homepageDefaults,
} from '../src/lib/homepage';
import { getSiteBrand } from '../src/lib/seo/brand';
import { buildSeoTitle } from '../src/lib/seo/meta';
import { validateSettingsPayload } from '../src/lib/settings';

/** Brand name the loader resolves when a site has no site.name override. */
async function presetBrandName(): Promise<string> {
  const brand = await getSiteBrand(async () => null);
  return brand.name.trim();
}

describe('homepage copy: coded defaults are byte-identical to legacy hardcoded strings', () => {
  it('matches the strings previously hardcoded in index.astro', () => {
    const d = homepageDefaults();
    expect(d.metaTitle).toBe('Movie reviews: honest, personal film criticism');
    expect(d.metaDescription).toBe(
      'Honest movie reviews and slow, personal film criticism — every review argued from a real viewing, newest first.',
    );
    expect(d.metaExtra).toBe('New reviews weekly. No hype without evidence, no spoilers without warning.');
    expect(d.latestHeading).toBe('Latest reviews');
    expect(d.latestDek).toBe('New writing, in the order it was published. No algorithm, no filler.');
    expect(d.shelfHeading).toBe('My ratings — the current shelf');
    expect(d.shelfDek).toBe('The highest-scored films in the journal right now.');
    expect(d.genreHeading).toBe('Browse by genre');
  });
});

describe('homepage copy: the fallback is brand-leading', () => {
  it('leads with the brand name, then the descriptor', () => {
    const d = homepageDefaults('Extramovies');
    expect(d.metaTitle).toBe('Extramovies | Movie reviews: honest, personal film criticism');
    expect(d.metaTitle.startsWith('Extramovies')).toBe(true);
    expect(d.metaTitle.length).toBeLessThanOrEqual(60);
    expect(d.metaDescription.startsWith('Extramovies: ')).toBe(true);
    expect(d.metaDescription.length).toBeLessThanOrEqual(160);
  });

  it('works for any brand (brand-agnostic across brands)', () => {
    const a = homepageDefaults('Extramovies');
    const b = homepageDefaults('CinemaVilla');
    expect(b.metaTitle.startsWith('CinemaVilla')).toBe(true);
    expect(b.metaDescription.startsWith('CinemaVilla: ')).toBe(true);
    // Same shape, different brand — no site voice leaks into the code.
    expect(a.metaTitle.replace('Extramovies', '')).toBe(b.metaTitle.replace('CinemaVilla', ''));
    expect(a.metaDescription.replace('Extramovies', '')).toBe(
      b.metaDescription.replace('CinemaVilla', ''),
    );
  });

  it('a missing brand name still yields a usable title', () => {
    const d = homepageDefaults('');
    expect(d.metaTitle).toBe('Movie reviews: honest, personal film criticism');
    expect(d.metaTitle.length).toBeGreaterThan(0);
    expect(d.metaTitle.startsWith('|')).toBe(false);
    expect(d.metaTitle.startsWith(':')).toBe(false);
    expect(d.metaDescription.startsWith(':')).toBe(false);
    expect(d.metaDescription.length).toBeGreaterThan(0);
    // An empty descriptor must not swallow the brand either.
    expect(brandLeadingTitle('', 'Extramovies')).toBe('Extramovies');
    expect(brandLeadingDescription('', 'Extramovies')).toBe('Extramovies');
    expect(brandLeadingTitle('Movie reviews', '')).toBe('Movie reviews');
    expect(brandLeadingDescription('Honest reviews', '')).toBe('Honest reviews');
  });

  it('the composed page title never repeats the brand', async () => {
    const brand = await presetBrandName();
    const copy = homepageDefaults(brand);
    const title = buildSeoTitle(copy.metaTitle, brand);
    expect(title.startsWith(brand)).toBe(true);
    expect(title).not.toContain(`${brand} | ${brand}`);
    expect(title.length).toBeLessThanOrEqual(60);
  });
});

describe('homepage copy: per-site resolution with fallback', () => {
  it('returns defaults when the store is empty', async () => {
    const brand = await presetBrandName();
    const copy = await getHomepageCopy(async () => null);
    expect(copy).toEqual(homepageDefaults(brand));
  });

  it('the resolved fallback leads with the brand name', async () => {
    const brand = await presetBrandName();
    const copy = await getHomepageCopy(async () => null);
    expect(copy.metaTitle.startsWith(brand)).toBe(true);
    expect(copy.metaDescription.startsWith(brand)).toBe(true);
  });

  it('overrides win per key; blanks fall back', async () => {
    const brand = await presetBrandName();
    const copy = await getHomepageCopy(async (k: string) =>
      k === 'homepage.latest_heading' ? 'Fresh this week' : k === 'homepage.shelf_dek' ? '   ' : null,
    );
    expect(copy.latestHeading).toBe('Fresh this week');
    expect(copy.shelfDek).toBe(homepageDefaults(brand).shelfDek);
    expect(copy.metaTitle).toBe(homepageDefaults(brand).metaTitle);
  });

  it('a per-site meta override still wins over the brand fallback', async () => {
    const copy = await getHomepageCopy(async (k: string) =>
      k === 'homepage.meta_title' ? 'What to watch tonight' : null,
    );
    expect(copy.metaTitle).toBe('What to watch tonight');
  });

  it('fail-soft: a throwing reader still yields defaults', async () => {
    const brand = await presetBrandName();
    const copy = await getHomepageCopy(async () => {
      throw new Error('db down');
    });
    expect(copy).toEqual(homepageDefaults(brand));
  });

  it('prefers data/settings.json over the injected reader (brand parity)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'homepage-copy-'));
    const file = path.join(dir, 'settings.json');
    await fs.writeFile(file, JSON.stringify({ 'homepage.meta_title': 'File Title' }), 'utf8');
    const saved = process.env.SETTINGS_FILE_PATH;
    process.env.SETTINGS_FILE_PATH = file;
    try {
      const copy = await getHomepageCopy(async () => 'Reader Title');
      expect(copy.metaTitle).toBe('File Title');
    } finally {
      if (saved === undefined) delete process.env.SETTINGS_FILE_PATH;
      else process.env.SETTINGS_FILE_PATH = saved;
    }
  });

  it('a site.name in data/settings.json brands the fallback', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'homepage-copy-'));
    const file = path.join(dir, 'settings.json');
    await fs.writeFile(file, JSON.stringify({ 'site.name': 'Cinema Villa' }), 'utf8');
    const saved = process.env.SETTINGS_FILE_PATH;
    process.env.SETTINGS_FILE_PATH = file;
    try {
      const copy = await getHomepageCopy(async () => null);
      expect(copy.metaTitle.startsWith('Cinema Villa')).toBe(true);
      expect(copy.metaDescription.startsWith('Cinema Villa: ')).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.SETTINGS_FILE_PATH;
      else process.env.SETTINGS_FILE_PATH = saved;
    }
  });
});

describe('homepage copy: validation caps', () => {  it('rejects overlong homepage values', () => {
    expect(validateSettingsPayload({ 'homepage.meta_title': 'x'.repeat(81) })).toMatch(/too long/);
    expect(validateSettingsPayload({ 'homepage.meta_description': 'x'.repeat(201) })).toMatch(/too long/);
    expect(validateSettingsPayload({ 'homepage.genre_heading': 'x'.repeat(81) })).toMatch(/too long/);
  });

  it('accepts in-cap homepage values', () => {
    expect(
      validateSettingsPayload({
        'homepage.meta_title': 'Extramovies: what to watch tonight',
        'homepage.latest_heading': 'Fresh reviews',
      }),
    ).toBeNull();
  });
});
