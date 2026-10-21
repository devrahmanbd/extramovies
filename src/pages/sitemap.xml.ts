import type { APIRoute } from "astro";
import { buildSitemapXml } from "../lib/seo/sitemap";
import { siteOrigin } from "../lib/seo/meta";
import { getLatestReviews } from "../lib/seo/content";
import { withMediaTypes } from "../lib/seo/series-reviews";
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
  // The series index and the series hubs follow the same review-driven rule
  // as the film hubs: a series review puts its hub (/series/<tmdbId>) in the
  // sitemap, and the film hub (/movies/<tmdbId>) is only listed for a row
  // that is NOT a series. A row the site cannot classify keeps today's
  // behaviour (the film hub), so a TMDB hiccup never drops a live URL.
  const typed = await withMediaTypes(latest);
  const seriesReviews = typed
    .filter((t) => t.mediaType === "tv")
    .map((t) => t.review);
  const filmReviews = typed
    .filter((t) => t.mediaType !== "tv")
    .map((t) => t.review);
  const xml = buildSitemapXml([
    { loc: `${origin}/`, changefreq: "daily", priority: 1.0, ...(newest ? { lastmod: newest } : {}) },
    { loc: `${origin}/reviews`, changefreq: "daily", priority: 0.8, ...(newest ? { lastmod: newest } : {}) },
    // Site pages, not review pages: the review-driven rule does not apply to
    // them. Both are indexable (AGENTS.md §5) and both are the entity
    // corroboration the brand SERP needs.
    { loc: `${origin}/about`, changefreq: "monthly", priority: 0.6 },
    { loc: `${origin}/contact`, changefreq: "monthly", priority: 0.4 },
    ...(theme === "publication"
      ? []
      : [{ loc: `${origin}/movies`, changefreq: "daily" as const, priority: 0.8, ...(newest ? { lastmod: newest } : {}) }]),
    // The series index only exists for a reader when the site publishes a
    // series review. An empty index stays out of the sitemap (and noindex).
    ...(seriesReviews.length > 0
      ? [{ loc: `${origin}/series`, changefreq: "daily" as const, priority: 0.8, ...(newest ? { lastmod: newest } : {}) }]
      : []),
    ...latest.map((r) => ({
      loc: `${origin}/reviews/${r.slug}`,
      lastmod: r.updatedAt,
      changefreq: "weekly" as const,
      priority: 0.7,
    })),
    ...filmReviews
      .filter((r) => Number.isInteger(r.tmdbId) && (r.tmdbId as number) > 0)
      .map((r) => ({
        loc: `${origin}/movies/${r.tmdbId}`,
        lastmod: r.updatedAt,
        changefreq: "weekly" as const,
        priority: 0.6,
      })),
    ...seriesReviews
      .filter((r) => Number.isInteger(r.tmdbId) && (r.tmdbId as number) > 0)
      .map((r) => ({
        loc: `${origin}/series/${r.tmdbId}`,
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
