import type { APIRoute } from "astro";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

export const prerender = false;

/**
 * GET /uploads/* — public runtime serve route for brand assets uploaded via
 * POST /api/admin/upload. Astro serves `public/` from the build, so uploads
 * live under `<cwd>/data/uploads` and are served here instead (go live
 * WITHOUT a rebuild). NO auth — these are public assets.
 *
 * Traversal-proof (resolved path must stay under the uploads dir),
 * extension-gated content types, `Cache-Control: public, max-age=604800`
 * with a size+mtime ETag: a repeat GET carrying If-None-Match short-circuits
 * to a bodyless 304 (zero-byte revalidation). Bodies are streamed via
 * createReadStream. 404 otherwise. ETag/stream-derive failures never 500 —
 * fall back to plain 200 serving (fallback-first).
 */

const CONTENT_TYPES: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  ico: "image/x-icon",
};

const CACHE_CONTROL = "public, max-age=604800";

function uploadDir(): string {
  const override =
    typeof process !== "undefined" ? process.env.UPLOADS_DIR_PATH : undefined;
  if (override && override.trim() !== "") return override;
  return path.join(process.cwd(), "data", "uploads");
}

/** Strong validator from size + mtime (ms), nginx-style; quotes included. */
function deriveEtag(stat: { size: number; mtimeMs: number }): string {
  return `"${stat.size}-${Math.round(stat.mtimeMs)}"`;
}

/** RFC 7232 If-None-Match: `*` or list membership (weak-prefixed tolerated). */
function ifNoneMatchMatches(request: Request, etag: string): boolean {
  const inm = request.headers.get("If-None-Match");
  if (!inm) return false;
  const trimmed = inm.trim();
  if (trimmed === "*") return true;
  return trimmed
    .split(",")
    .some((c) => c.trim() === etag || c.trim() === `W/${etag}`);
}

export const GET: APIRoute = async ({ params, request }) => {
  const raw = (params as Record<string, unknown>).path;
  const rel = Array.isArray(raw) ? raw.join("/") : (raw as string | undefined);
  if (!rel || rel.includes("\0")) {
    return new Response("not found", { status: 404 });
  }
  const base = uploadDir();
  const resolved = path.resolve(base, rel);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    return new Response("not found", { status: 404 });
  }
  const ext = resolved.slice(resolved.lastIndexOf(".") + 1).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) return new Response("not found", { status: 404 });
  let stat: { isFile(): boolean; size: number; mtimeMs: number };
  try {
    stat = await fs.stat(resolved);
  } catch {
    return new Response("not found", { status: 404 });
  }
  if (!stat.isFile()) return new Response("not found", { status: 404 });

  // Validator is best-effort: a derive failure must not 500 a public asset.
  let etag = "";
  try {
    etag = deriveEtag(stat);
  } catch {
    etag = "";
  }
  if (etag && ifNoneMatchMatches(request, etag)) {
    // Unchanged: 304 with no body — the win (browser revalidates for free).
    return new Response(null, {
      status: 304,
      headers: { "Cache-Control": CACHE_CONTROL, ETag: etag },
    });
  }

  // Stream the file (no whole-file buffer). If stream setup throws, fall
  // back to the original buffered read so the response is still 200.
  let body: BodyInit;
  try {
    body = Readable.toWeb(createReadStream(resolved)) as unknown as BodyInit;
  } catch {
    try {
      body = await fs.readFile(resolved);
    } catch {
      return new Response("not found", { status: 404 });
    }
  }
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": CACHE_CONTROL,
  };
  if (etag) headers.ETag = etag;
  return new Response(body, { status: 200, headers });
};
