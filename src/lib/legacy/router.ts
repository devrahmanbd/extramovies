import fs from "node:fs";
import path from "node:path";
import { parseTaxonomyPath } from "./taxonomy-path";
import { hasTaxonomyPage } from "../seo/taxonomy";

// Legacy piracy-archive URL router (AGENTS.md §5). Serves the per-server
// redirect map produced by scripts/legacy/archive_recover.py into the
// legacy dir (default sibling of the app dir, override LEGACY_DATA_DIR).
// Fail-soft: missing/invalid files -> pass-through, today's output unchanged.
//
// Taxonomy redirect (added with the cast/director/category rebuild): the
// legacy archive indexed `/cast/<slug>/`, `/director/<slug>/` and
// `/category/<slug>/` URLs that the current site no longer serves, so the
// link equity behind them was dead. When the site now publishes a page for
// one of those slugs, the router answers 301 to it — computed here, with no
// edit to the on-box CSV. Every other path keeps today's behaviour: mapped
// -> 301 to its mapped target, unresolved -> 410, everything else passes
// through. The lookup is fail-soft (AGENTS.md §6): if it throws, the
// request passes through exactly as before.

const CATEGORY_RE = /^(?:\d+(?:mb)?-movies|movies|movie|web-series|webseries|tv-shows|tv|series|dual-audio-movies|hindi-dubbed-movies|south-movies|punjabi-movies|hindi-movies|bollywood-movies|hollywood-movies|adult-movies)$/;
const PAGINATION_RE = /^page\/(\d+)$/;

/**
 * Static-asset extensions that must never be answered by the legacy archive.
 * The Wayback corpus archived a robots.txt and a favicon.ico, so the legacy
 * "unresolved" set can contain live asset paths; a 410 there blocks the crawl
 * (GSC: "robots.txt — Not Fetched") and kills the favicon.
 * `php` is deliberately NOT in the list: legacy player paths (e.g. /9xplay.php)
 * must stay in legacy scope and still 410.
 */
const ASSET_EXTENSIONS = new Set([
  "txt", "xml", "ico", "svg", "png", "jpg", "jpeg", "webp", "avif", "gif",
  "css", "js", "json", "woff", "woff2", "pdf", "mp4", "webm",
]);

/**
 * First path segments that hold live site assets — anything under them is
 * exempt regardless of extension (uploads, brand logos, built assets).
 * `.well-known` is here too: it is the standard location for legitimate
 * files (security.txt, apple-app-site-association, mta-sts.txt), and the
 * legacy corpus can hold an archived /.well-known/ path that must not 410.
 */
const ASSET_NAMESPACES = new Set([
  "brand", "uploads", "assets", "images", "img", "media",
  "css", "js", "fonts", "static", "_astro", "vendor", ".well-known",
]);

/**
 * Exemption test on an ALREADY NORMALIZED path (see normalizeLegacyPath).
 * Only two shapes are exempt:
 *   (a) a root-level file with a static-asset extension (/robots.txt,
 *       /favicon.ico, /sitemap.xml);
 *   (b) any path whose FIRST segment is a known asset namespace
 *       (/brand/<preset>/logo.svg, /uploads/hero.png, /_astro/x.js,
 *       /.well-known/security.txt).
 * Everything else stays in legacy scope: the WordPress-era corpus holds
 * uploaded images under dated paths (e.g. /2017/05/12/film.jpg) and those
 * must still 410 (or 301 when mapped), not pass through to a 404.
 */
function isAssetExempt(norm: string): boolean {
  const parts = norm.split("/").filter(Boolean);
  if (!parts.length) return false;
  if (parts.length === 1) {
    // (a) root-level file with an allowlisted extension
    const dot = parts[0].lastIndexOf(".");
    if (dot <= 0) return false;
    return ASSET_EXTENSIONS.has(parts[0].slice(dot + 1));
  }
  // (b) known asset namespace — any file under it, any extension
  return ASSET_NAMESPACES.has(parts[0]);
}

/**
 * True when the path is a live site asset the legacy archive must not answer.
 * The input is normalized first, so the exemption is always evaluated on the
 * same string the map/unresolved lookups use: /robots.txt and /robots.txt/
 * behave identically, and a percent-encoded dot (%2E) cannot slip past.
 */
export function isStaticAssetPath(input: string): boolean {
  return isAssetExempt(normalizeLegacyPath(input));
}

export function normalizeLegacyPath(input: string): string {
  let p = input;
  try {
    p = decodeURIComponent(p);
  } catch {
    // keep raw on malformed escapes
  }
  p = p.split("?")[0].split("#")[0].toLowerCase().trim();
  if (p === "/" || p === "") return "";
  const parts = p.split("/").filter(Boolean);
  while (parts.length && (CATEGORY_RE.test(parts[0]) || PAGINATION_RE.test(parts[0]))) {
    parts.shift();
  }
  while (parts.length && (parts[parts.length - 1] === "feed" || parts[parts.length - 1] === "comment" || parts[parts.length - 1] === "comments")) {
    parts.pop();
  }
  return parts.length ? "/" + parts.join("/") : "";
}

