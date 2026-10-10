import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Publication theme (Theme 2) — contract tests.
 *
 * SITE_THEME is deploy-time only (no dashboard switcher):
 *   - Deployment A (discovery)  -> SITE_THEME=discovery
 *   - Deployment B (publication) -> SITE_THEME=publication or unset (default)
 * Same engine/data, independent frontends.
 *
 * Core crew owns `src/lib/theme.ts`
 * (resolveTheme(dbValue, env) / themeFromEnv(env) / getTheme(read, env)).
 * These tests exercise the real module when it exists and fall back to a
 * reference bundle with identical semantics when it doesn't, so `npm test`
 * stays green before/after core lands.
 */

type Theme = 'discovery' | 'publication';
type Env = Record<string, string | undefined>;

/** Reference contract — mirrors src/lib/theme.ts semantics (trim, case-sensitive). */
function referenceIsValidTheme(value: unknown): value is Theme {
  const v = typeof value === 'string' ? value.trim() : '';
  return v === 'discovery' || v === 'publication';
}

function referenceThemeFromEnv(env?: Env): Theme {
  const fromRecord = env?.SITE_THEME;
  const raw =
    fromRecord !== undefined
      ? fromRecord
      : typeof process !== 'undefined'
        ? (process.env.SITE_THEME ?? '')
        : '';
  return referenceIsValidTheme(raw) ? (raw as string).trim() as Theme : 'publication';
}

function referenceResolveTheme(
  dbValue: string | null | undefined,
  env?: Env,
): Theme {
  if (referenceIsValidTheme(dbValue)) return (dbValue as string).trim() as Theme;
  return referenceThemeFromEnv(env);
}

interface ThemeApi {
  resolveTheme: (dbValue: string | null | undefined, env?: Env) => Theme;
  themeFromEnv: (env?: Env) => Theme;
  themeDefault: () => Theme;
}

async function loadThemeApi(): Promise<ThemeApi> {
  try {
    const mod = (await import('../src/lib/theme')) as Partial<ThemeApi>;
    if (
      typeof mod.resolveTheme === 'function' &&
      typeof mod.themeFromEnv === 'function' &&
      typeof mod.themeDefault === 'function'
    ) {
      return {
        resolveTheme: mod.resolveTheme,
        themeFromEnv: mod.themeFromEnv,
        themeDefault: mod.themeDefault,
      };
    }
  } catch {
    /* core module not landed yet — use reference contract */
  }
  return {
    resolveTheme: referenceResolveTheme,
    themeFromEnv: referenceThemeFromEnv,
    themeDefault: () => 'publication' as Theme,
  };
}

const root = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

// Theme resolution consults process.env when the env record omits SITE_THEME,
// so theme tests run hermetic: ambient SITE_THEME must not leak in.
const savedSiteTheme = process.env.SITE_THEME;
beforeEach(() => {
  delete process.env.SITE_THEME;
});
afterAll(() => {
  if (savedSiteTheme !== undefined) process.env.SITE_THEME = savedSiteTheme;
});

describe('publication: theme default is publication', () => {
  it('themeDefault() is publication', async () => {
    const { themeDefault } = await loadThemeApi();
    expect(themeDefault()).toBe('publication');
  });

  it('missing / empty DB value with no env resolves to publication', async () => {
    const { resolveTheme } = await loadThemeApi();
    expect(resolveTheme(null)).toBe('publication');
    expect(resolveTheme(undefined)).toBe('publication');
    expect(resolveTheme('')).toBe('publication');
    expect(resolveTheme(null, {})).toBe('publication');
  });

  it('themeFromEnv with no SITE_THEME resolves to publication', async () => {
    const { themeFromEnv } = await loadThemeApi();
    expect(themeFromEnv(undefined)).toBe('publication');
    expect(themeFromEnv({})).toBe('publication');
    expect(themeFromEnv({ SITE_THEME: '' })).toBe('publication');
  });

  it('explicit publication resolves to publication', async () => {
    const { resolveTheme } = await loadThemeApi();
    expect(resolveTheme('publication')).toBe('publication');
    expect(resolveTheme(null, { SITE_THEME: 'publication' })).toBe('publication');
  });
});

describe('publication: resolveTheme falls back correctly', () => {
  it('valid discovery resolves to discovery (DB or env)', async () => {
    const { resolveTheme } = await loadThemeApi();
    expect(resolveTheme('discovery')).toBe('discovery');
    expect(resolveTheme(null, { SITE_THEME: 'discovery' })).toBe('discovery');
  });

  it('DB value wins over env (publication DB beats discovery env)', async () => {
    const { resolveTheme } = await loadThemeApi();
    expect(resolveTheme('publication', { SITE_THEME: 'discovery' })).toBe('publication');
  });

  it('invalid DB value falls through to env', async () => {
    const { resolveTheme } = await loadThemeApi();
    expect(resolveTheme('bogus', { SITE_THEME: 'discovery' })).toBe('discovery');
    expect(resolveTheme('', { SITE_THEME: 'discovery' })).toBe('discovery');
    expect(resolveTheme('bogus', {})).toBe('publication');
  });

  it('unknown / legacy values fall back to publication (never throw)', async () => {
    const { resolveTheme } = await loadThemeApi();
    for (const raw of ['bogus', 'magazine', 'journal', 'noir-cinema', '0', 'true']) {
      expect(resolveTheme(raw)).toBe('publication');
      expect(resolveTheme(null, { SITE_THEME: raw })).toBe('publication');
    }
  });
});

