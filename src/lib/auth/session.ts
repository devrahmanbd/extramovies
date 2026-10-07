import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { dbExecute, getDb, resolveDbFromRequest, type AppDb } from "../db/adapter";

// Framework-free minimal shapes (no "next" import). Legacy Next-style
// (req.cookies / req.headers.cookie) and Astro (cookies.get / cookie header
// string) are both accepted so vitest (Next-style) and Astro runtime coexist.
export const SESSION_COOKIE = "admin_session";
export const CSRF_HEADER = "x-csrf-token";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

export interface AdminSession {
  email: string;
  csrfToken: string;
  createdAt: number;
  expiresAt: number;
  userId?: string;
  role?: 'admin' | 'member';
}

/**
 * Anything dbExecute accepts: drizzle D1 / better-sqlite3 sessions, or test
 * doubles exposing { execute } / { all }. Mirrors src/lib/members/* MemberDb.
 */
export type SessionDb =
  | AppDb
  | { execute: (q: unknown) => unknown }
  | { all: (q: unknown) => unknown };

interface SessionRow {
  token: string;
  email: string;
  user_id: string | null;
  role: string;
  csrf_token: string;
  created_at: string;
  expires_at: string;
}

// The migration (migrations/0006_sessions.sql) is the source of truth; this
// idempotent guard only guarantees forward progress when the migration has
// not been applied yet (e.g. a pre-0006 dev DB). Cached per db object.
const ensured = new WeakMap<object, boolean>();

async function ensureSessionsTable(db: SessionDb): Promise<void> {
  if (ensured.get(db as object)) return;
  // Statement-at-a-time: D1/drizzle execute a single statement per call.
  await dbExecute(db as never, sql.raw(`CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  user_id TEXT NULL,
  role TEXT NOT NULL,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
)`));
  await dbExecute(
    db as never,
    sql.raw(`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`),
  );
  ensured.set(db as object, true);
}

function toSession(row: SessionRow): AdminSession {
  return {
    email: row.email,
    csrfToken: row.csrf_token,
    createdAt: Date.parse(row.created_at),
    expiresAt: Date.parse(row.expires_at),
    ...(row.user_id ? { userId: row.user_id } : {}),
    role: row.role === "member" ? "member" : "admin",
  };
}

/**
 * Resolve the session DB for handlers/pages (launch L1F: delegates to the
 * shared resolveDbFromRequest so writes and reads share one database).
 * Priority (mirrors resolveMemberDb + Cloudflare wiring):
 *   req.db / req.locals.db (tests + middleware)
 *   → req.locals.runtime.env / req.env (Astro Cloudflare adapter / D1 binding;
 *      authoritative only when no DB_FILE is configured, i.e. Workers prod)
 *   → getDb({}) (local SQLite fallback).
 */
export function resolveSessionDb(req?: unknown): SessionDb {
  return resolveDbFromRequest(req) as SessionDb;
}

/** Astro/SSR convenience: resolve the session DB from the Astro context. */
export function sessionDbFromAstro(
  context: { locals?: unknown },
): SessionDb {
  return resolveSessionDb(context as unknown);
}

function dbOrDefault(db?: SessionDb): SessionDb {
  return db ?? (getDb({}) as SessionDb);
}

export async function createSession(
  email: string,
  db?: SessionDb,
): Promise<{ token: string; csrfToken: string }> {
  const d = dbOrDefault(db);
  await ensureSessionsTable(d);
  const token = randomBytes(32).toString("hex");
  const csrfToken = randomBytes(32).toString("hex");
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const expiresIso = new Date(nowMs + SESSION_TTL_MS).toISOString();
  await dbExecute(
    d as never,
    sql`INSERT INTO sessions (token, email, user_id, role, csrf_token, created_at, expires_at)
         VALUES (${token}, ${email}, ${null}, ${"admin"}, ${csrfToken}, ${nowIso}, ${expiresIso})`,
  );
  return { token, csrfToken };
}

