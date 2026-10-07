import type { NextApiRequest, NextApiResponse } from "next";
import type { APIRoute } from "astro";
import { requireMemberApi } from "../../../lib/auth/guard";
import { wrapLegacy } from "../../../lib/api-adapter";
import {
  createOrUpdateReview,
  isDbUnavailable,
  listForMovie,
  resolveMemberDb,
  validateReviewInput,
  type ReviewMedia,
} from "../../../lib/members/reviews";

export const prerender = false;

/**
 * GET /api/member/reviews?tmdbId=&media=&limit= — public list (newest first).
 */
async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const q = ((req as unknown as { query?: Record<string, unknown> }).query ?? {}) as Record<
    string,
    unknown
  >;
  const rawId = Array.isArray(q["tmdbId"]) ? q["tmdbId"][0] : q["tmdbId"];
  const tmdbId = typeof rawId === "string" && rawId.trim() !== "" ? Number(rawId) : rawId;
  const rawMedia = Array.isArray(q["media"]) ? q["media"][0] : (q["media"] ?? "movie");
  const media = String(rawMedia || "movie") as ReviewMedia;
  const rawLimit = Array.isArray(q["limit"]) ? q["limit"][0] : q["limit"];
  const limit = rawLimit === undefined ? 20 : Number(rawLimit);
  if (typeof tmdbId !== "number" || !Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
    return res.status(400).json({ ok: false, error: "invalid tmdbId" });
  }
  if (media !== "movie" && media !== "tv") {
    return res.status(400).json({ ok: false, error: "invalid media" });
  }
  let db;
  try {
    db = resolveMemberDb(req);
  } catch {
    return res.status(503).json({ ok: false, error: "store unavailable" });
  }
  try {
    const reviews = await listForMovie(db, tmdbId, media, limit);
    return res.status(200).json({ ok: true, reviews });
  } catch (err) {
    if (isDbUnavailable(err)) {
      return res.status(503).json({ ok: false, error: "store unavailable" });
    }
    return res.status(500).json({ ok: false, error: "list failed" });
  }
}

/**
 * POST /api/member/reviews — member-guarded + CSRF. Upserts the caller's
 * review (one per user per tmdb; re-post updates). → 200 { ok, id }.
 */
async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireMemberApi(req as never, res as never);
  if (!auth) return;
  const userId = auth.session.userId;
  if (!userId) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  const body = ((req.body ?? {}) as Record<string, unknown>);
  const v = validateReviewInput({
    tmdbId: body["tmdbId"] ?? body["tmdb_id"],
    media: body["media"] ?? body["media_type"] ?? "movie",
    rating: body["rating"],
    title: body["title"] ?? "",
    body: body["body"] ?? body["body_markdown"],
  });
  if (!v.ok) {
    return res.status(400).json({ ok: false, error: v.error });
  }
  let db;
  try {
    db = resolveMemberDb(req);
  } catch {
    return res.status(503).json({ ok: false, error: "store unavailable" });
  }
  try {
    const out = await createOrUpdateReview(db, userId, {
      tmdbId: v.value.tmdbId,
      media: v.value.media,
      rating: v.value.rating,
      title: v.value.title,
      body: v.value.body,
    });
    if (!out.ok) {
      return res.status(400).json({ ok: false, error: out.error });
    }
    return res.status(200).json({ ok: true, id: out.id });
  } catch (err) {
    if (isDbUnavailable(err)) {
      return res.status(503).json({ ok: false, error: "store unavailable" });
    }
    return res.status(500).json({ ok: false, error: "save failed" });
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") return handleGet(req, res);
  if (req.method === "POST") return handlePost(req, res);
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "method not allowed" });
}

export const GET: APIRoute = wrapLegacy(handler as never);
export const POST: APIRoute = wrapLegacy(handler as never);
