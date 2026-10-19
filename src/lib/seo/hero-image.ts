/**
 * Hero image intrinsic-size + preload helpers (CWV task 2).
 *
 * The intrinsic size is derived from the IMAGE URL — never from a
 * caller-asserted shape. TMDB encodes the delivered variant in the path
 * (`/t/p/<variant>/<file>`), and in this repo one shape owns each variant:
 *
 *   w1280 → backdrop path (16:9)  every public hero backdrop uses this width
 *                                   (the DEMO rows in src/lib/seo/content.ts);
 *                                   TMDB serves no poster at w1280.
 *   w780  → poster path   (2:3)   the DEMO poster URLs.
 *   w500  → poster path   (2:3)   TMDB client / seed poster URLs
 *                                   (src/lib/tmdb/client.ts, seeds/*).
 *   w300  → poster path   (2:3)   poster variant.
 *
 * A poster URL therefore never picks up a 16:9 pair: the URL alone decides.
 *
 * The store cannot carry a backdrop URL (the admin review shape has no
 * backdrop field — src/lib/seo/store-merge.ts pins `backdropUrl: null`), so
 * no w780 backdrop ever reaches a public page; the only w780 URLs in public
 * content are posters.
 *
 * Rule (never guess): a variant we cannot map yields NO size pair. The caller
 * omits width/height (an unknown ratio is worse than none) and still emits the
 * preload, which is size-agnostic.
 *
 * Pure module: no DB, no network, no framework — safe to unit test.
 */

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

/** TMDB variant → intrinsic pixel size of the artwork we request. */
const IMAGE_SIZES: Record<string, HeroImageSize> = {
  w1280: { width: 1280, height: 720 },
  w780: { width: 780, height: 1170 },
  w500: { width: 500, height: 750 },
  w300: { width: 300, height: 450 },
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
 */
export function heroImageSize(
  url: string | null | undefined,
): HeroImageSize | null {
  const variant = heroImageVariant(url);
  if (!variant) return null;
  return IMAGE_SIZES[variant] ?? null;
}

/**
 * Preload descriptor for a hero image. Always carries the href (the preload
 * itself is size-agnostic); carries width/height only when the variant is
 * known, so the browser can reserve the box before the bytes land.
 */
export function heroImagePreload(
  url: string | null | undefined,
): HeroImagePreload | null {
  if (typeof url !== "string") return null;
  const href = url.trim();
  if (!href) return null;
  const size = heroImageSize(href);
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
