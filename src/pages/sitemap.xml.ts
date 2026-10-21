import type { APIRoute } from "astro";
import { buildSitemapXml } from "../lib/seo/sitemap";
import { siteOrigin } from "../lib/seo/meta";
import { getLatestReviews } from "../lib/seo/content";
import { currentTheme } from "../lib/tmdb/discover";
import {
  TAXONOMY_KINDS,
  taxonomyEntries,
  isTaxonomyIndexable,
} from "../lib/seo/taxonomy";

export const GET: APIRoute = async ({ url }) => {
  const origin = siteOrigin(url.origin);
  const latest = getLatestReviews(5000);
  const newest = latest[0]?.updatedAt;
  const theme = await currentTheme();
  // Taxonomy pages (cast / director / category) join the sitemap only when
  // the site publishes two or more reviews for them (AGENTS.md §5). A
  // one-review taxonomy page stays `noindex, follow` and is never listed.
  // Every entry here is review-driven — no bare TMDB page is added.
  const taxonomy = TAXONOMY_KINDS.flatMap((kind) =>
    taxonomyEntries(kind)
      .filter((entry) => isTaxonomyIndexable(entry))
      .map((entry) => ({
        loc: `${origin}${entry.path}`,
        lastmod: entry.reviews[0]?.updatedAt ?? newest,
        changefreq: "weekly" as const,
        priority: 0.5,
      })),
  );
  const xml = buildSitemapXml([
    { loc: `${origin}/`, changefreq: "daily", priority: 1.0, ...(newest ? { lastmod: newest } : {}) },
    { loc: `${origin}/reviews`, changefreq: "daily", priority: 0.8, ...(newest ? { lastmod: newest } : {}) },
    ...(theme === "publication"
      ? []
      : [{ loc: `${origin}/movies`, changefreq: "daily" as const, priority: 0.8, ...(newest ? { lastmod: newest } : {}) }]),
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
    ...taxonomy,
  ]);
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
