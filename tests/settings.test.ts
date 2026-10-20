import { describe, it, expect } from 'vitest';
import {
  effective,
  effectiveOverride,
  effectiveWithoutDb,
  maskSecret,
  resolveAll,
  validateSettingsPayload,
} from '../src/lib/settings';

describe('settings: DB wins, env seeds, defaults last', () => {
  it('db value beats env/default', () => {
    expect(effective('region.default', 'DE')).toBe('DE');
  });

  it('empty db falls back to env/default', () => {
    const v = effective('region.default', '');
    expect(typeof v).toBe('string');
    expect(v.length).toBeGreaterThan(0);
  });

  it('effectiveWithoutDb never throws and returns string', () => {
    for (const k of ['tmdb.api_key', 'openrouter.model', 'brand.preset', 'region.default'] as const) {
      expect(typeof effectiveWithoutDb(k)).toBe('string');
    }
  });

  it('resolveAll covers every key', () => {
    const all = resolveAll({ 'region.default': 'FR' });
    expect(all['region.default']).toBe('FR');
    expect(all['brand.preset'].length).toBeGreaterThan(0);
  });

  it('effectiveOverride keeps the db value and drops the coded default', () => {
    expect(effectiveOverride('region.default', 'DE')).toBe('DE');
    // A coded default is NOT an override — the caller keeps its own fallback.
    expect(effectiveOverride('homepage.meta_title', '')).toBe('');
    expect(effectiveOverride('homepage.meta_title', null)).toBe('');
    expect(effectiveOverride('homepage.meta_title', undefined)).toBe('');
  });
});

describe('settings: secrets are masked, never echoed', () => {
  it('empty stays empty', () => {
    expect(maskSecret('')).toBe('');
  });

  it('short secrets fully hidden', () => {
    expect(maskSecret('abc')).not.toContain('abc');
  });

  it('long secrets keep only last 4', () => {
    const masked = maskSecret('sk-or-1234567890abcdef');
    expect(masked).toContain('cdef');
    expect(masked).not.toContain('sk-or-1234');
  });
});

describe('settings: dashboard payload validation', () => {
  it('rejects unknown keys', () => {
    expect(validateSettingsPayload({ 'nope.key': 'x' })).toMatch(/unknown setting/);
  });

  it('rejects bad region and url', () => {
    expect(validateSettingsPayload({ 'region.default': 'USA' })).toMatch(/2-letter/);
    expect(validateSettingsPayload({ 'site.url': 'not-a-url' })).toMatch(/full URL/);
  });

  it('rejects invalid taste JSON', () => {
    expect(validateSettingsPayload({ 'taste.profile': '{bad' })).toMatch(/valid JSON/);
  });

  it('accepts partial valid payload', () => {
    expect(validateSettingsPayload({ 'site.name': 'The Long Take' })).toBeNull();
    expect(validateSettingsPayload({})).toBeNull();
  });
});
