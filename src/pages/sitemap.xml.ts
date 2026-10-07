import type { APIRoute } from "astro";
import { buildSitemapXml } from "../lib/seo/sitemap";
import { getLatestReviews } from "../lib/seo/content";

export const GET: APIRoute = ({ url }) => {
  const origin = url.origin;
  const xml = buildSitemapXml([
    { loc: `${origin}/`, changefreq: "daily", priority: 1.0 },
    { loc: `${origin}/reviews`, changefreq: "daily", priority: 0.8 },
    { loc: `${origin}/movies`, changefreq: "daily", priority: 0.8 },
    ...getLatestReviews(5000).map((r) => ({
      loc: `${origin}/reviews/${r.slug}`,
      lastmod: r.updatedAt,
      changefreq: "weekly" as const,
      priority: 0.7,
    })),
    ...getLatestReviews(5000)
      .filter((r) => Number.isInteger(r.tmdbId) && (r.tmdbId as number) > 0)
      .map((r) => ({
        loc: `${origin}/movies/${r.tmdbId}`,
        lastmod: r.updatedAt,
        changefreq: "weekly" as const,
        priority: 0.6,
      })),
  ]);
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
