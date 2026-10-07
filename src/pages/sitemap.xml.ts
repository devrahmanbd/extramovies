import type { APIRoute } from "astro";
import { buildSitemapXml } from "../lib/seo/sitemap";
import { siteOrigin } from "../lib/seo/meta";
import { getLatestReviews } from "../lib/seo/content";

export const GET: APIRoute = ({ url }) => {
  const origin = siteOrigin(url.origin);
  const latest = getLatestReviews(5000);
  const newest = latest[0]?.updatedAt;
  const xml = buildSitemapXml([
    { loc: `${origin}/`, changefreq: "daily", priority: 1.0, ...(newest ? { lastmod: newest } : {}) },
    { loc: `${origin}/reviews`, changefreq: "daily", priority: 0.8, ...(newest ? { lastmod: newest } : {}) },
    { loc: `${origin}/movies`, changefreq: "daily", priority: 0.8, ...(newest ? { lastmod: newest } : {}) },
    ...latest.map((r) => ({
      loc: `${origin}/reviews/${r.slug}`,
      lastmod: r.updatedAt,
      changefreq: "weekly" as const,
      priority: 0.7,
    })),
    ...latest
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
