import type { APIRoute } from "astro";
import { promises as fs } from "node:fs";
import path from "node:path";

export const prerender = false;

/**
 * GET /uploads/* — public runtime serve route for brand assets uploaded via
 * POST /api/admin/upload. Astro serves `public/` from the build, so uploads
 * live under `<cwd>/data/uploads` and are served here instead (go live
 * WITHOUT a rebuild). NO auth — these are public assets.
 *
 * Traversal-proof (resolved path must stay under the uploads dir),
 * extension-gated content types, `Cache-Control: public, max-age=86400`,
 * 404 otherwise.
 */

const CONTENT_TYPES: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  ico: "image/x-icon",
};

function uploadDir(): string {
  const override =
    typeof process !== "undefined" ? process.env.UPLOADS_DIR_PATH : undefined;
  if (override && override.trim() !== "") return override;
  return path.join(process.cwd(), "data", "uploads");
}

export const GET: APIRoute = async ({ params }) => {
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
  let stat: { isFile(): boolean };
  try {
    stat = await fs.stat(resolved);
  } catch {
    return new Response("not found", { status: 404 });
  }
  if (!stat.isFile()) return new Response("not found", { status: 404 });
  let data: Uint8Array;
  try {
    data = await fs.readFile(resolved);
  } catch {
    return new Response("not found", { status: 404 });
  }
  return new Response(data as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
};
