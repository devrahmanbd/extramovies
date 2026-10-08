import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

// Hermetic theme env (mirrors tests/theme-core.test.ts): ambient SITE_THEME must not leak.
const savedSiteTheme = process.env.SITE_THEME;
beforeEach(() => {
  delete process.env.SITE_THEME;
});
afterAll(() => {
  if (savedSiteTheme !== undefined) process.env.SITE_THEME = savedSiteTheme;
  else delete process.env.SITE_THEME;
});

/** Mirror of the frontmatter scope logic in src/pages/search.astro. */
function resolveSearchScope(theme: string, activeType: string) {
  const isPublication = theme !== 'discovery';
  const showMovies = !isPublication && (activeType === 'all' || activeType === 'movie');
  const showSeries = !isPublication && (activeType === 'all' || activeType === 'series');
  const showReviews = isPublication ? true : activeType === 'all' || activeType === 'review';
  return { isPublication, showMovies, showSeries, showReviews };
}

describe('pub (B): /search resolves theme via currentTheme (never throws)', () => {
  it('imports currentTheme and defaults to publication with a try/catch fallback', () => {
    const src = read('src/pages/search.astro');
    expect(src).toContain('currentTheme()');
    expect(src).toMatch(/let theme.*=.*["']publication["']/);
    expect(src).toContain('try');
    expect(src).toContain('catch');
  });

  it('theme resolution never throws (publication fallback)', async () => {
    const { currentTheme } = await import('../src/lib/tmdb/discover');
    const t = await currentTheme();
    expect(['discovery', 'publication']).toContain(t);
  });
});

describe('pub (B): publication renders reviews-only', () => {
  it('gates movie/series sections behind the discovery theme', () => {
    const src = read('src/pages/search.astro');
    expect(src).toMatch(/showMovies.*!isPublication|!isPublication.*showMovies|theme !== ["']discovery["']/);
    expect(src).toMatch(/showSeries.*!isPublication|!isPublication.*showSeries/);
  });

  it('forces reviews on under publication regardless of ?type=', () => {
    const src = read('src/pages/search.astro');
    expect(src).toMatch(/isPublication \? true|isPublication\?true/);
    for (const t of ['all', 'movie', 'series', 'review']) {
      const s = resolveSearchScope('publication', t);
      expect(s.showReviews).toBe(true);
      expect(s.showMovies).toBe(false);
      expect(s.showSeries).toBe(false);
    }
  });

  it('hides movie/series filter chips under publication', () => {
    const src = read('src/pages/search.astro');
    expect(src).toContain('d-search-filters');
    expect(src).toMatch(/!isPublication/);
  });

  it('counts reflect reviews only under publication', () => {
    const src = read('src/pages/search.astro');
    expect(src).toContain('role="status"');
    expect(src).toMatch(/results\.length.*review/);
  });
});

describe('pub (B): discovery rendering unchanged', () => {
  it('keeps Movies/Series/Reviews sections, tiles, and review cards', () => {
    const src = read('src/pages/search.astro');
    expect(src).toContain('search-movies-heading');
    expect(src).toContain('search-series-heading');
    expect(src).toContain('search-reviews-heading');
    expect(src).toContain('MovieTile');
    expect(src).toContain('ReviewCard');
    expect(src).toContain('glam-search-head');
  });

  it('keeps TMDB + review data sources', () => {
    const src = read('src/pages/search.astro');
    expect(src).toContain('searchMoviesByTitle');
    expect(src).toContain('searchShowsByTitle');
    expect(src).toContain('searchReviews');
  });

  it('discovery scope truth table (all/type filters intact)', () => {
    expect(resolveSearchScope('discovery', 'all')).toMatchObject({
      showMovies: true,
      showSeries: true,
      showReviews: true,
    });
    expect(resolveSearchScope('discovery', 'movie')).toMatchObject({
      showMovies: true,
      showSeries: false,
      showReviews: false,
    });
    expect(resolveSearchScope('discovery', 'series')).toMatchObject({
      showMovies: false,
      showSeries: true,
      showReviews: false,
    });
    expect(resolveSearchScope('discovery', 'review')).toMatchObject({
      showMovies: false,
      showSeries: false,
      showReviews: true,
    });
  });
});
