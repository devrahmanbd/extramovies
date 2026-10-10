/**
 * Central settings service — single source of truth for everything
 * that used to live in .env, now editable in /admin/settings.
 *
 * .env keeps ONLY system bootstrap (auth + db + runtime):
 *   ADMIN_EMAIL, ADMIN_PASSWORD, DB_FILE, SESSION_SECRET
 *
 * Everything else lives in the `settings` table:
 *   tmdb.api_key, omdb.api_key,
 *   openrouter.api_key, openrouter.model, openrouter.cheap_model, openrouter.base_url,
 *   site.url, site.name, site.theme, brand.preset, region.default,
 *   seo.title_suffix, seo.author, seo.desc_template, taste.profile
 *
 * Resolution order per key: DB value -> env fallback (first-boot seed / CI) -> builtin default.
 * Env fallback keeps old deploys working; dashboard is authoritative after first save.
 */

export const SETTING_KEYS = [
  'tmdb.api_key',
  'omdb.api_key',
  'openrouter.api_key',
  'openrouter.model',
  'openrouter.cheap_model',
  'openrouter.base_url',
  'site.url',
  'site.name',
  'site.theme',
  'brand.preset',
  'brand.logo',
  'brand.favicon',
  'region.default',
  'seo.title_suffix',
  'seo.author',
  'seo.desc_template',
  'taste.profile',
  'homepage.meta_title',
  'homepage.meta_description',
  'homepage.meta_extra',
  'homepage.latest_heading',
  'homepage.latest_dek',
  'homepage.shelf_heading',
  'homepage.shelf_dek',
  'homepage.genre_heading',
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

/** Env var that seeds each key on first boot (backward compat). Empty = no env seed. */
const ENV_SEED: Record<SettingKey, string> = {
  'tmdb.api_key': 'TMDB_API_KEY',
  'omdb.api_key': 'OMDB_API_KEY',
  'openrouter.api_key': 'OPENROUTER_API_KEY',
  'openrouter.model': 'OPENROUTER_MODEL',
  'openrouter.cheap_model': 'OPENROUTER_CHEAP_MODEL',
  'openrouter.base_url': 'OPENROUTER_BASE_URL',
  'site.url': 'SITE_URL',
  'site.name': 'SITE_NAME',
  'site.theme': 'SITE_THEME',
  'brand.preset': 'BRAND_PRESET',
  'brand.logo': 'BRAND_LOGO',
  'brand.favicon': 'BRAND_FAVICON',
  'region.default': 'DEFAULT_REGION',
  'seo.title_suffix': 'SEO_TITLE_SUFFIX',
  'seo.author': 'SEO_AUTHOR',
  'seo.desc_template': '',
  'taste.profile': '',
  'homepage.meta_title': '',
  'homepage.meta_description': '',
  'homepage.meta_extra': '',
  'homepage.latest_heading': '',
  'homepage.latest_dek': '',
  'homepage.shelf_heading': '',
  'homepage.shelf_dek': '',
  'homepage.genre_heading': '',
};

const DEFAULTS: Record<SettingKey, string> = {
  'tmdb.api_key': '',
  'omdb.api_key': '',
  'openrouter.api_key': '',
  'openrouter.model': 'thinkingmachines/inkling:free',
  'openrouter.cheap_model': 'nvidia/nemotron-3.5-lightning:free',
  'openrouter.base_url': 'https://openrouter.ai/api/v1',
  'site.url': '',
  'site.name': '',
  'site.theme': 'publication',
  'brand.preset': 'noir-cinema',
  'brand.logo': '',
  'brand.favicon': '',
  'region.default': 'US',
  'seo.title_suffix': '— Extramovies',
  'seo.author': '',
  'seo.desc_template': '{title} ({year}) review: verdict, performances, and where to watch.',
  'taste.profile': '',
  'homepage.meta_title': 'Movie reviews: honest, personal film criticism',
  'homepage.meta_description':
    'Honest movie reviews and slow, personal film criticism — every review argued from a real viewing, newest first.',
  'homepage.meta_extra': 'New reviews weekly. No hype without evidence, no spoilers without warning.',
  'homepage.latest_heading': 'Latest reviews',
  'homepage.latest_dek': 'New writing, in the order it was published. No algorithm, no filler.',
  'homepage.shelf_heading': 'My ratings — the current shelf',
  'homepage.shelf_dek': 'The highest-scored films in the journal right now.',
  'homepage.genre_heading': 'Browse by genre',
};

/** Keys treated as secrets — never returned in full by the admin GET API. */
export const SECRET_KEYS: SettingKey[] = ['tmdb.api_key', 'omdb.api_key', 'openrouter.api_key'];

export function settingDefault(key: SettingKey): string {
  return DEFAULTS[key] ?? '';
}

function envVal(name: string): string {
  if (!name) return '';
  try {
    // @ts-expect-error Astro/Vite runtime
    const v = import.meta?.env?.[name] as string | undefined;
    if (v) return v;
  } catch { /* noop */ }
  if (typeof process !== 'undefined' && process.env[name]) return process.env[name]!;
  return '';
}

/** Effective value without DB (build / static / tests): env seed -> default. */
export function effectiveWithoutDb(key: SettingKey): string {
  const seed = ENV_SEED[key];
  if (seed) {
    const v = envVal(seed).trim();
    if (v) return v;
  }
  return settingDefault(key);
}

/**
 * Effective value with DB: dbValue (if non-empty) -> env seed -> default.
 * Callers pass the DB value they loaded via getSetting(); this function
 * is pure so it stays testable without a database driver.
 */
export function effective(key: SettingKey, dbValue: string | null | undefined): string {
  if (typeof dbValue === 'string' && dbValue.trim() !== '') return dbValue;
  return effectiveWithoutDb(key);
}

/** Bulk-resolve a map of DB values (e.g. from getAllSettings) to effective values. */
export function resolveAll(dbValues: Record<string, string>): Record<SettingKey, string> {
  const out = {} as Record<SettingKey, string>;
  for (const key of SETTING_KEYS) out[key] = effective(key, dbValues[key]);
  return out;
}

export type SettingsReader = (key: string) => Promise<string | null>;
export type SettingsWriter = (key: string, value: string) => Promise<void>;

export async function getEffective(key: SettingKey, read: SettingsReader): Promise<string> {
  let dbValue: string | null = null;
  try {
    dbValue = await read(key);
  } catch { /* DB unavailable — fall through to env */ }
  return effective(key, dbValue);
}

/** Mask a secret for dashboard display: keep last 4 chars, e.g. "••••abcd". Empty stays empty. */
export function maskSecret(value: string): string {
  const v = (value ?? '').trim();
  if (!v) return '';
  if (v.length <= 8) return '••••••••';
  return `••••••••${v.slice(-4)}`;
}

/** Validate a settings payload from the dashboard before persisting. Returns error or null. */
export function validateSettingsPayload(input: Record<string, unknown>): string | null {
  for (const [k, v] of Object.entries(input)) {
    if (!(SETTING_KEYS as readonly string[]).includes(k)) return `unknown setting: ${k}`;
    if (typeof v !== 'string') return `${k} must be a string`;
    if (v.length > 20000) return `${k} is too long (max 20000 chars)`;
  }
  const region = input['region.default'];
  if (typeof region === 'string' && region.trim() !== '' && !/^[A-Za-z]{2}$/.test(region.trim())) {
    return 'region.default must be a 2-letter country code (e.g. US)';
  }
  const url = input['site.url'];
  if (typeof url === 'string' && url.trim() !== '' && !/^https?:\/\/.+\..+/.test(url.trim())) {
    return 'site.url must be a full URL (https://…)';
  }
  const taste = input['taste.profile'];
  if (typeof taste === 'string' && taste.trim() !== '') {
    try {
      JSON.parse(taste);
    } catch {
      return 'taste.profile must be valid JSON';
    }
  }
  const theme = input['site.theme'];
  if (
    typeof theme === 'string' &&
    theme.trim() !== '' &&
    theme.trim() !== 'discovery' &&
    theme.trim() !== 'publication'
  ) {
    return "site.theme must be 'discovery' or 'publication'";
  }
  // Homepage copy: per-site words (H1-adjacent meta + section heads are SEO
  // events — keep them tight; loader falls back to coded defaults on empty).
  const homepageCaps: Record<string, number> = {
    'homepage.meta_title': 80,
    'homepage.meta_description': 200,
    'homepage.meta_extra': 200,
    'homepage.latest_heading': 80,
    'homepage.latest_dek': 200,
    'homepage.shelf_heading': 80,
    'homepage.shelf_dek': 200,
    'homepage.genre_heading': 80,
  };
  for (const [k, max] of Object.entries(homepageCaps)) {
    const v = input[k];
    if (typeof v === 'string' && v.length > max) return `${k} is too long (max ${max} chars)`;
  }
  return null;
}
