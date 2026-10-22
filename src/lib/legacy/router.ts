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
// edit to the on-box CSV.
//
// Live-route exemption (added with the /about fix, 2026-10-21): the old
// site's `/about` is in the archive's unresolved set, so the router answered
// 410 for the NEW About page before the route could run. The archive must
// never answer for a path the app serves: mapped -> 301 to its mapped
// target (the owner's own table still wins), live route -> pass through
// (the route answers 200 or 404), unresolved -> 410, everything else passes
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
 * The live-route list — the routes the app really serves.
 *
 * The legacy archive answers 410 for every path in its unresolved set, and
 * the OLD site's `/about` is in that set: the archive was right about the
 * old page and is wrong about the new one. The middleware runs before the
 * router, so the 410 was served before the real route could answer and the
 * new About page was unreachable (live bug, 2026-10-21).
 *
 * Rule: the archive must never answer for a path the app serves. The
 * mapped row still wins (the owner's own redirect table, checked first),
 * and a genuinely dead legacy path still 410s — but a live route passes
 * through, so the route itself answers (200) or not (404), which is the
 * app's business, not the archive's (AGENTS.md §6).
 *
 * The list lives here as a constant so the router keeps its contract:
 * dependency-free (no filesystem walk, no store, no network) and
 * fail-soft. It is PINNED against the real route set by
 * tests/legacy-router.test.ts, which derives the routes from `src/pages/`
 * on disk and fails when the two drift apart in EITHER direction: a route
 * the app serves but the list misses, or a list entry the app does not
 * serve.
 *
 * Pattern syntax:
 *   "/about"           an exact path
 *   "/reviews/:slug"   one path segment (the name is documentation)
 *   "/admin/*"         the prefix and everything below it
 *
 * Taxonomy paths (/cast/, /director/, /category/) are listed here, but
 * their content is decided by the taxonomy resolver above: a slug the site
 * publishes is served, a slug it does not publish is NOT a live page and
 * keeps the legacy answer.
 */
export const LIVE_ROUTE_PATTERNS: readonly string[] = [
  "/",
  "/about",
  "/contact",
  "/search",
  "/login",
  "/signup",
  "/setup",
  "/reviews",
  "/reviews/:slug",
  "/movies",
  "/movies/:tmdbId",
  "/series",
  "/series/:tmdbId",
  "/upcoming",
  "/cast/:slug",
  "/director/:slug",
  "/category/:slug",
  "/u/:handle",
  "/admin/*",
  "/api/*",
  "/uploads/*",
  "/llms.txt",
  "/sitemap.xml",
  "/robots.txt",
  "/rss.xml",
];

/**
 * Route parameters that must be numeric.
 *
 * A TMDB id is an integer, so `/movies/foo-full-movie-download` is a
 * legacy download slug that merely shares a prefix with a live route, not
 * a movie page: it stays in the legacy corpus and keeps its 410. Without
 * this rule the category-prefixed half of the corpus (`/series/<slug>`,
 * `/movies/<slug>`) would silently turn into a 404 instead of a 410.
 */
const NUMERIC_PARAMS: ReadonlySet<string> = new Set(["tmdbId"]);

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

/**
 * Split a request path into its segments: the query string, the fragment
 * and the trailing slash are ignored.
 *
 * The live-route check runs on the RAW path, never on the normalized one:
 * normalizeLegacyPath strips the category shells the legacy corpus used
 * (`/movies/123` -> `/123`), which would hide the very routes the check
 * is about.
 */
function pathSegments(input: string): string[] {
  let p = typeof input === "string" ? input : "";
  const cut = p.search(/[?#]/);
  if (cut >= 0) p = p.slice(0, cut);
  return p.split("/").filter(Boolean);
}

/**
 * True when `segments` match one route pattern.
 *
 * ":" marks a single-segment parameter, a trailing "*" matches the rest of
 * the path (including nothing). Matching is case-insensitive: Astro's
 * router is case-sensitive, so `/About` is a miss — but a miss must end in
 * the app's own answer (404), not in the archive's (410).
 */
function matchesPattern(pattern: string, segments: string[]): boolean {
  const pat = pattern.split("/").filter(Boolean);
  for (let i = 0; i < pat.length; i++) {
    const p = pat[i]!;
    if (p === "*") return true;
    if (i >= segments.length) return false;
    if (p.startsWith(":")) {
      const name = p.slice(1);
      if (NUMERIC_PARAMS.has(name) && !/^\d+$/.test(segments[i]!)) return false;
      continue;
    }
    if (p.toLowerCase() !== segments[i]!.toLowerCase()) return false;
  }
  return pat.length === segments.length;
}

/**
 * True when the path matches one of the app's routes (shape only — no
 * store, no filesystem). Taxonomy paths match their pattern here; whether
 * the site publishes that taxonomy page is decided by isLiveRoute.
 */
export function matchesLivePattern(pathname: string): boolean {
  const segments = pathSegments(pathname);
  return LIVE_ROUTE_PATTERNS.some((pattern) => matchesPattern(pattern, segments));
}

/**
 * True when the app really serves this path — the live-route exemption.
 *
 * Taxonomy paths are content-aware: the site publishes a taxonomy page
 * only for the entities it knows, so a slug with no page is NOT a served
 * path and keeps the legacy answer. Everything else is a pure shape
 * match against LIVE_ROUTE_PATTERNS.
 */
export function isLiveRoute(pathname: string): boolean {
  const parsed = parseTaxonomyPath(pathname);
  if (parsed) {
    try {
      return hasTaxonomyPage(parsed.kind, parsed.slug);
    } catch {
      // Fail-soft: a broken store must never turn a live route into a 410.
      return true;
    }
  }
  return matchesLivePattern(pathname);
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
      // LIVE-ROUTE EXEMPTION: the app really serves this path, so the
      // archive must not answer 410 for it — the route answers (200) or
      // not (404). The mapped row still wins above; a genuinely dead
      // legacy path (no map row, not a live route) still 410s below.
      if (isLiveRoute(pathname)) return null;
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
