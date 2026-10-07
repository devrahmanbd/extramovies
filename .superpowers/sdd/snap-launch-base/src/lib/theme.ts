/**
 * Two-theme core — DEPLOY-TIME choice, one deployment = one theme.
 *
 *   'discovery'   = movie discovery + streaming guide
 *   'publication' = personal review magazine (default)
 *
 * The choice is permanent for an install: /setup writes `site.theme` once
 * and never overwrites it. There is no theme switcher.
 *
 * Resolution order everywhere: DB value -> env SITE_THEME -> default.
 * NOTE: BRAND-era vars are NOT read here — SITE_THEME only.
 */

export type SiteTheme = 'discovery' | 'publication';

/** Settings-table key that persists the wizard's theme choice. */
export const THEME_KEY = 'site.theme';

/** Env var that seeds the theme (deploy-time choice). SITE_THEME only. */
export const THEME_ENV_VAR = 'SITE_THEME';

export function themeDefault(): SiteTheme {
  return 'publication';
}

/** Narrow an unknown value to a valid theme. Trims whitespace. */
export function isValidTheme(value: unknown): value is SiteTheme {
  const v = typeof value === 'string' ? value.trim() : '';
  return v === 'discovery' || v === 'publication';
}

/** Raw SITE_THEME value from an explicit env record, Vite, or Node. */
function envSiteThemeRaw(env?: Record<string, string | undefined>): string | undefined {
  if (env?.[THEME_ENV_VAR] !== undefined) return env[THEME_ENV_VAR];
  try {
    // @ts-expect-error — import.meta available in Astro/Vite runtime
    const viteVal = typeof import.meta !== 'undefined' ? import.meta.env?.[THEME_ENV_VAR] : undefined;
    if (typeof viteVal === 'string' && viteVal) return viteVal;
  } catch {
    /* non-Vite runtime */
  }
  if (typeof process !== 'undefined' && process.env[THEME_ENV_VAR]) {
    return process.env[THEME_ENV_VAR];
  }
  return undefined;
}

/**
 * Theme from the environment. Valid SITE_THEME ('discovery'|'publication')
 * wins, anything else (missing, empty, typo) falls back to the default.
 */
export function themeFromEnv(env?: Record<string, string | undefined>): SiteTheme {
  const raw = envSiteThemeRaw(env) ?? '';
  return isValidTheme(raw) ? raw.trim() as SiteTheme : themeDefault();
}

/**
 * Effective theme: dbValue if valid, else env, else default.
 * Invalid/empty DB values never stick — they fall through to env.
 */
export function resolveTheme(
  dbValue: string | null | undefined,
  env?: Record<string, string | undefined>,
): SiteTheme {
  if (isValidTheme(dbValue)) return (dbValue as string).trim() as SiteTheme;
  return themeFromEnv(env);
}

export type ThemeReader = (key: string) => Promise<string | null>;

/** Async resolution honoring the `site.theme` settings-table override. */
export async function getTheme(
  read: ThemeReader,
  env?: Record<string, string | undefined>,
): Promise<SiteTheme> {
  let dbValue: string | null = null;
  try {
    dbValue = await read(THEME_KEY);
  } catch {
    /* DB unavailable — fall through to env/default */
  }
  return resolveTheme(dbValue, env);
}

export function isDiscovery(theme: SiteTheme): boolean {
  return theme === 'discovery';
}

/**
 * First-run guard: true ONLY while nothing has locked a theme yet —
 * i.e. no valid DB value AND no valid SITE_THEME env.
 *
 * The wizard (and its API) must refuse to write `site.theme` whenever
 * this returns false — an existing value is never overwritten.
 *
 * The second argument accepts either an env record or a bare theme-ish
 * string (e.g. the already-resolved env value) for unit-test convenience.
 */
export function canConfigure(
  dbTheme: string | null | undefined,
  envOrTheme?: Record<string, string | undefined> | string | null,
): boolean {
  if (isValidTheme(dbTheme)) return false;
  const raw =
    typeof envOrTheme === 'string'
      ? envOrTheme
      : (envSiteThemeRaw(envOrTheme) ?? '');
  if (isValidTheme(raw)) return false;
  return true;
}
