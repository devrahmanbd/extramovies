import type { NextApiRequest, NextApiResponse } from "next";
import type { APIRoute } from "astro";
import {
  clearSessionCookie,
  destroySession,
  getSessionToken,
} from "../../../lib/auth/session";
import { wrapLegacy } from "../../../lib/api-adapter";

export const prerender = false;

/** POST /api/auth/logout — destroys the member (or admin) session. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }
  destroySession(getSessionToken(req as never));
  clearSessionCookie(res as never);
  return res.status(200).json({ ok: true });
}

export const POST: APIRoute = wrapLegacy(handler as never);