function pathOnly(u: string): string {
  const s = u.trim();
  const m = /^https?:\/\/[^/]*(\/.*)$/.exec(s);
  if (m) return m[1];
  return s.startsWith("/") ? s : "/" + s;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    }
    // \r skipped
    else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function buildTables(mapText: string, unresolvedText: string) {
  const map = new Map<string, string>();
  const unresolved = new Set<string>();
  for (const row of parseCsv(mapText)) {
    if (row.length < 2 || row[0] === "legacy_path") continue;
    const target = row[1].trim();
    const norm = normalizeLegacyPath(pathOnly(row[0]));
    if (!norm) continue;
    if (target === "/410") unresolved.add(norm);
    else if (target && target !== "/") map.set(norm, target);
  }
  for (const row of parseCsv(unresolvedText)) {
    if (row.length < 2 || row[0] === "legacy_url") continue;
    const norm = normalizeLegacyPath(pathOnly(row[0]));
    if (!norm) continue;
    if (!map.has(norm)) unresolved.add(norm);
  }
  return { map, unresolved };
}

interface State {
  mtime: number;
  map: Map<string, string>;
  unresolved: Set<string>;
}

const RETRY_MS = 60_000;

export function createLegacyRouter(dir?: string) {
  let state: State | null = null;
  let disabled = false;
  let lastFailed = 0;
  const base =
    dir ??
    process.env.LEGACY_DATA_DIR ??
    path.join(process.cwd(), "..", "legacy");

  function load(): void {
    if (disabled && Date.now() - lastFailed < RETRY_MS) return;
    try {
      const mapFile = path.join(base, "redirect_map.csv");
      const unresFile = path.join(base, "unresolved.csv");
      const mtime = Math.max(fs.statSync(mapFile).mtimeMs, fs.statSync(unresFile).mtimeMs);
      if (state && state.mtime === mtime) return;
      const tables = buildTables(
        fs.readFileSync(mapFile, "utf8"),
        fs.readFileSync(unresFile, "utf8"),
      );
      state = { mtime, map: tables.map, unresolved: tables.unresolved };
      disabled = false;
    } catch {
      disabled = true;
      lastFailed = Date.now();
      state = null;
    }
  }

  /**
   * Taxonomy redirect target for a legacy path, or null.
   *
   * Fail-soft by contract: a broken store, a missing file or any other
   * failure answers null, so the caller passes the request through exactly
   * as it does today.
   */
  function taxonomyTarget(norm: string): string | null {
    try {
      const parsed = parseTaxonomyPath(norm);
      if (!parsed) return null;
      if (!hasTaxonomyPage(parsed.kind, parsed.slug)) return null;
      return `/${parsed.kind}/${parsed.slug}`;
    } catch {
      return null;
    }
  }

  /**
   * True when the request already IS the taxonomy page's canonical URL.
   *
   * The taxonomy routes canonicalize to `/<kind>/<slug>` (no trailing
   * slash — the same shape as `/reviews/<slug>`), while the legacy corpus
   * indexed the slashed form `/<kind>/<slug>/`. Redirecting the canonical
   * URL to itself would loop, so it is left to serve the page (200); the
   * slashed legacy form still 301s to the canonical one. The live page
   * also wins over the legacy corpus' unresolved set — a resurrected slug
   * must not 410.
   */
  function isCanonicalTaxonomyPath(pathname: string, target: string): boolean {
    const raw = pathname.split("?")[0]?.split("#")[0] ?? "";
    return raw === target;
  }

  return {
    check(pathname: string): Response | null {
      const norm = normalizeLegacyPath(pathname);
      if (!norm) return null;
      // Live assets bypass the legacy archive entirely — no 301, no 410.
      // Evaluated on the NORMALIZED path (the same string the map/unresolved
      // lookups use), so /robots.txt and /robots.txt/ behave identically and
      // a percent-encoded dot cannot slip past.
      if (isAssetExempt(norm)) return null;
      load();
      // The explicit map still wins: it is the owner's own redirect table.
      const mapped = state?.map.get(norm);
      if (mapped) return new Response(null, { status: 301, headers: { Location: mapped } });
      // Taxonomy shape the site now publishes -> 301 to the live page.
      // Runs before the 410 so a resurrected slug is not killed by the
      // legacy corpus' unresolved set: the path is live again.
      const taxonomy = taxonomyTarget(norm);
      if (taxonomy) {
        // The canonical URL is the page itself: let the route serve it.
        if (isCanonicalTaxonomyPath(pathname, taxonomy)) return null;
        return new Response(null, { status: 301, headers: { Location: taxonomy } });
      }
      if (state?.unresolved.has(norm)) return new Response(null, { status: 410 });
      return null;
    },
    stats(): { ready: boolean; mapped: number; gone: number } {
      load();
      return {
        ready: state !== null,
        mapped: state?.map.size ?? 0,
        gone: state?.unresolved.size ?? 0,
      };
    },
  };
}

export const legacyRouter = createLegacyRouter();
