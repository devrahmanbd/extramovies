import type { NextApiRequest, NextApiResponse } from "next";
import type { APIRoute } from "astro";
import { createMemberSession, setSessionCookie } from "../../../lib/auth/session";
import { getClientIp } from "../../../lib/auth/rate-limit";
import { createUser } from "../../../lib/users/store";
import {
  validateDisplayName,
  validateEmail,
  validateHandle,
  validatePassword,
} from "../../../lib/users/validate";
import { wrapLegacy } from "../../../lib/api-adapter";

export const prerender = false;

// Signup throttle: max 5/hour per IP (own tiny in-memory map, per contract).
const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
const SIGNUP_MAX = 5;
const signupAttempts = new Map<string, number[]>();

function pruneSignup(ip: string, now: number): number[] {
  const list = (signupAttempts.get(ip) ?? []).filter((t) => now - t < SIGNUP_WINDOW_MS);
  signupAttempts.set(ip, list);
  return list;
}

export function __clearSignupThrottle(): void {
  signupAttempts.clear();
}

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

/** POST /api/auth/signup {handle, displayName, email, password} → auto-login. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }
  const ip = getClientIp(req as never);
  const recent = pruneSignup(ip, Date.now());
  if (recent.length >= SIGNUP_MAX) {
    return res.status(429).json({ ok: false, error: "too many attempts, try again later" });
  }
  recent.push(Date.now());
  signupAttempts.set(ip, recent);

  const body = (req.body ?? {}) as Record<string, unknown>;
  const handle = typeof body["handle"] === "string" ? (body["handle"] as string) : "";
  const displayName =
    typeof body["displayName"] === "string"
      ? (body["displayName"] as string)
      : typeof body["display_name"] === "string"
        ? (body["display_name"] as string)
        : "";
  const email = typeof body["email"] === "string" ? (body["email"] as string) : "";
  const password = typeof body["password"] === "string" ? (body["password"] as string) : "";

  const checks = [
    validateHandle(handle.trim().toLowerCase()),
    validateDisplayName(displayName),
    validateEmail(email),
    validatePassword(password),
  ];
  for (const c of checks) {
    if (!c.ok) return res.status(400).json({ ok: false, error: (c as { error: string }).error });
  }

  let result: Awaited<ReturnType<typeof createUser>>;
  try {
    result = await createUser(await resolveDb(req), { handle, displayName, email, password });
  } catch {
    return res.status(500).json({ ok: false, error: "signup failed" });
  }
  if (!result.ok) {
    const err = (result as { error: string }).error;
    if (err === "handle taken" || err === "email registered") {
      return res.status(409).json({ ok: false, error: err });
    }
    return res.status(400).json({ ok: false, error: err });
  }

  const { token, csrfToken } = createMemberSession(result.user.id, result.user.email);
  setSessionCookie(res as never, token);
  return res.status(200).json({ ok: true, handle: result.user.handle, csrfToken });
}

export const POST: APIRoute = wrapLegacy(handler as never);
