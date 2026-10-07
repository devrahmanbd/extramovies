/**
 * Brand accessor — every public page reads getBrand().
 * No page or component may hardcode a publication name, logo,
 * domain, font, or color. All brand surface flows through here.
 *
 * Single source of truth: src/lib/branding/resolve.ts (branding owner)
 * + src/branding/presets/*.json. This module is a thin read-only adapter
 * that maps the active BrandPreset to the shape public templates need.
 * It defines no brand data of its own.
 */
import { getBrand as resolveBrand } from "../branding/resolve";
import type { BrandPreset } from "../branding/resolve";

export interface BrandFonts {
  display: string;
  body: string;
  fontUrl: string | null;
}

export interface BrandColors {
  accent: string;
  accentInk: string;
  gold: string;
}

export interface Brand {
  name: string;
  tagline: string;
  domain: string;
  origin: string;
  logo: string | null;
  icon: string;
  fonts: BrandFonts;
  colors: BrandColors;
  locale: string;
  description: string;
  defaultOgImage: string | null;
  themeColor: string;
}

export function adaptPreset(p: BrandPreset): Brand {
  const origin = `https://${p.domain}`;
  // Schema.org + Open Graph require absolute URLs — presets store root paths.
  const absolute = (u: string | null | undefined): string | null =>
    !u ? null : /^https?:\/\//.test(u) ? u : `${origin}${u.startsWith("/") ? u : `/${u}`}`;
  return {
    name: p.siteName,
    tagline: p.tagline,
    domain: p.domain,
    origin,
    logo: absolute(p.logo),
    icon: p.favicon ?? p.icon,
    fonts: {
      display: p.fonts.display,
      body: p.fonts.body,
      fontUrl: p.fonts.displayUrl ?? null,
    },
    colors: {
      accent: p.colors.accent,
      accentInk: "oklch(98% 0.005 95)",
      gold: p.colors.accent2,
    },
    locale: "en_US",
    description: p.tagline,
    defaultOgImage: absolute(p.seo.defaultOgImage),
    themeColor: p.seo.themeColor,
  };
}

export interface BrandOverrides extends Partial<Omit<Brand, "fonts" | "colors">> {
  fonts?: Partial<BrandFonts>;
  colors?: Partial<BrandColors>;
}

/** Active brand for this build/request (env BRAND_PRESET or settings override upstream). */
export function getBrand(overrides: BrandOverrides = {}): Brand {
  const base = adaptPreset(resolveBrand());
  return {
    ...base,
    ...overrides,
    fonts: { ...base.fonts, ...overrides.fonts },
    colors: { ...base.colors, ...overrides.colors },
    origin: (overrides.origin ?? base.origin).replace(/\/$/, ""),
  };
}
