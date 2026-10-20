/**
 * Per-site homepage copy — H1-adjacent meta + section heads/deks.
 *
 * Source: dashboard settings (`homepage.*` keys, per-server file/DB),
 * falling back to the coded defaults below. The coded defaults are the same
 * strings that used to be hardcoded in src/pages/index.astro, composed with
 * the site's brand name (see below) — a site with no overrides still renders
 * the same words it always did, only brand-first (fallback-first: a missing
 * or invalid value can never white-screen or reword the homepage by
 * accident).
 *
 * The two meta strings are BRAND-LEADING: the brand name comes first so a
 * brand query ("extramovies") reads the site's own title out loud. The brand
 * is resolved per site (data/settings.json → dashboard reader → env seed →
 * brand preset), never hardcoded — extramovies.org and cinemavilla.in each
 * get their own name from the same coded fallback.
 *
 * H1 itself is content-driven (featured review title via SITE_ID-filtered
 * loaders); this module owns the surrounding words only.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  effectiveOverride,
  getEffective,
  settingDefault,
  type SettingKey,
  type SettingsReader,
} from './settings';
import { getSiteBrand } from './seo/brand';
import { META_DESC_MAX, truncateAtWord } from './seo/meta';

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

/**
 * Coded defaults (must stay in sync with settings.ts DEFAULTS).
 *
 * `brandName` prefixes the two meta strings (brand-leading shape). An empty
 * or missing brand name yields the bare descriptor — never an empty title and
 * never a leading separator.
 */
export function homepageDefaults(brandName = ''): HomepageCopy {
  const out = {} as HomepageCopy;
  for (const key of HOMEPAGE_KEYS) {
    out[KEY_TO_FIELD[key]] = settingDefault(key as SettingKey);
  }
  out.metaTitle = brandLeadingTitle(out.metaTitle, brandName);
  out.metaDescription = brandLeadingDescription(out.metaDescription, brandName);
  return out;
}

/**
 * Brand-leading title: "<Brand> | <descriptor>".
 * Falls back to the bare descriptor when the brand name is missing.
 */
export function brandLeadingTitle(descriptor: string, brandName: string): string {
  const brand = (brandName ?? '').trim();
  const desc = (descriptor ?? '').trim();
  if (!brand) return desc;
  if (!desc) return brand;
  return `${brand} | ${desc}`;
}

/**
 * Brand-leading description: "<Brand>: <description>".
 * Falls back to the bare description when the brand name is missing, and is
 * capped at the meta-description limit (160) either way.
 */
export function brandLeadingDescription(description: string, brandName: string): string {
  const brand = (brandName ?? '').trim();
  const body = (description ?? '').trim();
  if (!brand) return truncateAtWord(body, META_DESC_MAX);
  if (!body) return brand;
  // Lower-case the body's first letter so it reads as a tagline after the
  // brand ("Extramovies: honest movie reviews …").
  const tail = body.charAt(0).toLowerCase() + body.slice(1);
  return truncateAtWord(`${brand}: ${tail}`, META_DESC_MAX);
}

/**
 * Brand name for the fallback strings. Same source path as getSiteBrand
 * (data/settings.json → injected reader → env seed → brand preset), so the
 * fallback always names the site the visitor is on. Never throws.
 */
export async function homepageBrandName(read: SettingsReader): Promise<string> {
  // 1. data/settings.json — the file the settings API owns.
  try {
    const fromFile = readSettingsFile()['site.name']?.trim();
    if (fromFile) return fromFile;
  } catch {
    /* fall through */
  }
  // 2. the dashboard reader (SQLite/D1 store).
  try {
    const fromReader = await read('site.name');
    if (typeof fromReader === 'string' && fromReader.trim() !== '') return fromReader.trim();
  } catch {
    /* fall through */
  }
  // 3. the env seed (SITE_NAME).
  try {
    const fromEnv = (await getEffective('site.name', async () => null)).trim();
    if (fromEnv) return fromEnv;
  } catch {
    /* fall through */
  }
  // 4. the brand preset's own site name — never empty in practice.
  try {
    const brand = await getSiteBrand(read);
    return (brand.name ?? '').trim();
  } catch {
    return '';
  }
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
  const brandName = await homepageBrandName(read);
  const out = homepageDefaults(brandName);
  for (const key of HOMEPAGE_KEYS) {
    try {
      const f = fileVals[key]?.trim();
      if (f) {
        out[KEY_TO_FIELD[key]] = f;
        continue;
      }
      // Only a REAL per-site override replaces the coded fallback: the
      // dashboard value or the env seed. The coded default itself must not
      // overwrite the brand-leading fallback composed above.
      const v = effectiveOverride(key as SettingKey, await read(key));
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
