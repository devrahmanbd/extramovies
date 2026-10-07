import { randomBytes, timingSafeEqual } from "node:crypto";
import { CSRF_HEADER } from "./session";
import type { AdminSession } from "./session";

export function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}

interface CsrfRequestLike {
  headers?: Record<string, unknown> | Headers;
  body?: Record<string, unknown> | null;
  [key: string]: unknown;
}

/** Validate double-submit/synchronizer CSRF token for mutating admin API calls. */
export function validateCsrf(req: CsrfRequestLike, session: AdminSession): boolean {
  let sent = "";
  const headers = req.headers;
  if (headers instanceof Headers) {
    sent =
      headers.get(CSRF_HEADER) ??
      headers.get(CSRF_HEADER.toLowerCase()) ??
      String((req.body as Record<string, unknown> | undefined)?.["_csrf"] ?? "");
  } else {
    sent =
      String(
        (headers as Record<string, unknown> | undefined)?.[CSRF_HEADER] ??
          (headers as Record<string, unknown> | undefined)?.[
            CSRF_HEADER.toLowerCase()
          ] ??
          "",
      ) || String((req.body as Record<string, unknown> | undefined)?.["_csrf"] ?? "");
  }
  if (!sent || !session.csrfToken) return false;
  const a = Buffer.from(sent);
  const b = Buffer.from(session.csrfToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Astro convenience: validate CSRF directly from a Request + session. */
export function validateCsrfAstro(request: Request, session: AdminSession): boolean {
  const sent = request.headers.get(CSRF_HEADER) ?? request.headers.get("x-csrf-token") ?? "";
  if (!sent || !session.csrfToken) return false;
  const a = Buffer.from(sent);
  const b = Buffer.from(session.csrfToken);
  return a.length === b.length && timingSafeEqual(a, b);
}
