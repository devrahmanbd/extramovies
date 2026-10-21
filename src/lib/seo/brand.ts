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
  /**
   * The brand's PINNED alternate names (aliases) — the per-site override of
   * `BRAND_ALTERNATE_NAMES`. Undefined means "derive from the brand's own
   * name and origin" (the default every brand gets).
   */
  alternateNames?: string[];
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

/**
 * The brand's alternate names — the other spellings of this site a reader or
 * a crawler may use ("extramovies", "extramovies.org").
 *
 * ONE documented constant, next to the other site-name values (name,
 * origin), so a second brand overrides it in a single place instead of
 * editing code. Resolution — the same per-site pattern `site.name` uses:
 *
 *   1. the PINNED list on the brand: the dashboard setting
 *      `site.alternate_name` (comma separated; env seed
 *      `SITE_ALTERNATE_NAME` on first boot);
 *   2. otherwise the default DERIVED from the brand's OWN name and origin.
 *
 * Step 2 is why nothing here hardcodes a domain: the second brand lives on
 * another host (cinemavilla.in) and must resolve to its own aliases
 * ("cinemavilla", "cinemavilla.in") — a hardcoded "extramovies.org" would
 * be a false claim on that site.
 *
 * Why the list exists: Google derives the SERP site name from the homepage
 * title, the headings, the WebSite structured data and og:site_name.
 * `alternateName` offers it the alternatives when its automated system does
 * not pick the brand name on its own.
 */
export const BRAND_ALTERNATE_NAMES = (
  brand: Pick<Brand, "name" | "origin" | "alternateNames">,
): string[] => {
  const pinned = (brand.alternateNames ?? []).map((s) => s.trim()).filter(Boolean);
  if (pinned.length > 0) return unique(pinned);
  const name = (brand.name ?? "").trim().toLowerCase();
  const host = hostOf(brand.origin);
  return unique([name, host].filter(Boolean));
};

/** Keep the order, drop the duplicates and the blanks. */
function unique(values: string[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** The host of an origin ("https://extramovies.org" -> "extramovies.org"). */
function hostOf(origin: string | undefined | null): string {
  const raw = (origin ?? "").trim();
  if (!raw) return "";
  try {
    // hostname, not host: a dev port ("localhost:4321") is not part of a name.
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return raw
      .toLowerCase()
      .replace(/^[a-z]+:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/:\d+$/, "");
  }
}

/** Split a comma/newline separated alias list into clean entries. */
export function parseAlternateNames(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return unique(
    raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function adaptPreset(p: BrandPreset): Brand {
  const origin = `https://${p.domain}`;
  return {
    name: p.siteName,
    tagline: p.tagline,
    domain: p.domain,
    origin,
    // Asset paths stay root-relative on purpose: every preset hardcodes one
    // domain, so absolutizing here would point brand B at brand A's host
    // (logo 404s for per-site uploads that exist only on B's disk). Relative
    // URLs resolve against the requesting domain; emission points that need
    // absolute URLs (og:image, JSON-LD) prefix the request origin instead.
    logo: asRootPath(p.logo),
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
    defaultOgImage: asRootPath(p.seo.defaultOgImage),
    themeColor: p.seo.themeColor,
  };
}

/**
 * Normalize a brand asset path: absolute http(s) URLs pass through,
 * root paths stay as-is, bare paths gain a leading slash. Never prefixes a
 * preset domain (see adaptPreset).
 */
export function asRootPath(u: string | null | undefined): string | null {
  if (!u) return null;
  const t = u.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return t.startsWith("/") ? t : `/${t}`;
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
    const [presetId, siteName, logo, favicon, alternateNames] = await Promise.all([
      val("brand.preset"),
      val("site.name"),
      val("brand.logo"),
      val("brand.favicon"),
      val("site.alternate_name"),
    ]);
    const preset = resolvePreset(presetId, env);
    const base = adaptPreset(preset);
    const overrides: BrandOverrides = {};
    if (siteName !== null && siteName !== "") overrides.name = siteName;
    // The pinned alias list (dashboard setting, env seed on first boot).
    // Empty = the derived default (brand name + this site's own host).
    const pinned = parseAlternateNames(
      alternateNames ?? envSeed("SITE_ALTERNATE_NAME", env),
    );
    if (pinned.length > 0) overrides.alternateNames = pinned;
    // Dashboard uploads are stored as root paths (/uploads/…) and must stay
    // root-relative so they resolve on THIS domain (see adaptPreset).
    if (logo !== null && logo !== "") {
      const rel = asRootPath(logo);
      if (rel) overrides.logo = rel;
    }
    if (favicon !== null && favicon !== "") {
      const rel = asRootPath(favicon);
      if (rel) {
        overrides.favicon = rel;
        overrides.icon = rel;
      }
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

/** Env seed for a setting (first boot / CI), same pattern as the env seed. */
function envSeed(
  name: string,
  env?: Record<string, string | undefined>,
): string | undefined {
  const fromEnv = env?.[name];
  if (typeof fromEnv === "string" && fromEnv.trim() !== "") return fromEnv;
  if (typeof process !== "undefined") {
    const v = process.env[name];
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return undefined;
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
