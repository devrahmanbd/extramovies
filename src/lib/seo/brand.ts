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
import fs from "node:fs";
import path from "node:path";
import { getBrand as resolveBrand, listPresets } from "../branding/resolve";
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
  favicon: string;
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
    favicon: p.favicon ?? p.icon,
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

/**
 * Dashboard-aware brand: preset switch + site.name + brand.logo overrides.
 * Powers every public surface so /admin brand edits actually take effect.
 *
 * `brand.favicon` (dashboard upload) wins over the preset favicon so
 * uploaded favicons go live without a rebuild.
 *
 * Source priority (single source of truth FIRST): data/settings.json — the
 * file /api/admin/settings reads and writes — then the injected `read`
 * (legacy SQLite store / D1-style backends), then env seeds, then preset
 * defaults. Never throws — degrades to getBrand() when nothing resolves.
 */
export async function getSiteBrand(
  read: (key: string) => Promise<string | null>,
  env?: Record<string, string | undefined>,
): Promise<Brand> {
  try {
    const fileVals = readSettingsFile();
    const val = async (key: string): Promise<string | null> => {
      const f = fileVals[key]?.trim();
      if (f) return f;
      try {
        const d = await read(key);
        if (d !== null && d !== undefined && d.trim() !== "") return d.trim();
      } catch {
        /* fall through to env/defaults */
      }
      return null;
    };
    const [presetId, siteName, logo, favicon] = await Promise.all([
      val("brand.preset"),
      val("site.name"),
      val("brand.logo"),
      val("brand.favicon"),
    ]);
    const preset = resolvePreset(presetId, env);
    const base = adaptPreset(preset);
    const overrides: BrandOverrides = {};
    if (siteName !== null && siteName !== "") overrides.name = siteName;
    if (logo !== null && logo !== "") {
      overrides.logo = /^https?:\/\//.test(logo)
        ? logo
        : `${base.origin}${logo.startsWith("/") ? logo : `/${logo}`}`;
    }
    if (favicon !== null && favicon !== "") {
      const abs = /^https?:\/\//.test(favicon)
        ? favicon
        : `${base.origin}${favicon.startsWith("/") ? favicon : `/${favicon}`}`;
      overrides.favicon = abs;
      overrides.icon = abs;
    }
    return {
      ...base,
      ...overrides,
      fonts: base.fonts,
      colors: base.colors,
      origin: base.origin,
    };
  } catch {
    return getBrand();
  }
}

/** Resolve a preset id (settings file → env BRAND_PRESET → noir-cinema). */
function resolvePreset(
  presetId: string | null,
  env?: Record<string, string | undefined>,
): BrandPreset {
  const all = listPresets();
  if (presetId) {
    const hit = all.find((p) => p.id === presetId);
    if (hit) return hit;
  }
  const envId =
    env?.BRAND_PRESET ??
    (typeof process !== "undefined" ? process.env.BRAND_PRESET : undefined);
  if (envId) {
    const hit = all.find((p) => p.id === envId);
    if (hit) return hit;
  }
  return all.find((p) => p.id === "noir-cinema") ?? all[0]!;
}

/** Read data/settings.json (the file /api/admin/settings owns). Never throws. */
function readSettingsFile(): Record<string, string> {
  try {
    const file =
      (typeof process !== "undefined" ? process.env.SETTINGS_FILE_PATH : undefined) ??
      path.join(process.cwd(), "data", "settings.json");
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "string") out[k] = v;
      }
      return out;
    }
  } catch {
    /* missing/unreadable → fallbacks */
  }
  return {};
}
