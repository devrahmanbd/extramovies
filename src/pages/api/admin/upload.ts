import type { APIRoute } from "astro";
import { promises as fs } from "node:fs";
import path from "node:path";
import { requireAdminApiAstro } from "../../../lib/auth/guard";

export const prerender = false;

/**
 * POST /api/admin/upload — brand asset uploads (logo + favicon).
 *
 * Multipart FormData: `file` (the asset) + `kind` ("logo" | "favicon").
 * Auth: admin session cookie + `x-csrf-token` header (same guard as the
 * rest of the admin API). Files land in `<cwd>/data/uploads` (served at
 * runtime by GET /uploads/[...path], so they go live WITHOUT a rebuild).
 *
 * Success: `{ ok: true, path: "/uploads/<safe-name>" }`.
 * Failure: `{ ok: false, error }` with a 4xx status.
 */

/** 512KB cap per the shared brand-upload contract. */
export const MAX_UPLOAD_BYTES = 512 * 1024;

/** Extension allowlist per the shared brand-upload contract. */
export const ALLOWED_EXTS = ["svg", "png", "jpg", "jpeg", "webp", "ico"] as const;
export type AllowedExt = (typeof ALLOWED_EXTS)[number];

/** Upload kinds accepted by this endpoint. */
export const UPLOAD_KINDS = ["logo", "favicon"] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

export function resolveUploadDir(): string {
  const override =
    typeof process !== "undefined" ? process.env.UPLOADS_DIR_PATH : undefined;
  if (override && override.trim() !== "") return override;
  return path.join(process.cwd(), "data", "uploads");
}

/** Lowercase extension without the dot ("" when none). */
export function extOf(filename: string): string {
  const base = (filename.split(/[\\/]/).pop() ?? filename).trim();
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

/**
 * Sanitize a user-supplied filename: strip directories (no traversal),
 * lowercase, map `[^a-z0-9._-]` runs to `-`, drop leading dots/dashes
 * (never a dotfile), collapse repeats, cap length. Never returns "".
 */
export function sanitizeBasename(raw: string): string {
  let base = (raw.split(/[\\/]/).pop() ?? raw).trim().toLowerCase();
  base = base.replace(/[^a-z0-9._-]+/g, "-");
  base = base.replace(/^[.-]+/, "").replace(/-+$/, "");
  base = base.replace(/-{2,}/g, "-");
  if (!base || base === "." || base === "..") return "upload";
  return base.slice(0, 128);
}

/** `logo.svg` + 1 -> `logo-1.svg` (collision suffix, never overwrite). */
export function suffixedName(sanitized: string, n: number): string {
  if (n <= 0) return sanitized;
  const dot = sanitized.lastIndexOf(".");
  if (dot <= 0) return `${sanitized}-${n}`;
  return `${sanitized.slice(0, dot)}-${n}${sanitized.slice(dot)}`;
}

/**
 * Magic-byte sniff per the shared contract:
 * svg:`<svg`, png:`PNG`, jpg:`JFIF|Exif`, webp:`RIFF....WEBP`, ico:`\0\0\x01\0`.
 */
export function sniffMatches(ext: string, data: Uint8Array): boolean {
  const e = ext.toLowerCase();
  if (e === "svg") {
    const head = Buffer.from(data.slice(0, 2048)).toString("latin1").toLowerCase();
    return head.includes("<svg");
  }
  if (e === "png") {
    return (
      data.length >= 4 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47
    );
  }
  if (e === "jpg" || e === "jpeg") {
    if (!(data.length >= 2 && data[0] === 0xff && data[1] === 0xd8)) return false;
    const head = Buffer.from(data.slice(0, 1024)).toString("latin1");
    return head.includes("JFIF") || head.includes("Exif");
  }
  if (e === "webp") {
    return (
      data.length >= 12 &&
      data[0] === 0x52 &&
      data[1] === 0x49 &&
      data[2] === 0x46 &&
      data[3] === 0x46 &&
      data[8] === 0x57 &&
      data[9] === 0x45 &&
      data[10] === 0x42 &&
      data[11] === 0x50
    );
  }
  if (e === "ico") {
    return (
      data.length >= 4 &&
      data[0] === 0x00 &&
      data[1] === 0x00 &&
      data[2] === 0x01 &&
      data[3] === 0x00
    );
  }
  return false;
}

export interface UploadCheck {
  filename: string;
  data: Uint8Array;
  kind: string;
}

/**
 * Shared validation (extension allowlist + magic-byte sniff + 512KB cap).
 * Returns an error message or null when the upload is acceptable.
 */
export function validateUpload(input: UploadCheck): string | null {
  if (!(UPLOAD_KINDS as readonly string[]).includes(input.kind)) {
    return 'kind must be "logo" or "favicon"';
  }
  const ext = extOf(input.filename);
  if (!(ALLOWED_EXTS as readonly string[]).includes(ext)) {
    return `unsupported file type (allowed: ${ALLOWED_EXTS.join(", ")})`;
  }
  if (input.data.length === 0) return "file is empty";
  if (input.data.length > MAX_UPLOAD_BYTES) return "file too large (max 512KB)";
  if (!sniffMatches(ext, input.data)) {
    return "file content does not match its extension";
  }
  return null;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Persist bytes under `dir` without ever overwriting: first try the
 * sanitized name, then `-1`, `-2`, … (atomic `wx` create wins the race).
 */
export async function storeUnique(
  dir: string,
  sanitized: string,
  data: Uint8Array,
): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  for (let n = 0; n < 1000; n++) {
    const name = suffixedName(sanitized, n);
    const abs = path.join(dir, name);
    try {
      await fs.writeFile(abs, data, { flag: "wx" });
      return name;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code === "EEXIST") continue;
      throw err;
    }
  }
  throw new Error("could not allocate a unique filename");
}

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminApiAstro(context);
  if (auth instanceof Response) return auth;

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return json({ ok: false, error: "expected multipart form data" }, 400);
  }
  const kind = form.get("kind");
  const file = form.get("file");
  if (typeof kind !== "string" || !(UPLOAD_KINDS as readonly string[]).includes(kind)) {
    return json({ ok: false, error: 'kind must be "logo" or "favicon"' }, 400);
  }
  if (typeof File !== "undefined" ? !(file instanceof File) : !file) {
    return json({ ok: false, error: "file is required" }, 400);
  }
  const upload = file as unknown as File;
  const name = (upload as { name?: unknown }).name;
  if (typeof name !== "string" || name.trim() === "") {
    return json({ ok: false, error: "file is required" }, 400);
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await upload.arrayBuffer());
  } catch {
    return json({ ok: false, error: "could not read file" }, 400);
  }
  const err = validateUpload({ filename: name, data: bytes, kind });
  if (err) return json({ ok: false, error: err }, 400);
  const sanitized = sanitizeBasename(name);
  const dir = resolveUploadDir();
  let stored: string;
  try {
    stored = await storeUnique(dir, sanitized, bytes);
  } catch {
    return json({ ok: false, error: "could not store file" }, 500);
  }
  return json({ ok: true, path: `/uploads/${stored}` }, 200);
};
