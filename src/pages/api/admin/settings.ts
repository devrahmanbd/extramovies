import type { NextApiRequest, NextApiResponse } from "next";
import type { APIRoute } from "astro";
import { promises as fs } from "node:fs";
import path from "node:path";
import { requireAdminApi } from "../../../lib/auth/guard";
import { wrapLegacy } from "../../../lib/api-adapter";
import {
  SECRET_KEYS,
  SETTING_KEYS,
  effective,
  maskSecret,
  validateSettingsPayload,
  type SettingKey,
} from "../../../lib/settings";

export const prerender = false;

const SETTINGS_FILE =
  process.env.SETTINGS_FILE_PATH ??
  path.join(process.cwd(), "data", "settings.json");

async function readFileSettings(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const k of SETTING_KEYS) {
      const v = parsed[k];
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return {};
    throw err;
  }
}

async function writeFileSettings(next: Record<string, string>): Promise<void> {
  await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2), "utf8");
}

/** Best-effort mirror into the `settings` DB table (ignored when DB unavailable). */
async function mirrorToDb(next: Record<string, string>): Promise<void> {
  try {
    const { getDb } = await import("../../../lib/db/adapter");
    const db = getDb({});
    const exec = (db as { execute: (q: unknown) => Promise<unknown> }).execute.bind(db);
    const { sql } = await import("drizzle-orm");
    for (const [k, v] of Object.entries(next)) {
      await exec(sql`INSERT INTO settings (key, value) VALUES (${k}, ${v}) ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
    }
  } catch { /* file is source of truth; DB mirror is opportunistic */ }
}

function isMaskedPlaceholder(v: string): boolean {
  return v.startsWith('••••');
}

/**
 * GET /api/admin/settings — dashboard values.
 * Secrets are masked (never returned in full); `configured` flags tell the UI
 * whether a value exists. Non-secrets are returned in full (effective values).
 */
async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireAdminApi(req as never, res as never);
  if (!auth) return;
  const file = await readFileSettings();
  const values: Record<string, string> = {};
  const configured: Record<string, boolean> = {};
  for (const key of SETTING_KEYS) {
    const full = effective(key, file[key]);
    configured[key] = full.trim() !== '';
    values[key] = (SECRET_KEYS as readonly string[]).includes(key) ? maskSecret(full) : full;
  }
  return res.status(200).json({ ok: true, values, configured });
}

/**
 * POST /api/admin/settings — save dashboard values (partial allowed).
 * Blank secrets / masked placeholders keep the existing value.
 */
async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireAdminApi(req as never, res as never);
  if (!auth) return;
  const body = ((req.body ?? {}) as Record<string, unknown>);
  const input: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === 'string') input[k] = v;
  }
  const err = validateSettingsPayload(input);
  if (err) return res.status(400).json({ ok: false, error: err });

  const current = await readFileSettings();
  const next: Record<string, string> = { ...current };
  for (const [k, v] of Object.entries(input)) {
    const key = k as SettingKey;
    const val = v.trim();
    if ((SECRET_KEYS as readonly string[]).includes(k)) {
      // Blank or placeholder = keep existing (secrets are write-only).
      if (val === '' || isMaskedPlaceholder(val)) continue;
    }
    if (val === '' && current[key] === undefined) {
      // Don't persist empty defaults for never-set keys.
      continue;
    }
    next[key] = v;
  }
  await writeFileSettings(next);
  await mirrorToDb(next);
  return res.status(200).json({ ok: true });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") return handleGet(req, res);
  if (req.method === "POST") return handlePost(req, res);
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "method not allowed" });
}

export const GET: APIRoute = wrapLegacy(handler as never);
export const POST: APIRoute = wrapLegacy(handler as never);
