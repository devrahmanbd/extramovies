import type { NextApiRequest, NextApiResponse } from "next";
import type { APIRoute } from "astro";
import { normalizeCustomWatch } from "../../../lib/watch-links";
import { requireAdminApi } from "../../../lib/auth/guard";
import { getReviewById, newId, slugify, upsertReview } from "./_store";
import type { Review } from "./_store";
import { wrapLegacy } from "../../../lib/api-adapter";

export const prerender = false;

/**
 * Save a draft. NEVER publishes — status is always forced to "draft".
 * If the slug changed, the old slug is kept in `redirects` so
 * /api/admin/slug-redirect can 308 it to the new URL.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }
  const auth = requireAdminApi(req as never, res as never);
  if (!auth) return;

  const body = (req.body ?? {}) as Partial<Review> & { id?: string };
  const title = (body.title ?? "").toString().trim();
  const markdown = (body.markdown ?? "").toString();

  if (!title) return res.status(400).json({ ok: false, error: "title required" });
  if (!markdown.trim()) return res.status(400).json({ ok: false, error: "markdown required" });

  const now = new Date().toISOString();
  let review: Review;

  if (body.id) {
    const existing = await getReviewById(body.id);
    if (!existing) return res.status(404).json({ ok: false, error: "draft not found" });
    const nextSlug = body.slug ? slugify(body.slug) : existing.slug;
    const redirects = new Set(existing.redirects ?? []);
    if (existing.slug && nextSlug !== existing.slug) redirects.add(existing.slug);
    review = {
      ...existing,
      title,
      slug: nextSlug,
      excerpt: (body.excerpt ?? existing.excerpt ?? "").toString(),
      markdown,
      movie: body.movie ?? existing.movie,
      rating: typeof body.rating === "number" ? body.rating : existing.rating,
      region: (body.region ?? existing.region ?? "").toString(),
      platformPick: body.platformPick === true ? true : undefined,
      customWatch: body.customWatch !== undefined
        ? normalizeCustomWatch(body.customWatch)
        : existing.customWatch,
      seo: body.seo ?? existing.seo,
      redirects: [...redirects],
      status: "draft", // never auto-publish
      updatedAt: now,
    };
  } else {
    const slug = body.slug ? slugify(body.slug) : slugify(title);
    review = {
      id: newId(),
      title,
      slug,
      excerpt: (body.excerpt ?? "").toString(),
      markdown,
      status: "draft", // generation -> draft only
      movie: body.movie,
      rating: typeof body.rating === "number" ? body.rating : undefined,
      region: (body.region ?? "").toString(),
      platformPick: body.platformPick === true ? true : undefined,
      customWatch: body.customWatch !== undefined
        ? normalizeCustomWatch(body.customWatch)
        : undefined,
      seo: body.seo,
      redirects: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  await upsertReview(review);
  return res.status(200).json({ ok: true, id: review.id, slug: review.slug });
}

export const POST: APIRoute = wrapLegacy(handler as never);
