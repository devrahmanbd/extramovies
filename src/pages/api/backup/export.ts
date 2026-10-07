import type { NextApiRequest, NextApiResponse } from 'next';
import type { APIRoute } from "astro";
import { requireAdminApi } from '../../../lib/auth/guard';
import { listReviews } from '../admin/_store';
import { serializeDb } from '../../../lib/portability';
import { wrapLegacy } from '../../../lib/api-adapter';

export const prerender = false;

/** GET /api/backup/export — download a JSON snapshot (admin only). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  const auth = await requireAdminApi(req as never, res as never);
  if (!auth) return;
  const reviews = await listReviews();
  const raw = serializeDb(reviews as unknown as Record<string, unknown>[]);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="reviews-backup-${new Date().toISOString().slice(0, 10)}.json"`,
  );
  const withSend = res.status(200) as NextApiResponse & { send?: (body: unknown) => unknown };
  return withSend.send ? withSend.send(raw) : res.status(200).json(JSON.parse(raw));
}

export const GET: APIRoute = wrapLegacy(handler as never);