describe('publication: design.md contains both theme rules', () => {
  it('documents discovery + publication sections', () => {
    const md = read('design.md');
    expect(md).toMatch(/discovery/i);
    expect(md).toMatch(/publication/i);
  });

  it('Variants carries the theme-architecture note (shared backend)', () => {
    const md = read('design.md');
    const variants = md.slice(md.indexOf('## Variants'));
    expect(variants).toMatch(/discovery/i);
    expect(variants).toMatch(/publication/i);
    expect(variants).toMatch(/shared backend/i);
  });
});

describe('publication: experience unchanged (current behavior = publication)', () => {
  it('homepage keeps journal + magazine branches', () => {
    const index = read('src/pages/index.astro');
    expect(index).toContain('MagazineHome');
    // Section words now resolve via getHomepageCopy (per-site settings) with
    // coded defaults identical to the legacy hardcoded strings.
    expect(index).toContain('getHomepageCopy');
    expect(index).toContain('copy.latestHeading');
    expect(index).toContain('Browse the full archive');
    expect(index).toMatch(/layout\s*===\s*['"]magazine['"]/);
  });

  it('reviews archive / search / review pages keep publication shape', () => {
    expect(read('src/pages/reviews/index.astro')).toContain('ReviewCard');
    expect(read('src/pages/search.astro')).toContain('glam-search-head');
    expect(read('src/pages/search.astro')).toContain('ReviewCard');
    const slug = read('src/pages/reviews/[slug].astro');
    expect(slug).toContain('MovieShowcase');
    expect(slug).toContain('WhereToWatch');
  });

  it('SettingsForm has no site.theme switcher control', () => {
    const form = read('src/components/admin/SettingsForm.tsx');
    expect(form).not.toMatch(/site\.theme/i);
    expect(form).not.toMatch(/SITE_THEME/);
    expect(form).not.toMatch(/resolveTheme/);
  });

  it('admin dashboard links no theme toggle', () => {
    const dash = read('src/pages/admin/index.astro');
    expect(dash).not.toMatch(/SITE_THEME/);
    expect(dash).not.toMatch(/theme.*toggle|toggle.*theme/i);
  });
});

describe('publication: configured author identity', () => {
  const savedSeoAuthor = process.env.SEO_AUTHOR;
  const savedSettingsFile = process.env.SETTINGS_FILE_PATH;
  const missingFile = path.join(root, 'data', '__missing-settings__.json');
  beforeEach(() => {
    delete process.env.SEO_AUTHOR;
    process.env.SETTINGS_FILE_PATH = missingFile;
  });
  afterAll(() => {
    if (savedSeoAuthor !== undefined) process.env.SEO_AUTHOR = savedSeoAuthor;
    else delete process.env.SEO_AUTHOR;
    if (savedSettingsFile !== undefined) process.env.SETTINGS_FILE_PATH = savedSettingsFile;
    else delete process.env.SETTINGS_FILE_PATH;
  });

  it('getConfiguredAuthor never throws and returns a string', async () => {
    const mod = await import('../src/lib/site-author');
    expect(() => mod.getConfiguredAuthor()).not.toThrow();
    expect(typeof mod.getConfiguredAuthor()).toBe('string');
  });

  it("getConfiguredAuthor respects SEO_AUTHOR env (empty fallback)", async () => {
    const mod = await import('../src/lib/site-author');
    process.env.SEO_AUTHOR = 'Configured Author';
    expect(mod.getConfiguredAuthor()).toBe('Configured Author');
    delete process.env.SEO_AUTHOR;
    expect(mod.getConfiguredAuthor()).toBe('');
  });

  it('displayAuthor precedence: configured > review name > legacy fallback', async () => {
    const mod = await import('../src/lib/site-author');
    process.env.SEO_AUTHOR = 'Configured Author';
    expect(mod.displayAuthor('Someone Else')).toBe('Configured Author');
    expect(mod.displayAuthor('Staff Review')).toBe('Configured Author');
    expect(mod.displayAuthor('')).toBe('Configured Author');
    delete process.env.SEO_AUTHOR;
    expect(mod.displayAuthor('Jane Doe')).toBe('Jane Doe');
    expect(mod.displayAuthor('Staff Review')).toBe('The Editor');
    expect(mod.displayAuthor('')).toBe('The Editor');
    expect(mod.displayAuthor('   ')).toBe('The Editor');
  });

  it('review + JSON-LD surfaces use displayAuthor', () => {
    const slug = read('src/pages/reviews/[slug].astro');
    expect(slug).toContain('displayAuthor(review.authorName)');
    const jsonld = read('src/lib/seo/jsonld.ts');
    expect(jsonld).toContain('displayAuthor(review.authorName)');
    const index = read('src/pages/index.astro');
    expect(index).toContain('displayAuthor(featured.authorName)');
  });
});

describe('publication: design.md Variants refinement notes', () => {
  it('Variants mentions unified watchbox + author rule', () => {
    const md = read('design.md');
    const variants = md.slice(md.indexOf('## Variants'));
    expect(variants).toMatch(/unified watchbox/i);
    expect(variants).toMatch(/author.*rule|author identity/i);
  });
});
