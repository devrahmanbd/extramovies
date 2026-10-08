import { describe, expect, it } from 'vitest';
import { getSiteBrand } from '../src/lib/seo/brand';

function fakeRead(store: Record<string, string> = {}) {
  return async (key: string): Promise<string | null> => store[key] ?? null;
}

const ENV = { BRAND_PRESET: 'noir-cinema' };

describe('getSiteBrand', () => {
  it('preset switch changes colors/logo vs default', async () => {
    const def = await getSiteBrand(fakeRead(), ENV);
    const golden = await getSiteBrand(fakeRead({ 'brand.preset': 'golden-hour' }), ENV);
    expect(golden.colors.accent).not.toBe(def.colors.accent);
    expect(golden.logo).not.toBe(def.logo);
  });

  it('site.name override changes name only', async () => {
    const def = await getSiteBrand(fakeRead(), ENV);
    const renamed = await getSiteBrand(fakeRead({ 'site.name': '  My Site ' }), ENV);
    expect(renamed.name).toBe('My Site');
    expect(renamed.colors).toEqual(def.colors);
    expect(renamed.fonts).toEqual(def.fonts);
  });

  it('relative brand.logo is absolutized against origin', async () => {
    const brand = await getSiteBrand(fakeRead({ 'brand.logo': '/custom/logo.svg' }), ENV);
    expect(brand.logo).toBe(`${brand.origin}/custom/logo.svg`);
  });

  it('absolute brand.logo URL passes through', async () => {
    const url = 'https://cdn.example.com/l.svg';
    const brand = await getSiteBrand(fakeRead({ 'brand.logo': url }), ENV);
    expect(brand.logo).toBe(url);
  });

  it('empty read falls back to defaults', async () => {
    const brand = await getSiteBrand(fakeRead(), ENV);
    expect(brand.name).toBeTruthy();
    expect(brand.logo).toBeTruthy();
    expect(brand.origin).toMatch(/^https:\/\//);
  });

  it('throwing read never throws, falls back to defaults', async () => {
    const throwing = async (_key: string): Promise<string | null> => {
      throw new Error('db down');
    };
    const brand = await getSiteBrand(throwing, ENV);
    expect(brand.name).toBeTruthy();
    expect(brand.logo).toBeTruthy();
  });
});
