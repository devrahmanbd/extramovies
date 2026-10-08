import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

// Hermetic theme env (mirrors tests/theme-core.test.ts): ambient SITE_THEME must not leak.
const savedSiteTheme = process.env.SITE_THEME;
beforeEach(() => {
  delete process.env.SITE_THEME;
  vi_unstubDb();
});
afterAll(() => {
  if (savedSiteTheme !== undefined) process.env.SITE_THEME = savedSiteTheme;
  else delete process.env.SITE_THEME;
});

// Keep getSetting() returning null so currentTheme() falls through to env
// (same db > env > default precedence the theme-core tests pin down).
function vi_unstubDb() {
  delete process.env.SETTINGS_FILE_PATH;
}

describe('pub (A): /movies redirects to /reviews only under publication', () => {
  it('movies index guards a permanent redirect behind the publication theme', () => {
    const src = read('src/pages/movies/index.astro');
    expect(src).toContain('currentTheme()');
    expect(src).toMatch(/theme === ["']publication["']/);
    expect(src).toMatch(/Astro\.redirect\(["']\/reviews["'],\s*301\)/);
  });

  it('discovery rendering untouched (filters + tiles still render)', () => {
    const src = read('src/pages/movies/index.astro');
    expect(src).toContain('discoverMovies');
    expect(src).toContain('searchMovies');
    expect(src).toContain('getListTiles');
    expect(src).toContain('Browse movies');
  });
});

describe('pub (A): sitemap gates the /movies hub per theme', () => {
  it('sitemap resolves theme via currentTheme (never throws) and keeps detail entries', () => {
    const src = read('src/pages/sitemap.xml.ts');
    expect(src).toContain('currentTheme()');
    expect(src).toMatch(/theme === ["']publication["']/);
    // Detail /movies/[id] entries stay in both themes.
    expect(src).toContain('/movies/${');
  });

  it('publication omits the /movies hub entry', async () => {
    const { GET } = await import('../src/pages/sitemap.xml');
    const res = (await GET({ url: new URL('https://example.com/sitemap.xml') } as never)) as Response;
    const xml = await res.text();
    expect(xml).toContain('https://example.com/reviews');
    expect(xml).not.toContain('<loc>https://example.com/movies</loc>');
  });

  it('discovery keeps the /movies hub entry', async () => {
    process.env.SITE_THEME = 'discovery';
    const { GET } = await import('../src/pages/sitemap.xml');
    const res = (await GET({ url: new URL('https://example.com/sitemap.xml') } as never)) as Response;
    const xml = await res.text();
    expect(xml).toContain('<loc>https://example.com/movies</loc>');
    delete process.env.SITE_THEME;
  });
});
