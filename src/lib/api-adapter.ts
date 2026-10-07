/**
 * api-adapter — bridge legacy Next-style (req, res) handlers to Astro APIRoute.
 * Keeps business logic in the default handler (vitest-compatible) while
 * exposing GET/POST wrappers that Astro's Cloudflare adapter can build.
 */
import type { APIRoute } from "astro";

interface FakeRes {
  statusCode: number;
  body: unknown;
  headers: Record<string, string | string[]>;
  rawSend?: unknown;
  status(code: number): FakeRes;
  json(payload: unknown): FakeRes;
  send(payload: unknown): FakeRes;
  setHeader(k: string, v: string | string[]): void;
}

function makeFakeRes(): FakeRes {
  const headers: Record<string, string | string[]> = {};
  const res: FakeRes = {
    statusCode: 200,
    body: null,
    headers,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
    send(payload: unknown) {
      res.rawSend = payload;
      res.body = payload;
      return res;
    },
    setHeader(k: string, v: string | string[]) {
      headers[k] = v;
    },
  };
  return res;
}

function toResponse(fake: FakeRes): Response {
  const headers = new Headers();
  for (const [k, v] of Object.entries(fake.headers)) {
    if (Array.isArray(v)) {
      for (const item of v) headers.append(k, item);
    } else {
      headers.set(k, v);
    }
  }
  const body = fake.rawSend;
  if (typeof body === "string") {
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    // rawSend may already be a JSON string (backup/export) — pass through.
    return new Response(body, { status: fake.statusCode, headers });
  }
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(fake.body ?? null), {
    status: fake.statusCode,
    headers,
  });
}

function queryFromUrl(url: URL): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {};
  for (const [k, v] of url.searchParams.entries()) {
    const existing = out[k];
    if (existing === undefined) out[k] = v;
    else if (Array.isArray(existing)) existing.push(v);
    else out[k] = [existing as string, v];
  }
  return out;
}

function headersToRecord(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  request.headers.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

function cookiesToRecord(cookieHeader: string, astroCookies?: {
  get(name: string): { value?: string } | undefined;
}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  // Astro cookies.get is authoritative when present.
  try {
    const get = astroCookies?.get?.bind(astroCookies) as
      | ((name: string) => { value?: string } | undefined)
      | undefined;
    if (get) {
      // Probe common session cookie without knowing all names: copy known key.
      const known = get("admin_session");
      if (known?.value) out["admin_session"] = known.value;
    }
  } catch {
    /* ignore */
  }
  return out;
}

type LegacyHandler = (req: never, res: never) => unknown | Promise<unknown>;

/**
 * Wrap a legacy default handler as an Astro APIRoute handler.
 * Reads method/query/body/headers/cookies from the Astro context and
 * replays them into the Next-style shape the handler expects.
 */
export function wrapLegacy(
  handler: LegacyHandler,
  opts?: { allowMethods?: string[] },
): APIRoute {
  return async (context) => {
    const { request, url, cookies } = context;
    let body: unknown = undefined;
    if (request.method !== "GET" && request.method !== "HEAD") {
      const text = await request.text().catch(() => "");
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      } else {
        body = {};
      }
    }
    const cookieHeader = request.headers.get("cookie") ?? "";
    const headersRecord = headersToRecord(request);
    // Preserve original casing some guards expect.
    for (const [k, v] of request.headers.entries()) {
      headersRecord[k] = v;
    }
    const csrfDirect =
      request.headers.get("x-csrf-token") ?? request.headers.get("X-CSRF-Token");
    if (csrfDirect) {
      headersRecord["x-csrf-token"] = csrfDirect;
      headersRecord["X-CSRF-Token"] = csrfDirect;
    }
    const reqShape = {
      method: request.method,
      query: queryFromUrl(url),
      body: body ?? {},
      headers: { ...headersRecord, cookie: cookieHeader },
      cookies: cookiesToRecord(cookieHeader, cookies as never),
      socket: { remoteAddress: request.headers.get("x-forwarded-for") ?? "unknown" },
      url: url.pathname + url.search,
      // Forward Astro locals so legacy handlers can resolve request-scoped
      // resources (tests inject req.db; Cloudflare provides
      // locals.runtime.env.DB for D1-backed stores like sessions).
      locals: (context.locals ?? {}) as Record<string, unknown>,
      db: (context.locals as Record<string, unknown> | undefined)?.["db"],
      env: (
        (context.locals as Record<string, unknown> | undefined)?.["runtime"] as
          | { env?: Record<string, unknown> }
          | undefined
      )?.env,
    };
    const fake = makeFakeRes();
    await (handler as (r: unknown, s: unknown) => unknown)(
      reqShape as never,
      fake as never,
    );
    void opts;
    return toResponse(fake);
  };
}