/** Member session — same 12h TTL + own CSRF, tagged role 'member' + userId. */
export async function createMemberSession(
  userId: string,
  email: string,
  db?: SessionDb,
): Promise<{ token: string; csrfToken: string }> {
  const d = dbOrDefault(db);
  await ensureSessionsTable(d);
  const token = randomBytes(32).toString("hex");
  const csrfToken = randomBytes(32).toString("hex");
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const expiresIso = new Date(nowMs + SESSION_TTL_MS).toISOString();
  await dbExecute(
    d as never,
    sql`INSERT INTO sessions (token, email, user_id, role, csrf_token, created_at, expires_at)
         VALUES (${token}, ${email.trim().toLowerCase()}, ${userId}, ${"member"}, ${csrfToken}, ${nowIso}, ${expiresIso})`,
  );
  return { token, csrfToken };
}

export async function getSession(
  token: string | undefined | null,
  db?: SessionDb,
): Promise<AdminSession | null> {
  if (!token) return null;
  const d = dbOrDefault(db);
  await ensureSessionsTable(d);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  // Lazy sweep of expired rows on read (best-effort; never fails the read).
  try {
    await dbExecute(d as never, sql`DELETE FROM sessions WHERE expires_at <= ${nowIso}`);
  } catch {
    /* fall through to the point read */
  }
  const rows = await dbExecute<SessionRow>(
    d as never,
    sql`SELECT token, email, user_id, role, csrf_token, created_at, expires_at
         FROM sessions WHERE token = ${token} LIMIT 1`,
  );
  const row = rows[0];
  if (!row) return null;
  const expiresMs = Date.parse(row.expires_at);
  if (!Number.isFinite(expiresMs) || nowMs > expiresMs) {
    try {
      await dbExecute(d as never, sql`DELETE FROM sessions WHERE token = ${token}`);
    } catch {
      /* already treated as expired */
    }
    return null;
  }
  return toSession(row);
}

export async function destroySession(
  token: string | undefined | null,
  db?: SessionDb,
): Promise<void> {
  if (!token) return;
  const d = dbOrDefault(db);
  await ensureSessionsTable(d);
  await dbExecute(d as never, sql`DELETE FROM sessions WHERE token = ${token}`);
}

/**
 * Purge all expired rows. Returns the number purged.
 * getSession() already sweeps lazily; call this from a cron/scheduled
 * path when steady-state hygiene matters.
 */
export async function clearExpired(db?: SessionDb): Promise<number> {
  const d = dbOrDefault(db);
  await ensureSessionsTable(d);
  const nowIso = new Date().toISOString();
  const stale = await dbExecute<{ token: string }>(
    d as never,
    sql`SELECT token FROM sessions WHERE expires_at <= ${nowIso}`,
  );
  if (stale.length === 0) return 0;
  await dbExecute(d as never, sql`DELETE FROM sessions WHERE expires_at <= ${nowIso}`);
  return stale.length;
}

function isSecure(): boolean {
  return process.env.NODE_ENV === "production";
}

function buildSetCookie(token: string, maxAge: number): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (isSecure()) parts.push("Secure");
  return parts.join("; ");
}

export function sessionCookieHeader(token: string): string {
  return buildSetCookie(token, Math.floor(SESSION_TTL_MS / 1000));
}

export function clearSessionCookieHeader(): string {
  return buildSetCookie("", 0);
}

// --- Legacy Next-style res compat (kept for vitest) ---
export interface LegacyApiResponse {
  setHeader(name: string, value: string | string[]): void;
  [key: string]: unknown;
}

interface AstroCookiesLike {
  set(name: string, value: string, options?: Record<string, unknown>): void;
  delete(name: string, options?: Record<string, unknown>): void;
}

// Overloads: legacy (res, token) + Astro cookies + header-string builder.
// Keep old signature first so existing call sites/tests typecheck unchanged.
export function setSessionCookie(res: LegacyApiResponse, token: string): void;
export function setSessionCookie(cookies: AstroCookiesLike, token: string): void;
export function setSessionCookie(
  target: LegacyApiResponse | AstroCookiesLike,
  token: string,
): void {
  const header = sessionCookieHeader(token);
  if (typeof (target as AstroCookiesLike).set === "function") {
    (target as AstroCookiesLike).set(SESSION_COOKIE, token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
      secure: isSecure(),
    });
    return;
  }
  (target as LegacyApiResponse).setHeader("Set-Cookie", header);
}

