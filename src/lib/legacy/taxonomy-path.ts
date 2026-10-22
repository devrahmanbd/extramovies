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
 *
 * The module also carries the LEGACY TAXONOMY ALIASES map — the legacy
 * spellings that must still resolve to a live page — and the pure slug
 * resolver that follows it. Both stay dependency-free, so the resolution
 * works the same in the router, in the taxonomy resolver and in tests.
 */

export const TAXONOMY_SEGMENTS = ["cast", "director", "category"] as const;

export type TaxonomyPathKind = (typeof TAXONOMY_SEGMENTS)[number];

export interface TaxonomyPath {
  kind: TaxonomyPathKind;
  slug: string;
}

/** Kebab-case slug: lowercase alphanumerics separated by single dashes. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * LEGACY TAXONOMY ALIASES — the legacy slug -> the canonical slug.
 *
 * WHY THIS ROW EXISTS
 * The 2016-2025 site misspelled a director's name. It published the
 * credit as "Surrender Reddy" (two r's) where every authoritative source
 * — TMDB, Rotten Tomatoes, Wikipedia, Letterboxd and the film's own
 * credits — says "Surender Reddy" (one r). The legacy archive indexed
 * `/director/surrender-reddy/` and 18 inbound links still point at that
 * misspelled path. A taxonomy slug is derived from the label the site
 * stores, so once the credit is corrected the live page becomes
 * `/director/surender-reddy/` and the old path would 404 and drop all 18
 * links. The row below keeps the misspelled path pointing at the
 * canonical one, so the legacy router answers 301 instead of 404.
 *
 * This map is the ONLY place a legacy spelling is recorded. The resolver
 * (`resolveLegacyTaxonomySlug`) is generic, so a second row — another
 * legacy spelling, a renamed person, a re-slugged genre — needs no logic
 * change.
 *
 * Key: the LEGACY slug the old site indexed.
 * Value: the CANONICAL slug the site publishes now.
 *
 * A live page always wins over an alias: the resolver tries the exact slug
 * first, so the row stays inert until the credit is actually corrected.
 */
export const LEGACY_TAXONOMY_ALIASES: Readonly<Record<string, string>> = {
  "surrender-reddy": "surender-reddy",
};

/**
 * How many alias hops to follow before giving up. A map row that pointed
 * at itself would otherwise loop forever inside a request.
 */
const MAX_ALIAS_HOPS = 8;

/**
 * The canonical slug for a taxonomy slug: the alias target when the slug
 * is a known legacy spelling, the slug itself otherwise.
 *
 * The map is followed transitively (a target may itself be an alias key)
 * with a hop bound and a seen-set, so a cycle degrades to the last slug
 * instead of hanging. An alias target that is not a usable slug is
 * ignored — one bad row must not break every taxonomy request.
 */
export function resolveLegacyTaxonomySlug(slug: string): string {
  if (typeof slug !== "string") return "";
  let current = slug.trim().toLowerCase();
  if (!current) return "";
  const seen = new Set<string>([current]);
  for (let hop = 0; hop < MAX_ALIAS_HOPS; hop++) {
    const target = LEGACY_TAXONOMY_ALIASES[current];
    if (!target) break;
    const next = target.trim().toLowerCase();
    if (!next || !SLUG_RE.test(next) || seen.has(next)) break;
    current = next;
    seen.add(current);
  }
  return current;
}

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
