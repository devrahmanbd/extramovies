/**
 * TMDB artwork srcset helper (CWV task 4).
 *
 * TMDB serves the same artwork at a handful of fixed widths
 * (`/t/p/w185/<file>`, `w342`, `w500`, `w780`, `w1280`). A `srcset` lets the
 * browser pick the smallest candidate that covers its device-pixel box,
 * instead of every phone downloading the desktop-sized file.
 *
 * Rule (never guess): only a genuine TMDB image path yields a srcset. A null,
 * empty, upload-hosted or foreign URL returns null and the caller keeps the
 * plain `src` it already had — the fallback is the current output, byte for
 * byte.
 *
 * Pure module: no DB, no network, no framework — safe to unit test.
 */

/** The TMDB image CDN origin (the only host these candidates can address). */
export const TMDB_IMAGE_ORIGIN = "https://image.tmdb.org";

/**
 * Poster candidates. w500 is the ceiling: the tile/card slots these serve are
 * all narrower than 500 CSS px, so a larger file would only cost bytes.
 */
export const TMDB_POSTER_SIZES = ["w185", "w342", "w500"] as const;

/** Hero backdrop candidates (full-bleed, 100vw). */
export const TMDB_BACKDROP_SIZES = ["w780", "w1280"] as const;

/**
 * The poster ladder for LARGE card art (a 5–7/12 review card slot, up to
 * ~700 CSS px): the three poster candidates plus w780, which is the width
 * those surfaces serve today — dropping it would soften them on wide or
 * DPR2 screens.
 */
export const TMDB_CARD_SIZES = [...TMDB_POSTER_SIZES, "w780"] as const;

/** `https://image.tmdb.org/t/p/<variant>/<file>` — captured file part only. */
const TMDB_URL_PATTERN = /^https?:\/\/image\.tmdb\.org\/t\/p\/[^/?#]+\/([^?#]+)$/i;

/**
 * A bare TMDB file name (`/6izwz7rsy95ARzTR3poZ8H6c5pp.jpg`). Deliberately
 * strict: one segment, image extension, no leading dot — so a local
 * `/uploads/cover.jpg` (extra segment) is never mistaken for TMDB art.
 */
const TMDB_BARE_FILE_PATTERN = /^\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpe?g|png|webp|avif)$/i;

/** `w185` -> 185; anything else (e.g. `original`) -> null. */
export function tmdbWidthOf(size: string): number | null {
  const match = /^w(\d+)$/i.exec(size.trim());
  if (!match) return null;
  const width = Number(match[1]);
  return Number.isFinite(width) && width > 0 ? width : null;
}

/**
 * The TMDB file path for an artwork URL (or a bare TMDB path), or null when
 * the input is not TMDB artwork.
 *
 *   https://image.tmdb.org/t/p/w1280/abc.jpg -> /abc.jpg
 *   /abc.jpg                                 -> /abc.jpg
 *   /uploads/cover.jpg                       -> null
 *   null | "" | "not a url"                  -> null
 */
export function tmdbImagePath(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  const raw = url.trim();
  if (!raw) return null;
  const fromUrl = TMDB_URL_PATTERN.exec(raw);
  if (fromUrl) return `/${fromUrl[1]}`;
  if (TMDB_BARE_FILE_PATTERN.test(raw)) return raw;
  return null;
}

/**
 * One TMDB image at an explicit variant (`w185`, `w342`, `w500`, `w780`,
 * `w1280`, `original`). Null for non-TMDB artwork or an empty variant, so a
 * caller can fall back instead of building a broken URL.
 */
export function tmdbImageAt(
  url: string | null | undefined,
  size: string,
): string | null {
  const filePath = tmdbImagePath(url);
  const variant = typeof size === "string" ? size.trim() : "";
  if (!filePath || !variant) return null;
  return `${TMDB_IMAGE_ORIGIN}/t/p/${variant}${filePath}`;
}

/**
 * The `srcset` value for a TMDB artwork path, or null when it is not TMDB art
 * (or no candidate carries a numeric width). Candidate order is the caller's
 * order, unchanged; sizes without a numeric width (`original`) are skipped
 * because a `srcset` candidate needs a `NNNw` descriptor.
 */
export function tmdbSrcSet(
  url: string | null | undefined,
  sizes: readonly string[] = TMDB_POSTER_SIZES,
): string | null {
  const filePath = tmdbImagePath(url);
  if (!filePath) return null;
  const candidates: string[] = [];
  for (const size of sizes) {
    const width = tmdbWidthOf(size);
    if (width === null) continue;
    candidates.push(`${TMDB_IMAGE_ORIGIN}/t/p/w${width}${filePath} ${width}w`);
  }
  return candidates.length > 0 ? candidates.join(", ") : null;
}
