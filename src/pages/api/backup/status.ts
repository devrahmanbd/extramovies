import type { NextApiRequest, NextApiResponse } from 'next';
import type { APIRoute } from "astro";
import { requireAdminApi } from '../../../lib/auth/guard';
import { listReviews } from '../admin/_store';
import { wrapLegacy } from '../../../lib/api-adapter';

export const prerender = false;

/** GET /api/backup/status — counts + newest update (admin only). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  const auth = await requireAdminApi(req as never, res as never);
  if (!auth) return;
  const all = await listReviews();
  const published = all.filter((r) => r.status === 'published').length;
  return res.status(200).json({
    ok: true,
    total: all.length,
    drafts: all.length - published,
    published,
    newestUpdatedAt: all[0]?.updatedAt ?? null,
  });
}

export const GET: APIRoute = wrapLegacy(handler as never);
