import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getHomepageCopy, homepageDefaults } from '../src/lib/homepage';
import { validateSettingsPayload } from '../src/lib/settings';

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

describe('homepage copy: per-site resolution with fallback', () => {
  it('returns defaults when the store is empty', async () => {
    const copy = await getHomepageCopy(async () => null);
    expect(copy).toEqual(homepageDefaults());
  });

  it('overrides win per key; blanks fall back', async () => {
    const copy = await getHomepageCopy(async (k: string) =>
      k === 'homepage.latest_heading' ? 'Fresh this week' : k === 'homepage.shelf_dek' ? '   ' : null,
    );
    expect(copy.latestHeading).toBe('Fresh this week');
    expect(copy.shelfDek).toBe(homepageDefaults().shelfDek);
    expect(copy.metaTitle).toBe(homepageDefaults().metaTitle);
  });

  it('fail-soft: a throwing reader still yields defaults', async () => {
    const copy = await getHomepageCopy(async () => {
      throw new Error('db down');
    });
    expect(copy).toEqual(homepageDefaults());
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
