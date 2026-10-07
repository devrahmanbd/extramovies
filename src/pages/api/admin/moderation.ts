import type { NextApiRequest, NextApiResponse } from "next";
import type { APIRoute } from "astro";
import { requireAdminApi } from "../../../lib/auth/guard";
import { wrapLegacy } from "../../../lib/api-adapter";
import { listFlagged, setReviewStatus } from "../../../lib/members/moderation";
import { isDbUnavailable, resolveMemberDb } from "../../../lib/members/reviews";

export const prerender = false;

/**
 * POST /api/admin/moderation — admin-guarded + CSRF.
 *   { action:'list' } → 200 { ok, items:[{id,tmdbId,rating,title,handle,reports,createdAt,status}] }
 *   { action:'hide'|'show', id } → 200 { ok, status:'hidden'|'visible' }.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }
  const auth = await requireAdminApi(req as never, res as never);
  if (!auth) return;
  const body = ((req.body ?? {}) as Record<string, unknown>);
  const action = body["action"];
  let db;
  try {
    db = resolveMemberDb(req);
  } catch {
    return res.status(503).json({ ok: false, error: "store unavailable" });
  }
  try {
    if (action === "list") {
      const flagged = await listFlagged(db);
      return res.status(200).json({
        ok: true,
        items: flagged.map((f) => ({
          id: f.id,
          tmdbId: f.tmdbId,
          rating: f.rating,
          title: f.title,
          handle: f.handle,
          reports: f.reports,
          createdAt: f.createdAt,
          status: f.status,
        })),
      });
    }
    if (action === "hide" || action === "show") {
      const id = body["id"];
      if (typeof id !== "string" || !id.trim()) {
        return res.status(400).json({ ok: false, error: "invalid id" });
      }
      const out = await setReviewStatus(db, id, action === "hide" ? "hidden" : "visible");
      if (!out.ok) {
        const status = out.error === "review not found" ? 404 : 400;
        return res.status(status).json({ ok: false, error: out.error });
      }
      return res.status(200).json({ ok: true, status: out.status });
    }
    return res.status(400).json({ ok: false, error: "invalid action" });
  } catch (err) {
    if (isDbUnavailable(err)) {
      return res.status(503).json({ ok: false, error: "store unavailable" });
    }
    return res.status(500).json({ ok: false, error: "moderation failed" });
  }
}

export default handler;

export const POST: APIRoute = wrapLegacy(handler as never);
