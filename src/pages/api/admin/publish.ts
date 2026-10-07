import type { NextApiRequest, NextApiResponse } from "next";
import type { APIRoute } from "astro";
import { requireAdminApi } from "../../../lib/auth/guard";
import { getReviewById, upsertReview } from "./_store";
import { wrapLegacy } from "../../../lib/api-adapter";

export const prerender = false;

/** Explicit publish. Requires title + markdown + slug; only runs on user click. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }
  const auth = await requireAdminApi(req as never, res as never);
  if (!auth) return;

  const { id } = (req.body ?? {}) as { id?: string };
  if (!id) return res.status(400).json({ ok: false, error: "id required" });
  const review = await getReviewById(id);
  if (!review) return res.status(404).json({ ok: false, error: "review not found" });
  if (!review.title?.trim() || !review.markdown?.trim() || !review.slug?.trim()) {
    return res.status(400).json({ ok: false, error: "title, slug and markdown required before publish" });
  }

  const now = new Date().toISOString();
  review.status = "published";
  review.publishedAt = review.publishedAt ?? now;
  review.updatedAt = now;
  await upsertReview(review);
  return res.status(200).json({ ok: true, id: review.id, slug: review.slug });
}

export const POST: APIRoute = wrapLegacy(handler as never);
