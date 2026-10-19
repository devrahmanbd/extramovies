import type { APIRoute } from "astro";
import { promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
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
 * with a WEAK size+mtime ETag (`W/"<size>-<mtimeMs>"`): size+mtime is not
 * byte-identity, so the validator stays weak. A repeat GET carrying
 * If-None-Match short-circuits to a bodyless 304 (zero-byte revalidation);
 * matching is RFC 7232 weak comparison, so a list of validators and the
 * strong form of the same opaque tag both revalidate.
 *
 * Bodies are streamed from an ALREADY-OPEN file handle: `createReadStream`
 * reports ENOENT asynchronously, so a file deleted between stat and open
 * would otherwise answer with a truncated 200. Opening first puts the open
 * error in the await path → 404, and the live fd keeps the body complete
 * even if the path is unlinked mid-flight. Any open/stream failure is a
 * 404, never a 500 (a public image request must never 500).
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

/**
 * WEAK validator from size + mtime (ms), nginx-style; quotes included.
 * Weak because size+mtime is NOT byte-identity: two different payloads can
 * share a size and an mtime, so the validator must not be used for range
 * or byte-equality reasoning.
 */
function deriveEtag(stat: { size: number; mtimeMs: number }): string {
  return `W/"${stat.size}-${Math.round(stat.mtimeMs)}"`;
}

/** Drop the `W/` weakness prefix so two tags can be compared opaquely. */
function stripWeak(tag: string): string {
  return tag.trim().replace(/^W\//i, "");
}

/**
 * RFC 7232 If-None-Match: `*` or list membership, WEAK comparison
 * (RFC 7232 §3.2 — `W/"x"` and `"x"` are the same validator for
 * If-None-Match), so both the weak ETag we emit and the strong form of the
 * same opaque tag revalidate.
 */
function ifNoneMatchMatches(request: Request, etag: string): boolean {
  const inm = request.headers.get("If-None-Match");
  if (!inm) return false;
  const trimmed = inm.trim();
  if (trimmed === "*") return true;
  const target = stripWeak(etag);
  return trimmed.split(",").some((candidate) => {
    const value = candidate.trim();
    return value !== "" && stripWeak(value) === target;
  });
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

  // Open the handle BEFORE streaming. `createReadStream` surfaces ENOENT
  // asynchronously (the sync throw never fires), so a file deleted between
  // stat and open used to answer with a truncated 200. Opening here makes
  // the failure observable in the await path → 404. The open fd also pins
  // the inode, so the streamed body stays complete if the path is unlinked
  // mid-flight.
  let handle: FileHandle;
  try {
    handle = await fs.open(resolved, "r");
  } catch {
    // ENOENT / ENOTDIR (deleted or renamed) — and any unexpected open
    // error — is a 404. Never a 500: a public image request must not 500.
    return new Response("not found", { status: 404 });
  }

  // Stream from the OPEN handle (no whole-file buffer). The handle owns the
  // fd, so the stream closes it on end/close (autoClose) without leaving a
  // raw fd behind a FileHandle — a hand-rolled `createReadStream(path, {fd,
  // autoClose:true})` closes the fd behind the handle's back and makes
  // Node's GC finalizer throw on the FileHandle.
  let body: BodyInit;
  try {
    body = Readable.toWeb(
      handle.createReadStream({ autoClose: true })
    ) as unknown as BodyInit;
  } catch {
    // Unexpected stream-setup failure: release the handle, answer 404.
    try {
      await handle.close();
    } catch {
      /* already closed */
    }
    return new Response("not found", { status: 404 });
  }
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": CACHE_CONTROL,
  };
  if (etag) headers.ETag = etag;
  return new Response(body, { status: 200, headers });
};
