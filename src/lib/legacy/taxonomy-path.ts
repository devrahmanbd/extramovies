/**
 * Taxonomy path shape — the pure, dependency-free half of the taxonomy
 * resolver (AGENTS.md §5, §6).
 *
 * The legacy piracy archive (2016–2025) indexed taxonomy URLs of the shape
 * `/cast/<slug>/`, `/director/<slug>/` and `/category/<slug>/`. Those paths
 * are dead (404/410) on the current site, so the link equity they carry is
 * dead too. This module recognises the SHAPE only — it never touches the
 * store, the network or the filesystem, so the legacy router can use it
 * without giving up its dependency-free, fail-soft contract.
 *
 * Input is expected to be a NORMALIZED path (see normalizeLegacyPath in
 * ./router): lower-case, no query string, no trailing slash, no leading
 * category shell. The parser is defensive anyway — it re-validates the
 * shape, so a raw path can be passed safely.
 */

export const TAXONOMY_SEGMENTS = ["cast", "director", "category"] as const;

export type TaxonomyPathKind = (typeof TAXONOMY_SEGMENTS)[number];

export interface TaxonomyPath {
  kind: TaxonomyPathKind;
  slug: string;
}

/** Kebab-case slug: lowercase alphanumerics separated by single dashes. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isKind(value: string): value is TaxonomyPathKind {
  return (TAXONOMY_SEGMENTS as readonly string[]).includes(value);
}

/**
 * Parse a taxonomy path. Returns null for anything that is not exactly
 * `/<cast|director|category>/<kebab-slug>`.
 *
 * Two segments exactly: `/cast/name/extra` is not a taxonomy path (it may be
 * a legacy article slug) and `/cast` alone is not one either.
 */
export function parseTaxonomyPath(input: string): TaxonomyPath | null {
  if (typeof input !== "string" || !input) return null;
  let p = input.trim().toLowerCase();
  const q = p.indexOf("?");
  if (q >= 0) p = p.slice(0, q);
  const h = p.indexOf("#");
  if (h >= 0) p = p.slice(0, h);
  if (!p.startsWith("/")) return null;
  const parts = p.split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  const kind = parts[0] ?? "";
  const slug = parts[1] ?? "";
  if (!isKind(kind)) return null;
  if (!SLUG_RE.test(slug)) return null;
  return { kind, slug };
}