export function clearSessionCookie(res: LegacyApiResponse): void;
export function clearSessionCookie(cookies: AstroCookiesLike): void;
export function clearSessionCookie(target: LegacyApiResponse | AstroCookiesLike): void {
  if (typeof (target as AstroCookiesLike).delete === "function") {
    (target as AstroCookiesLike).delete(SESSION_COOKIE, { path: "/" });
    return;
  }
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (isSecure()) parts.push("Secure");
  (target as LegacyApiResponse).setHeader("Set-Cookie", parts.join("; "));
}

// --- Token extraction: Next req, Astro cookies, cookie-header string ---
export interface LegacyApiRequest {
  headers?: Record<string, unknown> | Headers;
  cookies?: Record<string, string>;
  [key: string]: unknown;
}

function parseCookieHeader(header: string): string | null {
  const m = header.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1] as string) : null;
}

export function getSessionToken(
  req: LegacyApiRequest | { cookies?: unknown; request?: unknown } | string | null | undefined,
): string | null;
export function getSessionToken(cookieHeader: string | null | undefined): string | null;
export function getSessionToken(input: unknown): string | null {
  if (!input) return null;
  if (typeof input === "string") {
    // Bare cookie header string (Astro: request.headers.get("cookie")).
    return parseCookieHeader(input);
  }
  const obj = input as Record<string, unknown>;
  // Astro APIContext shape: { cookies, request }.
  const astroCookies = obj["cookies"] as
    | { get?: (name: string) => { value?: string } | undefined }
    | Record<string, string>
    | undefined;
  if (astroCookies && typeof (astroCookies as { get?: unknown }).get === "function") {
    const v = (astroCookies as { get: (n: string) => { value?: string } | undefined }).get(
      SESSION_COOKIE,
    );
    if (v?.value) return v.value;
    // Fall through to request headers (Astro context also carries request).
  }
  // AstroCookies passed directly: { get(name) }.
  // NOTE: Astro's AstroCookies class also exposes a `headers()` method
  // (outgoing Set-Cookie values), so we must NOT exclude objects with
  // a `headers` key here — otherwise real page loads never find the session.
  if (typeof (obj as { get?: unknown }).get === "function") {
    const v = (obj as { get: (n: string) => { value?: string } | undefined }).get(
      SESSION_COOKIE,
    );
    if (v?.value) return v.value;
    // No cookie found via .get() — fall through to request headers below
    // (Astro context shape { cookies, request } lands here too).
    if (!("headers" in obj) && !("request" in obj)) return null;
  }
  // Next.js shape: req.cookies; fall back to manual Cookie header parse.
  const cookiesRecord = obj["cookies"] as Record<string, string> | undefined;
  const fromCookies =
    cookiesRecord && typeof cookiesRecord === "object" && !("get" in (cookiesRecord as object))
      ? (cookiesRecord as Record<string, string>)[SESSION_COOKIE]
      : undefined;
  if (fromCookies) return fromCookies;
  const headers = obj["headers"] as Record<string, unknown> | Headers | undefined;
  let header = "";
  if (headers instanceof Headers) {
    header = headers.get("cookie") ?? "";
  } else if (headers && typeof headers === "object") {
    header = String((headers as Record<string, unknown>)["cookie"] ?? "");
  } else if (obj["request"] instanceof Request) {
    header = (obj["request"] as Request).headers.get("cookie") ?? "";
  } else if (
    obj["request"] &&
    typeof obj["request"] === "object" &&
    (obj["request"] as { headers?: unknown }).headers instanceof Headers
  ) {
    header =
      ((obj["request"] as { headers: Headers }).headers.get("cookie") ?? "") as string;
  }
  if (!header && obj["request"] instanceof Request) {
    header = obj["request"].headers.get("cookie") ?? "";
  }
  return header ? parseCookieHeader(header) : null;
}

/** Astro convenience: extract session from APIContext or Request. */
export async function getSessionFromAstro(
  context: { cookies?: unknown; request?: Request; locals?: unknown },
  db?: SessionDb,
): Promise<AdminSession | null> {
  return getSession(
    getSessionToken(context as unknown as LegacyApiRequest),
    db ?? resolveSessionDb(context as unknown),
  );
}
