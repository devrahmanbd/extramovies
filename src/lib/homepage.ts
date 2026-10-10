/**
 * Per-site homepage copy — H1-adjacent meta + section heads/deks.
 *
 * Source: dashboard settings (`homepage.*` keys, per-server file/DB),
 * falling back to the coded defaults below. Those defaults are byte-identical
 * to the strings previously hardcoded in src/pages/index.astro, so a site
 * with no overrides renders exactly as before (fallback-first: a missing or
 * invalid value can never white-screen or reword the homepage by accident).
 *
 * H1 itself is content-driven (featured review title via SITE_ID-filtered
 * loaders); this module owns the surrounding words only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getEffective, settingDefault, type SettingKey, type SettingsReader } from './settings';

export const HOMEPAGE_KEYS = [
  'homepage.meta_title',
  'homepage.meta_description',
  'homepage.meta_extra',
  'homepage.latest_heading',
  'homepage.latest_dek',
  'homepage.shelf_heading',
  'homepage.shelf_dek',
  'homepage.genre_heading',
] as const;

export type HomepageKey = (typeof HOMEPAGE_KEYS)[number];

export interface HomepageCopy {
  metaTitle: string;
  metaDescription: string;
  metaExtra: string;
  latestHeading: string;
  latestDek: string;
  shelfHeading: string;
  shelfDek: string;
  genreHeading: string;
}

const KEY_TO_FIELD: Record<HomepageKey, keyof HomepageCopy> = {
  'homepage.meta_title': 'metaTitle',
  'homepage.meta_description': 'metaDescription',
  'homepage.meta_extra': 'metaExtra',
  'homepage.latest_heading': 'latestHeading',
  'homepage.latest_dek': 'latestDek',
  'homepage.shelf_heading': 'shelfHeading',
  'homepage.shelf_dek': 'shelfDek',
  'homepage.genre_heading': 'genreHeading',
};

/** Coded defaults (must stay in sync with settings.ts DEFAULTS). */
export function homepageDefaults(): HomepageCopy {
  const out = {} as HomepageCopy;
  for (const key of HOMEPAGE_KEYS) {
    out[KEY_TO_FIELD[key]] = settingDefault(key as SettingKey);
  }
  return out;
}

/**
 * Resolve effective homepage copy. Never throws: any read failure yields
 * the coded defaults for that key (fail-soft, today's rendering preserved).
 *
 * Source priority mirrors getSiteBrand: data/settings.json (the file the
 * settings API owns) first, then the injected reader (SQLite/D1 store),
 * then env seed, then coded default.
 */
export async function getHomepageCopy(read: SettingsReader): Promise<HomepageCopy> {
  const fileVals = readSettingsFile();
  const out = homepageDefaults();
  for (const key of HOMEPAGE_KEYS) {
    try {
      const f = fileVals[key]?.trim();
      if (f) {
        out[KEY_TO_FIELD[key]] = f;
        continue;
      }
      const v = await getEffective(key as SettingKey, read);
      if (typeof v === 'string' && v.trim() !== '') out[KEY_TO_FIELD[key]] = v;
    } catch {
      /* keep default for this key */
    }
  }
  return out;
}

/** Read data/settings.json (the file /api/admin/settings owns). Never throws. */
function readSettingsFile(): Record<string, string> {
  try {
    const file =
      (typeof process !== 'undefined' ? process.env.SETTINGS_FILE_PATH : undefined) ??
      path.join(process.cwd(), 'data', 'settings.json');
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'string') out[k] = v;
      }
      return out;
    }
  } catch {
    /* missing/unreadable → fallbacks */
  }
  return {};
}
