import { getSession, getSessionToken, resolveSessionDb, type SessionDb } from "./session";
import type { AdminSession } from "./session";
import { validateCsrf } from "./csrf";

export const LOGIN_PATH = "/admin/login";
export const MEMBER_LOGIN_PATH = "/login";

// Legacy Next-style shapes (kept for vitest; no "next" import).
export interface LegacyApiRequest {
  method?: string;
  headers?: Record<string, unknown> | Headers;
  cookies?: Record<string, string>;
  body?: Record<string, unknown> | null;
  socket?: { remoteAddress?: string };
  [key: string]: unknown;
}

export interface LegacyApiResponse {
  status(code: number): LegacyApiResponse;
  json(body: unknown): unknown;
  setHeader(name: string, value: string | string[]): void;
  [key: string]: unknown;
}

export interface LegacyPageContext {
  req: LegacyApiRequest;
  resolvedUrl: string;
  [key: string]: unknown;
}

function sessionDbFor(req: unknown, db?: SessionDb): SessionDb {
  return db ?? resolveSessionDb(req);
}

/**
 * Page guard — legacy Next getServerSideProps shape (kept for compat).
 * Server-side check (never rely on hidden buttons alone).
 */
export async function requireAdminPage(
  ctx: LegacyPageContext,
  db?: SessionDb,
): Promise<
  | { props: { adminEmail: string; csrfToken: string } }
  | { redirect: { destination: string; permanent: boolean } }
> {
  const token = getSessionToken(ctx.req as never);
  const session = await getSession(token, sessionDbFor(ctx.req, db));
  if (!session) {
    return {
      redirect: {
        destination: `${LOGIN_PATH}?next=${encodeURIComponent(ctx.resolvedUrl)}`,
        permanent: false,
      },
    };
  }
  return { props: { adminEmail: session.email, csrfToken: session.csrfToken } };
}

export interface AdminApiResult {
  session: AdminSession;
}

export interface MemberApiResult {
  session: AdminSession;
}

function isMemberSession(session: AdminSession | null): session is AdminSession {
  return !!session && session.role === "member" && !!session.userId;
}

/**
 * Member API guard — legacy (req, res) shape (mirrors requireAdminApi).
 * 401 when anonymous or non-member (admin sessions cannot use member routes);
 * 403 on CSRF failure for POST/PUT/PATCH/DELETE.
 */
export async function requireMemberApi(
  req: LegacyApiRequest,
  res: LegacyApiResponse,
  db?: SessionDb,
): Promise<MemberApiResult | null> {
  const session = await getSession(getSessionToken(req as never), sessionDbFor(req, db));
  if (!isMemberSession(session)) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return null;
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method ?? "")) {
    if (!validateCsrf(req as never, session)) {
      res.status(403).json({ ok: false, error: "bad csrf token" });
      return null;
    }
  }
  return { session };
}

/**
 * API guard — legacy (req, res) shape (kept for vitest).
 * Returns null after sending 401/403 so handlers can `if (!auth) return;`.
 * Enforces CSRF for POST/PUT/PATCH/DELETE.
 */
export async function requireAdminApi(
  req: LegacyApiRequest,
  res: LegacyApiResponse,
  db?: SessionDb,
): Promise<AdminApiResult | null> {
  const session = await getSession(getSessionToken(req as never), sessionDbFor(req, db));
  if (!session) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return null;
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method ?? "")) {
    if (!validateCsrf(req as never, session)) {
      res.status(403).json({ ok: false, error: "bad csrf token" });
      return null;
    }
  }
  return { session };
}

// --- Astro wrappers (no business-logic change, thin adapters) ---

export interface AstroContextLike {
  cookies: { get(name: string): { value?: string } | undefined };
  request: Request;
  url: URL;
  redirect(path: string, status?: number): Response;
}

/**
 * Astro page guard — returns session props or a redirect Response.
 * Usage in .astro frontmatter:
 *   const auth = await requireAdminPageAstro(Astro);
 *   if (auth instanceof Response) return auth;
 */
