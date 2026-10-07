import type { NextApiRequest, NextApiResponse } from "next";
import type { APIRoute } from "astro";
import { createMemberSession, setSessionCookie } from "../../../lib/auth/session";
import {
  getClientIp,
  isRateLimited,
  recordFailedAttempt,
  resetAttempts,
} from "../../../lib/auth/rate-limit";
import { verifyUser } from "../../../lib/users/store";
import { wrapLegacy } from "../../../lib/api-adapter";

export const prerender = false;

async function resolveDb(req: NextApiRequest) {
  const injected = (req as unknown as Record<string, unknown>)["db"];
  if (injected) return injected as never;
  const localsDb = (req as unknown as Record<string, unknown>)["locals"] as
    | { db?: unknown }
    | undefined;
  if (localsDb?.db) return localsDb.db as never;
  const { getDb } = await import("../../../lib/db/adapter");
  return getDb({}) as never;
}

/** POST /api/auth/login {email, password} — generic errors, no enumeration. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }
  const ip = getClientIp(req as never);
  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false, error: "too many attempts, try again later" });
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const email = typeof body["email"] === "string" ? (body["email"] as string) : "";
  const password = typeof body["password"] === "string" ? (body["password"] as string) : "";
  if (!email || !password) {
    recordFailedAttempt(ip);
    return res.status(400).json({ ok: false, error: "email and password required" });
  }

  let user: Awaited<ReturnType<typeof verifyUser>>;
  try {
    user = await verifyUser(await resolveDb(req), email, password);
  } catch {
    return res.status(500).json({ ok: false, error: "login failed" });
  }
  if (!user) {
    recordFailedAttempt(ip);
    return res.status(401).json({ ok: false, error: "invalid credentials" });
  }
  resetAttempts(ip);
  const { token, csrfToken } = createMemberSession(user.id, user.email);
  setSessionCookie(res as never, token);
  return res.status(200).json({ ok: true, handle: user.handle, csrfToken });
}

export const POST: APIRoute = wrapLegacy(handler as never);
