import fs from "node:fs";
import path from "node:path";

// Legacy piracy-archive URL router (AGENTS.md §5). Serves the per-server
// redirect map produced by scripts/legacy/archive_recover.py into the
// legacy dir (default sibling of the app dir, override LEGACY_DATA_DIR).
// Fail-soft: missing/invalid files -> pass-through, today's output unchanged.

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
 * True when the path's last segment ends with a static-asset extension.
 * Case-insensitive; query string and fragment are ignored.
 */
export function isStaticAssetPath(input: string): boolean {
  const clean = input.split("?")[0].split("#")[0];
  const segment = clean.slice(clean.lastIndexOf("/") + 1).toLowerCase();
  const dot = segment.lastIndexOf(".");
  if (dot <= 0) return false;
  return ASSET_EXTENSIONS.has(segment.slice(dot + 1));
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

  return {
    check(pathname: string): Response | null {
      // Live assets bypass the legacy archive entirely — no 301, no 410.
      // Checked before ANY map/unresolved lookup so an archived robots.txt or
      // favicon.ico can never be answered from the legacy corpus.
      if (isStaticAssetPath(pathname)) return null;
      load();
      if (!state) return null;
      const norm = normalizeLegacyPath(pathname);
      if (!norm) return null;
      const target = state.map.get(norm);
      if (target) return new Response(null, { status: 301, headers: { Location: target } });
      if (state.unresolved.has(norm)) return new Response(null, { status: 410 });
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
