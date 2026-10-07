import type { NextApiRequest, NextApiResponse } from "next";
import type { APIRoute } from "astro";
import { verifyAdminCredentials } from "../../../lib/auth/password";
import { createSession, resolveSessionDb, setSessionCookie } from "../../../lib/auth/session";
import { getClientIp, isRateLimited, recordFailedAttempt, resetAttempts } from "../../../lib/auth/rate-limit";
import { wrapLegacy } from "../../../lib/api-adapter";

export const prerender = false;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }
  const ip = getClientIp(req as never);
  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false, error: "too many attempts, try again later" });
  }
  const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
  if (typeof email !== "string" || typeof password !== "string") {
    recordFailedAttempt(ip);
    return res.status(400).json({ ok: false, error: "email and password required" });
  }
  const ok = await verifyAdminCredentials(email, password);
  if (!ok) {
    recordFailedAttempt(ip);
    // Generic message — don't reveal whether email or password was wrong.
    return res.status(401).json({ ok: false, error: "invalid credentials" });
  }
  resetAttempts(ip);
  const { token, csrfToken } = await createSession(
    email.trim().toLowerCase(),
    resolveSessionDb(req as never),
  );
  setSessionCookie(res as never, token);
  return res.status(200).json({ ok: true, csrfToken });
}

export const POST: APIRoute = wrapLegacy(handler as never);
export const GET: APIRoute = wrapLegacy(handler as never);
