/**
 * Image-origin resource hints (CWV task 2).
 *
 * The LCP artwork on the public pages is a TMDB CDN JPEG on
 * `image.tmdb.org` — a third-party origin. Without a hint the browser only
 * discovers it when the preload/`<img>` is parsed, so it pays a full DNS +
 * TCP + TLS handshake on the critical path. `preconnect` opens that
 * connection up front; `dns-prefetch` is the older-browser fallback (it is
 * cheap and harmless where `preconnect` is supported).
 *
 * Emitted ONLY for pages that actually reference TMDB artwork: a page whose
 * hero is a local upload must not open an unused third-party connection.
 *
 * Attribute bags live here (not inline in the layout) so the exact emitted
 * attribute set is unit-testable, matching `heroPreloadLinkAttrs`.
 *
 * Pure module: no DB, no network, no framework — safe to unit test.
 */
import { TMDB_IMAGE_ORIGIN, tmdbImagePath } from "./images";

/** Bare origin, for callers that need the string rather than the attrs. */
export const TMDB_IMAGE_ORIGIN_URL = TMDB_IMAGE_ORIGIN;

/** Attributes of `<link rel="preconnect">` (spread onto the link). */
export interface PreconnectAttrs {
  rel: "preconnect";
  href: string;
  /** Anonymous CORS mode: image requests are credential-less. */
  crossorigin: "anonymous";
}

/** Attributes of `<link rel="dns-prefetch">` (spread onto the link). */
export interface DnsPrefetchAttrs {
  rel: "dns-prefetch";
  href: string;
}

/** The pair the layout emits, in order: preconnect first, then the fallback. */
export interface ImageOriginHints {
  preconnect: PreconnectAttrs;
  dnsPrefetch: DnsPrefetchAttrs;
}

/**
 * Resource hints for the TMDB image origin — or null when none of the given
 * URLs is TMDB artwork (unknown/empty input included), in which case the head
 * stays exactly as it was before this helper existed.
 */
export function tmdbOriginHints(
  urls: ReadonlyArray<string | null | undefined>,
): ImageOriginHints | null {
  const usesTmdbArt = urls.some((url) => tmdbImagePath(url) !== null);
  if (!usesTmdbArt) return null;
  return {
    preconnect: {
      rel: "preconnect",
      href: TMDB_IMAGE_ORIGIN,
      crossorigin: "anonymous",
    },
    dnsPrefetch: {
      rel: "dns-prefetch",
      href: TMDB_IMAGE_ORIGIN,
    },
  };
}
