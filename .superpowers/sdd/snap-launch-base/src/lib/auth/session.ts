import { randomBytes } from "node:crypto";

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

// In-memory store. Single-admin, single-instance is fine for foundation.
// TODO(foundation): swap for Redis/DB-backed store before multi-instance deploy.
const store = new Map<string, AdminSession>();

export function createSession(email: string): { token: string; csrfToken: string } {
  const token = randomBytes(32).toString("hex");
  const csrfToken = randomBytes(32).toString("hex");
  const now = Date.now();
  store.set(token, { email, csrfToken, createdAt: now, expiresAt: now + SESSION_TTL_MS, role: "admin" });
  return { token, csrfToken };
}

/** Member session — same 12h TTL + own CSRF, tagged role 'member' + userId. */
export function createMemberSession(
  userId: string,
  email: string,
): { token: string; csrfToken: string } {
  const token = randomBytes(32).toString("hex");
  const csrfToken = randomBytes(32).toString("hex");
  const now = Date.now();
  store.set(token, {
    email: email.trim().toLowerCase(),
    csrfToken,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    userId,
    role: "member",
  });
  return { token, csrfToken };
}

export function getSession(token: string | undefined | null): AdminSession | null {
  if (!token) return null;
  const s = store.get(token);
  if (!s) return null;
  if (Date.now() > s.expiresAt) {
    store.delete(token);
    return null;
  }
  return s;
}

export function destroySession(token: string | undefined | null): void {
  if (!token) return;
  store.delete(token);
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
export function getSessionFromAstro(
  context: { cookies?: unknown; request?: Request },
  ): AdminSession | null {
  return getSession(getSessionToken(context as unknown as LegacyApiRequest));
}
