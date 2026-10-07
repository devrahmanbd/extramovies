import type { NextApiRequest, NextApiResponse } from 'next';
import type { APIRoute } from "astro";
import { requireAdminApi } from '../../../lib/auth/guard';
import { upsertReview } from '../admin/_store';
import { deserializeDb, migrateLegacyReview, validatePortableReview } from '../../../lib/portability';
import { wrapLegacy } from '../../../lib/api-adapter';

export const prerender = false;

/**
 * POST /api/backup/import — restore from a JSON snapshot (admin only).
 * Body: { snapshot: { reviews: [...] } } or { reviews: [...] }.
 * Validates each record; skips invalid with per-item errors. Never wipes
 * the store on malformed input (safe: 400, zero writes).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  const auth = requireAdminApi(req as never, res as never);
  if (!auth) return;

  const body = (req.body ?? {}) as { snapshot?: unknown; reviews?: unknown };
  const raw = body.snapshot ?? body;
  const { reviews, error } = deserializeDb(JSON.stringify(raw));
  if (error && reviews.length === 0) {
    return res.status(400).json({ ok: false, error });
  }
  let imported = 0;
  const errors: string[] = [];
  for (const item of reviews) {
    const { review } = migrateLegacyReview(item);
    // map portable -> store shape
    const record = {
      id: String((item as Record<string, unknown>).id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`),
      title: review.title,
      slug: review.slug,
      excerpt: String((item as Record<string, unknown>).excerpt ?? ''),
      markdown: review.body,
      status: ((item as Record<string, unknown>).status === 'published' ? 'published' : 'draft') as 'draft' | 'published',
      rating: review.rating,
      region: String((item as Record<string, unknown>).region ?? ''),
      seo: {
        seoTitle: (review.seo_title as string) ?? undefined,
        metaDesc: (review.seo_description as string) ?? undefined,
      },
      redirects: Array.isArray((item as Record<string, unknown>).redirects)
        ? ((item as Record<string, unknown>).redirects as string[])
        : [],
      createdAt: String((item as Record<string, unknown>).createdAt ?? new Date().toISOString()),
      updatedAt: new Date().toISOString(),
      publishedAt: (review.published_at as string) ?? undefined,
    };
    const problems = validatePortableReview(review);
    if (problems.length > 0) {
      errors.push(`${record.slug}: ${problems.join('; ')}`);
      continue;
    }
    await upsertReview(record);
    imported++;
  }
  return res.status(200).json({ ok: true, imported, skipped: errors.length, errors });
}

export const POST: APIRoute = wrapLegacy(handler as never);
