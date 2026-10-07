import type { NextApiRequest, NextApiResponse } from "next";
import type { APIRoute } from "astro";
import { requireMemberApi } from "../../lib/auth/guard";
import { wrapLegacy } from "../../lib/api-adapter";
import { counts, toggleFollow } from "../../lib/members/follows";
import { getUserByHandle } from "../../lib/users/store";
import { isDbUnavailable, resolveMemberDb } from "../../lib/members/reviews";

export const prerender = false;

/**
 * POST /api/follow { handle } — member-guarded + CSRF toggle.
 * → 200 { ok, following, followers } (followers = followee's new total).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }
  const auth = requireMemberApi(req as never, res as never);
  if (!auth) return;
  const userId = auth.session.userId;
  if (!userId) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  const body = ((req.body ?? {}) as Record<string, unknown>);
  const handle = body["handle"];
  if (typeof handle !== "string" || !handle.trim()) {
    return res.status(400).json({ ok: false, error: "invalid handle" });
  }
  let db;
  try {
    db = resolveMemberDb(req);
  } catch {
    return res.status(503).json({ ok: false, error: "store unavailable" });
  }
  try {
    const toggled = await toggleFollow(db, userId, handle);
    if (!toggled.ok) {
      const status = toggled.error === "user not found" ? 404 : 400;
      return res.status(status).json({ ok: false, error: toggled.error });
    }
    const followee = await getUserByHandle(db as never, handle);
    const followers = followee ? (await counts(db, followee.id)).followers : 0;
    return res.status(200).json({ ok: true, following: toggled.following, followers });
  } catch (err) {
    if (isDbUnavailable(err)) {
      return res.status(503).json({ ok: false, error: "store unavailable" });
    }
    return res.status(500).json({ ok: false, error: "follow failed" });
  }
}

export const POST: APIRoute = wrapLegacy(handler as never);
