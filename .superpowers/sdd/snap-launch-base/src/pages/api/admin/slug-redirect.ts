import type { NextApiRequest, NextApiResponse } from "next";
import type { APIRoute } from "astro";
import { requireAdminApi } from "../../../lib/auth/guard";
import { findBySlug } from "./_store";
import { wrapLegacy } from "../../../lib/api-adapter";

export const prerender = false;

/**
 * Slug-redirect handling.
 * GET ?slug=<old-or-current> -> { id, slug, redirected: boolean }
 * Lets the public review route 308 old slugs to the canonical one after
 * a title/slug edit (redirects[] is maintained by save-draft).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }
  const auth = requireAdminApi(req as never, res as never);
  if (!auth) return;

  const slug = (req.query.slug ?? "").toString().trim();
  if (!slug) return res.status(400).json({ ok: false, error: "slug required" });

  const review = await findBySlug(slug);
  if (!review) return res.status(404).json({ ok: false, error: "not found" });

  const redirected = review.slug.toLowerCase() !== slug.toLowerCase();
  return res.status(200).json({
    ok: true,
    id: review.id,
    slug: review.slug,
    redirected,
    status: review.status,
  });
}

export const GET: APIRoute = wrapLegacy(handler as never);
