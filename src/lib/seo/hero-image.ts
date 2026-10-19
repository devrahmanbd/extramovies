/**
 * Hero image intrinsic-size + preload helpers (CWV task 2).
 *
 * The intrinsic size has two independent sources, because the URL alone
 * cannot disambiguate a TMDB variant: w780 is used for BOTH posters and
 * backdrops in this repo (posters `w780`/`w500`, backdrops `w780`/`w1280`).
 *
 *   WIDTH  ← the URL variant  (w1280→1280, w780→780, w500→500, w300→300)
 *   HEIGHT ← the field kind    (backdrop → 16:9, poster → 2:3)
 *
 * The kind is therefore an ASPECT selector only, never the size source: a
 * caller may not widen a poster by asserting a backdrop. Each call site
 * passes the kind of the field it renders (backdrop field → "backdrop",
 * poster field → "poster").
 *
 * Rule (never guess): a variant we cannot map yields NO size pair. The caller
 * omits width/height (an unknown ratio is worse than none) and still emits the
 * preload, which is size-agnostic.
 *
 * Pure module: no DB, no network, no framework — safe to unit test.
 */

/** Which field the artwork came from — decides the aspect, not the width. */
export type HeroImageKind = "backdrop" | "poster";

export interface HeroImageSize {
  width: number;
  height: number;
}

export interface HeroImagePreload {
  href: string;
  width?: number;
  height?: number;
}

/** Attributes of the head preload link (spread onto <link> by the layout). */
export interface HeroPreloadLinkAttrs {
  rel: "preload";
  as: "image";
  href: string;
  width?: number;
  height?: number;
  fetchpriority: "high";
}

/** TMDB variant → delivered width in pixels. */
const VARIANT_WIDTHS: Record<string, number> = {
  w1280: 1280,
  w780: 780,
  w500: 500,
  w300: 300,
};

/** Aspect ratio per field kind: backdrops are 16:9, posters are 2:3. */
const KIND_ASPECTS: Record<HeroImageKind, number> = {
  backdrop: 9 / 16,
  poster: 3 / 2,
};

/**
 * Extract the TMDB image variant from a URL
 * (`https://image.tmdb.org/t/p/w1280/file.jpg` -> `w1280`).
 * Returns null for anything that is not a TMDB image path.
 */
export function heroImageVariant(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  const match = url.match(/\/t\/p\/([^/?#]+)\//i);
  const variant = match?.[1];
  return variant ? variant.toLowerCase() : null;
}

/**
 * Intrinsic size of the requested artwork, or null when the variant is
 * unknown — the caller then omits the width/height pair entirely.
 * Width comes from the URL variant; height from the kind's aspect.
 */
export function heroImageSize(
  url: string | null | undefined,
  kind: HeroImageKind,
): HeroImageSize | null {
  const variant = heroImageVariant(url);
  if (!variant) return null;
  const width = VARIANT_WIDTHS[variant];
  if (width === undefined) return null;
  return { width, height: Math.round(width * KIND_ASPECTS[kind]) };
}

/**
 * Preload descriptor for a hero image. Always carries the href (the preload
 * itself is size-agnostic); carries width/height only when the variant is
 * known, so the browser can reserve the box before the bytes land.
 */
export function heroImagePreload(
  url: string | null | undefined,
  kind: HeroImageKind,
): HeroImagePreload | null {
  if (typeof url !== "string") return null;
  const href = url.trim();
  if (!href) return null;
  const size = heroImageSize(href, kind);
  return size ? { href, width: size.width, height: size.height } : { href };
}

/**
 * Attribute bag for the head preload link. Kept here (not inline in the
 * layout) so the exact emitted attribute set is unit-testable, and so the
 * layout has a single call site that cannot be bypassed by a hardcoded link.
 */
export function heroPreloadLinkAttrs(
  preload: HeroImagePreload | null,
): HeroPreloadLinkAttrs | null {
  if (!preload) return null;
  return {
    rel: "preload",
    as: "image",
    href: preload.href,
    width: preload.width,
    height: preload.height,
    fetchpriority: "high",
  };
}
