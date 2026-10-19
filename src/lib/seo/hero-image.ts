/**
 * Hero image intrinsic-size + preload helpers (CWV task 2).
 *
 * TMDB encodes the delivered image variant in the path
 * (`/t/p/<variant>/<file>`), so the intrinsic pixel size of the artwork we
 * actually request is knowable at render time — for the variants we know.
 *
 * Rule (never guess): a variant we cannot map yields NO size pair. The
 * caller then omits `width`/`height` (an unknown ratio is worse than none)
 * and still emits the preload, which is size-agnostic.
 *
 * Backdrops are 16:9, posters are 2:3. The same numeric width exists in
 * both namespaces (TMDB serves w780 for backdrops and for posters), so the
 * caller states the shape instead of the URL guessing it.
 *
 * Pure module: no DB, no network, no framework — safe to unit test.
 */

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

/** 16:9 backdrops. */
const BACKDROP_SIZES: Record<string, HeroImageSize> = {
  w1280: { width: 1280, height: 720 },
  w780: { width: 780, height: 439 },
};

/** 2:3 posters. */
const POSTER_SIZES: Record<string, HeroImageSize> = {
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
  kind: HeroImageKind,
): HeroImageSize | null {
  const variant = heroImageVariant(url);
  if (!variant) return null;
  const table = kind === "poster" ? POSTER_SIZES : BACKDROP_SIZES;
  return table[variant] ?? null;
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
