import type { NextApiRequest, NextApiResponse } from "next";
import type { APIRoute } from "astro";
import { requireMemberApi } from "../../../lib/auth/guard";
import { wrapLegacy } from "../../../lib/api-adapter";
import { reportReview } from "../../../lib/members/moderation";
import { isDbUnavailable, resolveMemberDb } from "../../../lib/members/reviews";

export const prerender = false;

/**
 * POST /api/member/report { reviewId, reason } — member-guarded + CSRF.
 * → 200 { ok:true } / 400 invalid reason / self-report / 401 / 404 unknown review.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
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
  const reviewId = body["reviewId"] ?? body["review_id"] ?? body["id"];
  const reason = body["reason"];
  if (typeof reviewId !== "string" || !reviewId.trim()) {
    return res.status(400).json({ ok: false, error: "invalid reviewId" });
  }
  let db;
  try {
    db = resolveMemberDb(req);
  } catch {
    return res.status(503).json({ ok: false, error: "store unavailable" });
  }
  try {
    const out = await reportReview(db, userId, reviewId, reason);
    if (!out.ok) {
      const status =
        out.error === "review not found"
          ? 404
          : out.error === "unauthorized"
            ? 401
            : 400;
      return res.status(status).json({ ok: false, error: out.error });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    if (isDbUnavailable(err)) {
      return res.status(503).json({ ok: false, error: "store unavailable" });
    }
    return res.status(500).json({ ok: false, error: "report failed" });
  }
}

export default handler;

export const POST: APIRoute = wrapLegacy(handler as never);