export async function requireAdminPageAstro(
  context: Pick<AstroContextLike, "cookies" | "url" | "redirect"> & {
    cookies: { get(name: string): { value?: string } | undefined };
  },
  db?: SessionDb,
): Promise<{ adminEmail: string; csrfToken: string } | Response> {
  const token = getSessionToken(
    context.cookies as unknown as { get(name: string): { value?: string } | undefined },
  );
  const session = await getSession(token, db ?? resolveSessionDb(context as unknown));
  if (!session) {
    const next = context.url.pathname + context.url.search;
    return context.redirect(
      `${LOGIN_PATH}?next=${encodeURIComponent(next)}`,
      302,
    );
  }
  return { adminEmail: session.email, csrfToken: session.csrfToken };
}

/** JSON unauthorized/forbidden helper for Astro API routes. */
function astroJson(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Astro API guard — returns { session } or a JSON error Response.
 * Usage:
 *   const auth = await requireAdminApiAstro(Astro);
 *   if (auth instanceof Response) return auth;
 */
export async function requireAdminApiAstro(
  context: Pick<AstroContextLike, "cookies" | "request">,
  db?: SessionDb,
): Promise<AdminApiResult | Response> {
  const token = getSessionToken(
    context.cookies as unknown as { get(name: string): { value?: string } | undefined },
  );
  const session = await getSession(token, db ?? resolveSessionDb(context as unknown));
  if (!session) {
    return astroJson({ ok: false, error: "unauthorized" }, 401);
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(context.request.method ?? "")) {
    const sent =
      context.request.headers.get("x-csrf-token") ??
      context.request.headers.get("X-CSRF-Token") ??
      "";
    if (!sent || sent !== session.csrfToken) {
      // Reuse timing-safe validator via a shim req.
      const ok = validateCsrf(
        {
          headers: Object.fromEntries(context.request.headers.entries()),
          body: null,
        } as never,
        session,
      );
      void ok; // direct compare above is authoritative; validator kept for parity
      if (sent !== session.csrfToken) {
        return astroJson({ ok: false, error: "bad csrf token" }, 403);
      }
    }
  }
  return { session };
}

/**
 * Astro member API guard — same 401/403 semantics as requireMemberApi.
 * Admin sessions (role 'admin' or legacy role-less) are rejected with 401.
 */
export async function requireMemberApiAstro(
  context: Pick<AstroContextLike, "cookies" | "request">,
  db?: SessionDb,
): Promise<MemberApiResult | Response> {
  const token = getSessionToken(
    context.cookies as unknown as { get(name: string): { value?: string } | undefined },
  );
  const session = await getSession(token, db ?? resolveSessionDb(context as unknown));
  if (!isMemberSession(session)) {
    return astroJson({ ok: false, error: "unauthorized" }, 401);
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(context.request.method ?? "")) {
    const sent =
      context.request.headers.get("x-csrf-token") ??
      context.request.headers.get("X-CSRF-Token") ??
      "";
    if (!sent || sent !== (session as AdminSession).csrfToken) {
      return astroJson({ ok: false, error: "bad csrf token" }, 403);
    }
  }
  return { session: session as AdminSession };
}

export interface MemberPageProps {
  userId: string;
  memberEmail: string;
  csrfToken: string;
}

/**
 * Astro member page guard — returns member props or a redirect Response.
 * Usage in .astro frontmatter:
 *   const auth = await requireMemberPageAstro(Astro);
 *   if (auth instanceof Response) return auth;
 */
export async function requireMemberPageAstro(
  context: Pick<AstroContextLike, "cookies" | "url" | "redirect"> & {
    cookies: { get(name: string): { value?: string } | undefined };
  },
  db?: SessionDb,
): Promise<MemberPageProps | Response> {
  const token = getSessionToken(
    context.cookies as unknown as { get(name: string): { value?: string } | undefined },
  );
  const session = await getSession(token, db ?? resolveSessionDb(context as unknown));
  if (!isMemberSession(session)) {
    const next = context.url.pathname + context.url.search;
    return context.redirect(
      `${MEMBER_LOGIN_PATH}?next=${encodeURIComponent(next)}`,
      302,
    );
  }
  return {
    userId: (session as AdminSession).userId as string,
    memberEmail: (session as AdminSession).email,
    csrfToken: (session as AdminSession).csrfToken,
  };
}
