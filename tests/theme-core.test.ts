import { describe, it, expect } from 'vitest';
import {
  canConfigure,
  getTheme,
  isDiscovery,
  resolveTheme,
  themeDefault,
  themeFromEnv,
} from '../src/lib/theme';
import {
  SETTING_KEYS,
  effective,
  effectiveWithoutDb,
  validateSettingsPayload,
} from '../src/lib/settings';

const NO_ENV: Record<string, string | undefined> = {};

describe('theme core: defaults and env', () => {
  it('default is publication', () => {
    expect(themeDefault()).toBe('publication');
  });

  it('themeFromEnv accepts discovery and publication', () => {
    expect(themeFromEnv({ SITE_THEME: 'discovery' })).toBe('discovery');
    expect(themeFromEnv({ SITE_THEME: 'publication' })).toBe('publication');
  });

  it('themeFromEnv falls back on missing/empty/invalid', () => {
    expect(themeFromEnv(NO_ENV)).toBe('publication');
    expect(themeFromEnv({ SITE_THEME: '' })).toBe('publication');
    expect(themeFromEnv({ SITE_THEME: 'magazine' })).toBe('publication');
    expect(themeFromEnv({ SITE_THEME: 'DISCOVERY' })).toBe('publication');
  });

  it('themeFromEnv reads SITE_THEME only (no BRAND-era vars)', () => {
    expect(themeFromEnv({ BRAND_PRESET: 'discovery' } as never)).toBe('publication');
  });

  it('isDiscovery narrows correctly', () => {
    expect(isDiscovery('discovery')).toBe(true);
    expect(isDiscovery('publication')).toBe(false);
  });
});

describe('theme core: resolveTheme precedence db > env > default', () => {
  it('db wins over env', () => {
    expect(resolveTheme('discovery', { SITE_THEME: 'publication' })).toBe('discovery');
    expect(resolveTheme('publication', { SITE_THEME: 'discovery' })).toBe('publication');
  });

  it('empty db falls through to env', () => {
    expect(resolveTheme('', { SITE_THEME: 'discovery' })).toBe('discovery');
    expect(resolveTheme(null, { SITE_THEME: 'discovery' })).toBe('discovery');
    expect(resolveTheme(undefined, { SITE_THEME: 'discovery' })).toBe('discovery');
  });

  it('invalid values fall back (db typo -> env, bad env -> default)', () => {
    expect(resolveTheme('magazine', { SITE_THEME: 'discovery' })).toBe('discovery');
    expect(resolveTheme('magazine', { SITE_THEME: 'nope' })).toBe('publication');
    expect(resolveTheme('', NO_ENV)).toBe('publication');
    expect(resolveTheme(null, NO_ENV)).toBe('publication');
  });

  it('trims whitespace before validating', () => {
    expect(resolveTheme('  discovery  ', NO_ENV)).toBe('discovery');
    expect(resolveTheme('', { SITE_THEME: '  publication ' })).toBe('publication');
  });
});

describe('theme core: getTheme reads settings key site.theme', () => {
  it('returns the stored theme', async () => {
    await expect(getTheme(async () => 'discovery', NO_ENV)).resolves.toBe('discovery');
  });

  it('falls back to env then default', async () => {
    await expect(getTheme(async () => null, { SITE_THEME: 'discovery' })).resolves.toBe('discovery');
    await expect(getTheme(async () => null, NO_ENV)).resolves.toBe('publication');
    await expect(getTheme(async () => '', NO_ENV)).resolves.toBe('publication');
  });

  it('survives a throwing reader', async () => {
    const failing = async () => {
      throw new Error('db down');
    };
    await expect(getTheme(failing, { SITE_THEME: 'discovery' })).resolves.toBe('discovery');
    await expect(getTheme(failing, NO_ENV)).resolves.toBe('publication');
  });
});

describe('theme core: canConfigure guard (wizard never overwrites)', () => {
  it('true only while nothing locked a theme', () => {
    expect(canConfigure(null, NO_ENV)).toBe(true);
    expect(canConfigure('', NO_ENV)).toBe(true);
    expect(canConfigure('  ', NO_ENV)).toBe(true);
  });

  it('false once a db theme exists', () => {
    expect(canConfigure('discovery', NO_ENV)).toBe(false);
    expect(canConfigure('publication', NO_ENV)).toBe(false);
    expect(canConfigure('publication', { SITE_THEME: 'discovery' })).toBe(false);
  });

  it('false when env alone locks the theme', () => {
    expect(canConfigure(null, { SITE_THEME: 'discovery' })).toBe(false);
    expect(canConfigure('', { SITE_THEME: 'publication' })).toBe(false);
  });

  it('accepts a bare env-theme string', () => {
    expect(canConfigure('', 'discovery')).toBe(false);
    expect(canConfigure('', '')).toBe(true);
    expect(canConfigure('', null)).toBe(true);
  });

  it('invalid db values do not count as configured', () => {
    expect(canConfigure('magazine', NO_ENV)).toBe(true);
  });
});

describe('theme core: settings wiring for site.theme', () => {
  it('site.theme is a known key seeded by SITE_THEME with publication default', () => {
    expect((SETTING_KEYS as readonly string[])).toContain('site.theme');
    expect(effectiveWithoutDb('site.theme')).toBe('publication');
    expect(effective('site.theme', 'discovery')).toBe('discovery');
  });

  it('validateSettingsPayload accepts discovery/publication/empty, rejects others', () => {
    expect(validateSettingsPayload({ 'site.theme': 'discovery' })).toBeNull();
    expect(validateSettingsPayload({ 'site.theme': 'publication' })).toBeNull();
    expect(validateSettingsPayload({ 'site.theme': '' })).toBeNull();
    expect(validateSettingsPayload({ 'site.theme': 'magazine' })).toMatch(/site\.theme/);
    expect(validateSettingsPayload({ 'site.theme': 'DISCOVERY' })).toMatch(/site\.theme/);
  });
});
