/**
 * SEO meta helpers — single source of truth for titles, descriptions,
 * canonicals, and social tags. All cutoffs per seo-audit/seo-optimizer:
 * seo title 50–60ch, meta description 150–160ch.
 */
import type { Brand } from "./brand";

export const SEO_TITLE_MIN = 50;
export const SEO_TITLE_MAX = 60;
export const META_DESC_MIN = 150;
export const META_DESC_MAX = 160;

function truncateAtWord(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Build an SEO title targeting 50–60 chars: "Page headline | Brand".
 * Falls back to brand name alone when no page title is given.
 */
export function buildSeoTitle(pageTitle: string, brandName: string): string {
  const clean = pageTitle.replace(/\s+/g, " ").trim();
  if (!clean) return brandName;
  const full = `${clean} | ${brandName}`;
  if (full.length >= SEO_TITLE_MIN && full.length <= SEO_TITLE_MAX) return full;
  if (full.length < SEO_TITLE_MIN) return full;
  // Too long: shorten the page part, keep the brand.
  const budget = SEO_TITLE_MAX - brandName.length - 3;
  return `${truncateAtWord(clean, Math.max(budget, 20))} | ${brandName}`;
}

/** Build a meta description targeting 150–160 chars. */
export function buildMetaDescription(
  source: string,
  fallback: string,
  extra?: string
): string {
  const clean = source.replace(/\s+/g, " ").trim();
  let base = clean.length >= 40 ? clean : `${clean} ${fallback}`.trim();
  if (base.length < META_DESC_MIN && extra) {
    base = `${base} ${extra.replace(/\s+/g, " ").trim()}`.trim();
  }
  if (base.length <= META_DESC_MAX) return base;
  return truncateAtWord(base, META_DESC_MAX);
}

/** Absolute canonical URL: origin + clean path (no query/hash, one trailing rule). */
export function canonicalFor(origin: string, path: string): string {
  const cleanPath = path.split(/[?#]/)[0] || "/";
  const normalized = cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;
  return `${origin.replace(/\/$/, "")}${normalized === "/" ? "/" : normalized.replace(/\/$/, "")}`;
}

/**
 * Canonical site origin. Behind a reverse proxy (OLS → Node) the request
 * host is localhost, which would poison canonicals/sitemap/OG URLs — so an
 * explicit SITE_URL env wins whenever set. Falls back to the request origin
 * (local dev, where SITE_URL is unset).
 */
export function siteOrigin(requestOrigin: string): string {
  const raw =
    typeof process !== "undefined" ? (process.env.SITE_URL ?? "").trim() : "";
  const cleaned = raw.replace(/\/+$/, "");
  if (/^https?:\/\/[^/]+$/.test(cleaned)) return cleaned;
  return requestOrigin;
}

export interface PageMeta {
  seoTitle: string;
  metaDesc: string;
  canonical: string;
}

export function buildPageMeta(args: {
  brand: Brand;
  title: string;
  descriptionSource: string;
  descriptionExtra?: string;
  path: string;
  origin?: string;
}): PageMeta {
  const origin = (args.origin ?? args.brand.origin).replace(/\/$/, "");
  return {
    seoTitle: buildSeoTitle(args.title, args.brand.name),
    metaDesc: buildMetaDescription(args.descriptionSource, args.brand.description, args.descriptionExtra),
    canonical: canonicalFor(origin, args.path),
  };
}

export function absoluteUrl(origin: string, path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return canonicalFor(origin, path);
}
