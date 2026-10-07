import type { NextApiRequest, NextApiResponse } from 'next';
import type { APIRoute } from "astro";
import { requireAdminApi } from '../../lib/auth/guard';
import { newId, upsertReview } from './admin/_store';
import { markdownToReview, validatePortableReview } from '../../lib/portability';
import { wrapLegacy } from '../../lib/api-adapter';

export const prerender = false;

/**
 * POST /api/import { markdown } — import one portable Markdown doc (admin only).
 * Returns { id, slug, warnings } or 400 with validation errors.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  const auth = requireAdminApi(req as never, res as never);
  if (!auth) return;
  const { markdown } = (req.body ?? {}) as { markdown?: string };
  if (typeof markdown !== 'string' || !markdown.trim()) {
    return res.status(400).json({ ok: false, error: 'markdown required' });
  }
  const { review, warnings } = markdownToReview(markdown);
  const problems = validatePortableReview(review);
  if (problems.length > 0) {
    return res.status(400).json({ ok: false, error: problems.join('; ') });
  }
  const now = new Date().toISOString();
  const record = {
    id: newId(),
    title: review.title,
    slug: review.slug,
    excerpt: String(review.excerpt ?? ''),
    markdown: review.body,
    status: 'draft' as const,
    rating: review.rating,
    region: '',
    seo: { seoTitle: (review.seo_title as string) ?? undefined, metaDesc: (review.seo_description as string) ?? undefined },
    redirects: [] as string[],
    createdAt: now,
    updatedAt: now,
  };
  await upsertReview(record);
  return res.status(200).json({ ok: true, id: record.id, slug: record.slug, warnings });
}

export const POST: APIRoute = wrapLegacy(handler as never);
