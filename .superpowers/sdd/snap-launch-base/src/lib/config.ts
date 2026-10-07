/**
 * Site config — merges active brand preset + env. Single import for pages.
 * SEO surfaces (titles, canonical, OG, JSON-LD, sitemap, RSS, manifest)
 * all derive from here, hence from getBrand().
 */
import { getBrand, getBrandFromSettings, type BrandPreset } from './branding/resolve';
import { effective, type SettingKey } from './settings';

export interface SiteConfig {
  brand: BrandPreset;
  siteUrl: string;
  siteName: string;
  defaultRegion: string;
}

function envVal(key: string, fallback = ''): string {
  try {
    // @ts-expect-error Astro/Vite runtime
    const v = import.meta?.env?.[key] as string | undefined;
    if (v) return v;
  } catch { /* noop */ }
  if (typeof process !== 'undefined' && process.env[key]) return process.env[key]!;
  return fallback;
}

export function getConfig(cfEnv?: Record<string, string | undefined>): SiteConfig {
  // Sync path: env fallback only (build / static). Dashboard values apply
  // via getConfigFromSettings() wherever a DB reader is available.
  const brand = getBrand(cfEnv);
  const siteUrl = (
    cfEnv?.SITE_URL ??
    envVal('SITE_URL', `https://${brand.domain}`)
  ).replace(/\/$/, '');
  const siteName = cfEnv?.SITE_NAME ?? envVal('SITE_NAME', brand.siteName);
  const defaultRegion =
    cfEnv?.DEFAULT_REGION ?? envVal('DEFAULT_REGION', brand.defaultRegion);
  return { brand, siteUrl, siteName, defaultRegion };
}

/**
 * Dashboard-aware path: DB values win, env is first-boot fallback.
 * `read` is typically `(k) => getSetting(db, k)`.
 */
export async function getConfigFromSettings(
  read: (key: string) => Promise<string | null>,
  cfEnv?: Record<string, string | undefined>,
): Promise<SiteConfig> {
  const brand = await getBrandFromSettings(read, cfEnv);
  const pick = async (key: SettingKey, fallback: string): Promise<string> => {
    let db: string | null = null;
    try { db = await read(key); } catch { /* fall through */ }
    const v = effective(key, db);
    return v.trim() !== '' ? v : fallback;
  };
  const siteUrl = (await pick('site.url', `https://${brand.domain}`)).replace(/\/$/, '');
  const siteName = await pick('site.name', brand.siteName);
  const defaultRegion = await pick('region.default', brand.defaultRegion);
  return { brand, siteUrl, siteName, defaultRegion };
}
