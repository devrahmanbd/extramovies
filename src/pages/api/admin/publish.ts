import type { NextApiRequest, NextApiResponse } from "next";
import type { APIRoute } from "astro";
import { requireAdminApi } from "../../../lib/auth/guard";
import { checkPublishRating } from "../../../lib/publish-guard";
import { getReviewById, upsertReview } from "./_store";
import { wrapLegacy } from "../../../lib/api-adapter";
import {
  indexNowOrigin,
  notifyIndexNowSoon,
  originFromHeaders,
  reviewUrl,
} from "../../../lib/seo/indexnow";

export const prerender = false;

/**
 * Announce the published review to the IndexNow participants (Bing first)
 * so the engine looks at the URL now instead of at the next crawl.
 *
 * Fire-and-forget with a deadline: a slow or failing endpoint can never
 * delay the publish response, and a ping failure never changes the
 * publish result.
 */
async function announcePublish(
  req: NextApiRequest,
  slug: string,
): Promise<void> {
  try {
    const origin = indexNowOrigin(
      originFromHeaders(req.headers as Record<string, string | string[] | undefined>),
    );
    if (!origin) return;
    const url = reviewUrl(origin, slug);
    const result = await notifyIndexNowSoon([url], { origin });
    if (result.pinged > 0) console.log(`[indexnow] announced ${url}`);
  } catch (err) {
    console.warn(
      `[indexnow] publish ping skipped: ${err instanceof Error ? err.message : err}`,
    );
  }
}

/**
 * Explicit publish. Requires title + markdown + slug AND a real rating;
 * only runs on user click.
 */
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
  // The rating is the owner's call: a draft may sit at 0 until it is
  // scored, but publishing an unrated review would ship a public
  // "rated 0/10" claim (meta description + JSON-LD reviewRating).
  const rating = checkPublishRating(review.rating);
  if (!rating.ok) {
    return res.status(400).json({ ok: false, error: rating.error });
  }

  const now = new Date().toISOString();
  review.status = "published";
  review.publishedAt = review.publishedAt ?? now;
  review.updatedAt = now;
  await upsertReview(review);
  await announcePublish(req, review.slug);
  return res.status(200).json({ ok: true, id: review.id, slug: review.slug });
}

export const POST: APIRoute = wrapLegacy(handler as never);
