import type { APIRoute } from "astro";
import { getSiteBrand } from "../lib/seo/brand";
import { getDb, getSetting } from "../lib/db/adapter";
import { getLatestReviews } from "../lib/seo/content";
import { siteOrigin } from "../lib/seo/meta";
import { LLMS_REVIEW_LIMIT, llmsSummary, renderLlmsTxt } from "../lib/seo/llms-txt";

/**
 * GET /llms.txt — the llms.txt convention (https://llms.txt/).
 *
 * A plain-text map of the site for language models: who we are, the
 * canonical content types with their URL patterns, the newest published
 * reviews with their canonical URLs and one-line verdicts, the generation
 * date, and the sitemap pointer.
 *
 * The newest-reviews list is read from the published store at request time
 * (getLatestReviews merges the admin store over the DEMO rows and filters
 * by site), so the file is never a stale snapshot. The origin comes from
 * siteOrigin() so every brand emits its own domain.
 *
 * The legacy archive router never answers this path: /llms.txt is a
 * root-level .txt asset, exempt under isStaticAssetPath.
 */
export const GET: APIRoute = async ({ url }) => {
  const origin = siteOrigin(url.origin);
  const brand = await getSiteBrand((k) => getSetting(getDb({}), k));
  const reviews = getLatestReviews(5000)
    .slice(0, LLMS_REVIEW_LIMIT)
    .map((review) => ({
      title: review.reviewTitle,
      url: `${origin}/reviews/${review.slug}`,
      verdict: review.verdict,
    }));

  const body = renderLlmsTxt({
    siteName: brand.name,
    summary: llmsSummary(brand.name),
    origin,
    reviews,
    generatedAt: new Date().toISOString().slice(0, 10),
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=600",
    },
  });
};
