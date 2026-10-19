/**
 * Font stylesheet URL normalizer (CWV task 2).
 *
 * The brand stylesheet is loaded with the print-to-all trick
 * (`media="print" onload="this.media='all'"`), so the request never blocks
 * rendering — but only when the stylesheet itself asks for `display=swap`.
 * Without it a slow Google Fonts response leaves the page invisible (FOIT)
 * instead of painting fallback type first.
 *
 * Only Google Fonts URLs are touched: a self-hosted or signed stylesheet
 * must not receive a foreign query parameter.
 */

export function withFontDisplaySwap(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (!/fonts\.googleapis\.com/i.test(trimmed)) return trimmed;
  if (/[?&]display=swap\b/i.test(trimmed)) return trimmed;
  return `${trimmed}${trimmed.includes("?") ? "&" : "?"}display=swap`;
}
