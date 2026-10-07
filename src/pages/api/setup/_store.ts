/**
 * Shared file-store helpers for the first-run setup wizard.
 * Same source of truth as /api/admin/settings: `data/settings.json`
 * (plus an opportunistic mirror into the `settings` DB table).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { requireAdminApiAstro } from '../../../lib/auth/guard';
import { SETTING_KEYS, validateSettingsPayload } from '../../../lib/settings';
import { canConfigure, isValidTheme, THEME_KEY } from '../../../lib/theme';

export const SETTINGS_FILE =
  (typeof process !== 'undefined' && process.env.SETTINGS_FILE_PATH) ||
  path.join(process.cwd(), 'data', 'settings.json');

export async function readSetupFile(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const k of SETTING_KEYS) {
      const v = parsed[k];
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return {};
    throw err;
  }
}

export async function writeSetupFile(next: Record<string, string>): Promise<void> {
  await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf8');
}

/** Best-effort mirror into the `settings` DB table (ignored when DB unavailable). */
export async function mirrorToDb(next: Record<string, string>): Promise<void> {
  try {
    const { getDb } = await import('../../../lib/db/adapter');
    const db = getDb({});
    const exec = (db as { execute: (q: unknown) => Promise<unknown> }).execute.bind(db);
    const { sql } = await import('drizzle-orm');
    for (const [k, v] of Object.entries(next)) {
      await exec(
        sql`INSERT INTO settings (key, value) VALUES (${k}, ${v}) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      );
    }
  } catch {
    /* file is source of truth; DB mirror is opportunistic */
  }
}

/** Explicit env record for theme checks (Vite runtime -> Node -> empty). */
export function setupEnv(): Record<string, string | undefined> {
  let viteVal: string | undefined;
  try {
    // @ts-expect-error — import.meta available in Astro/Vite runtime
    viteVal = typeof import.meta !== 'undefined' ? import.meta.env?.SITE_THEME : undefined;
  } catch {
    /* non-Vite runtime */
  }
  const nodeVal =
    typeof process !== 'undefined' ? process.env.SITE_THEME : undefined;
  return { SITE_THEME: viteVal ?? nodeVal };
}

/** True while the wizard is still allowed to run (nothing locked a theme yet). */
export function isUnconfigured(file: Record<string, string>): boolean {
  return canConfigure(file[THEME_KEY] ?? null, setupEnv());
}

export function storedTheme(file: Record<string, string>): string {
  return (file[THEME_KEY] ?? '').trim();
}

/** Existing theme counts only when it is a real value (never blank/invalid). */
export function hasStoredTheme(file: Record<string, string>): boolean {
  return isValidTheme(file[THEME_KEY] ?? '');
}

type AstroGuardContext = Parameters<typeof requireAdminApiAstro>[0];

/**
 * Setup gate: while unconfigured anyone may call; after configuration
 * the caller must be an admin (same guard as the rest of the admin API).
 * Returns null when allowed, otherwise the 401/403 Response to return.
 */
export async function setupOrAdmin(
  context: AstroGuardContext,
  file: Record<string, string>,
): Promise<Response | null> {
  if (isUnconfigured(file)) return null;
  const auth = await requireAdminApiAstro(context);
  if (auth instanceof Response) return auth;
  return null;
}

/** Accept JSON bodies AND plain HTML form posts (single-page wizard). */
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const ct = request.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    try {
      const parsed = (await request.json()) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* fall through to empty */
    }
    return {};
  }
  try {
    const form = await request.formData();
    const out: Record<string, unknown> = {};
    form.forEach((v, k) => {
      out[k] = typeof v === 'string' ? v : String(v);
    });
    return out;
  } catch {
    return {};
  }
}

/** Plain form posts expect a redirect; fetch/JSON callers expect JSON. */
export function wantsHtml(request: Request): boolean {
  const ct = request.headers.get('content-type') ?? '';
  return ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data');
}

export function jsonOk(extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ ok: true, ...extra }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function jsonErr(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Keep only known string settings from a body, trimmed.
 * Empty secrets are dropped (write-only, like the admin dashboard).
 */
export function pickSettings(
  body: Record<string, unknown>,
  keys: readonly string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = body[k];
    if (typeof v !== 'string') continue;
    const trimmed = v.trim();
    if (trimmed === '' && (k === 'tmdb.api_key' || k === 'openrouter.api_key')) continue;
    out[k] = v;
  }
  return out;
}

export function validateOr400(input: Record<string, string>): Response | null {
  const err = validateSettingsPayload(input);
  if (err) return jsonErr(400, err);
  return null;
}
