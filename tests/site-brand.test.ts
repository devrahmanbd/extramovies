import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getSiteBrand } from '../src/lib/seo/brand';

function fakeRead(store: Record<string, string> = {}) {
  return async (key: string): Promise<string | null> => store[key] ?? null;
}

const ENV = { BRAND_PRESET: 'noir-cinema' };

let dir = "";
let savedFilePath: string | undefined;

beforeEach(async () => {
  savedFilePath = process.env.SETTINGS_FILE_PATH;
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "site-brand-"));
  // Isolate from the developer's real data/settings.json.
  process.env.SETTINGS_FILE_PATH = path.join(dir, "settings.json");
  await fs.writeFile(process.env.SETTINGS_FILE_PATH, "{}", "utf8");
});

afterEach(async () => {
  if (savedFilePath === undefined) delete process.env.SETTINGS_FILE_PATH;
  else process.env.SETTINGS_FILE_PATH = savedFilePath;
  await fs.rm(dir, { recursive: true, force: true });
});

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

  it('dashboard logo stays root-relative (resolves per requesting domain)', async () => {
    const brand = await getSiteBrand(fakeRead({ 'brand.logo': '/uploads/logo.svg' }), ENV);
    expect(brand.logo).toBe('/uploads/logo.svg');
  });

  it('bare dashboard logo path gains a leading slash, stays relative', async () => {
    const brand = await getSiteBrand(fakeRead({ 'brand.logo': 'uploads/logo.svg' }), ENV);
    expect(brand.logo).toBe('/uploads/logo.svg');
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

  it('settings file (what /admin writes) wins over the injected read', async () => {
    await fs.writeFile(
      process.env.SETTINGS_FILE_PATH as string,
      JSON.stringify({ "site.name": "File Brand", "brand.logo": "/file/logo.svg" }),
      "utf8"
    );
    const brand = await getSiteBrand(
      fakeRead({ "site.name": "Read Brand", "brand.logo": "/read/logo.svg" }),
      ENV
    );
    expect(brand.name).toBe("File Brand");
    expect(brand.logo).toBe("/file/logo.svg");
  });

  it('preset logo is root-relative (no hardcoded host leak across brands)', async () => {
    const brand = await getSiteBrand(fakeRead(), ENV);
    expect(brand.logo).toMatch(/^\//);
    expect(brand.logo).not.toContain('extramovies.org');
  });
});
