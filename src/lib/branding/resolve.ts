/**
 * Brand resolution — single entry point for multi-site cloning.
 *
 * Clone this repo per domain, drop a JSON preset in
 * `src/branding/presets/<id>.json`, set BRAND_PRESET=<id>.
 * Every public surface (pages, SEO, JSON-LD, sitemap, RSS, manifest)
 * MUST call getBrand() — never hardcode siteName/domain/colors.
 *
 * Runtime override: `settings` table key `brand.preset` wins over env.
 */
import noirCinema from '../../branding/presets/noir-cinema.json';
import goldenHour from '../../branding/presets/golden-hour.json';
import midnightFestival from '../../branding/presets/midnight-festival.json';
import reelMagazine from '../../branding/presets/reel-magazine.json';

export type BrandLayout = 'journal' | 'magazine';

export interface BrandColors {
  paper: string;
  paper2: string;
  ink: string;
  inkSoft: string;
  accent: string;
  accent2: string;
  line: string;
  focus: string;
}

export interface BrandFonts {
  display: string;
  body: string;
  mono: string;
  displayUrl?: string;
}

export interface BrandPreset {
  id: string;
  /** Page layout family: journal (default editorial) or magazine (cover + grid). */
  layout?: BrandLayout;
  siteName: string;
  tagline: string;
  domain: string;
  defaultRegion: string;
  logo: string;
  icon: string;
  favicon: string;
  colors: BrandColors;
  fonts: BrandFonts;
  social: Record<string, string | boolean | undefined>;
  seo: { defaultOgImage: string; twitterCard: string; themeColor: string };
}

const PRESETS: Record<string, BrandPreset> = {
  'noir-cinema': noirCinema as BrandPreset,
  'golden-hour': goldenHour as BrandPreset,
  'midnight-festival': midnightFestival as BrandPreset,
  'reel-magazine': reelMagazine as BrandPreset,
};

/** Layout family for a preset; older presets without the field default to journal. */
export function brandLayout(brand: BrandPreset): BrandLayout {
  return brand.layout === 'magazine' ? 'magazine' : 'journal';
}

export function listPresets(): BrandPreset[] {
  return Object.values(PRESETS);
}

function presetFromEnv(env?: Record<string, string | undefined>): string {
  // Astro: import.meta.env.BRAND_PRESET (client-safe via public prefix not needed —
  // brand is public). Cloudflare: env.BRAND_PRESET. Node: process.env.
  try {
    // @ts-expect-error — import.meta available in Astro/Vite runtime
    const viteVal = typeof import.meta !== 'undefined' ? import.meta.env?.BRAND_PRESET : undefined;
    if (typeof viteVal === 'string' && viteVal) return viteVal;
  } catch { /* non-Vite runtime */ }
  return (
    env?.BRAND_PRESET ??
    (typeof process !== 'undefined' ? process.env.BRAND_PRESET : undefined) ??
    'noir-cinema'
  );
}

/** Sync resolution (build, static pages, manifest). */
export function getBrand(env?: Record<string, string | undefined>): BrandPreset {
  const id = presetFromEnv(env);
  return PRESETS[id] ?? PRESETS['noir-cinema']!;
}

/** Async resolution honoring `settings.brand.preset` DB override. */
export async function getBrandFromSettings(
  getSetting: (key: string) => Promise<string | null>,
  env?: Record<string, string | undefined>
): Promise<BrandPreset> {
  try {
    const override = await getSetting('brand.preset');
    if (override && PRESETS[override]) return PRESETS[override]!;
  } catch { /* DB unavailable at build — fall through to env */ }
  return getBrand(env);
}

/** Emit CSS custom properties from a preset (used by Base layout). */
export function brandCssVars(brand: BrandPreset): string {
  const c = brand.colors;
  return [
    `--color-paper:${c.paper};`,
    `--color-paper-2:${c.paper2};`,
    `--color-ink:${c.ink};`,
    `--color-ink-soft:${c.inkSoft};`,
    `--color-accent:${c.accent};`,
    `--color-accent-2:${c.accent2};`,
    `--color-line:${c.line};`,
    `--color-focus:${c.focus};`,
    `--font-display:${brand.fonts.display};`,
    `--font-body:${brand.fonts.body};`,
    `--font-mono:${brand.fonts.mono};`
  ].join('');
}
