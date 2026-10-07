import type { NextApiRequest, NextApiResponse } from 'next';
import type { APIRoute } from "astro";
import { requireAdminApi } from '../../lib/auth/guard';
import { listReviews } from './admin/_store';
import { reviewToMarkdown } from '../../lib/portability';
import { wrapLegacy } from '../../lib/api-adapter';

export const prerender = false;

/**
 * GET /api/export?format=md|json — portable export (admin only).
 * md: [{ slug, markdown }] with full frontmatter contract.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  const auth = await requireAdminApi(req as never, res as never);
  if (!auth) return;
  const format = ((req.query.format ?? 'md') as string).toLowerCase();
  const all = await listReviews();
  if (format === 'json') {
    return res.status(200).json({ ok: true, count: all.length, reviews: all });
  }
  const files = all.map((r) => ({
    slug: r.slug,
    markdown: reviewToMarkdown({
      title: r.title,
      slug: r.slug,
      rating: r.rating,
      movie_id: (r.movie?.movieId ?? r.id ?? null) as string | null,
      imdb_id: (r.movie?.imdbId ?? null) as string | null,
      tmdb_id: null,
      published_at: (r.publishedAt ?? null) as string | null,
      seo_title: (r.seo?.seoTitle ?? null) as string | null,
      seo_description: (r.seo?.metaDesc ?? null) as string | null,
      body: r.markdown,
    }),
  }));
  return res.status(200).json({ ok: true, count: files.length, files });
}

export const GET: APIRoute = wrapLegacy(handler as never);
