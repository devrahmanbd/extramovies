import type { NextApiRequest, NextApiResponse } from 'next';
import type { APIRoute } from 'astro';
import { wrapLegacy } from '../../../lib/api-adapter';
import { requireMemberApi } from '../../../lib/auth/guard';
// Integrator: swap above to `lib/auth/guard`.requireMemberApi when auth crew lands.
import {
  removeFromList,
  resolveRequestDb,
  isDbUnavailable,
  validateWatchlistInput,
  WatchlistValidationError,
} from '../../../lib/watchlist/store';

export const prerender = false;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  const auth = requireMemberApi(req as never, res as never);
  if (!auth) return;
  const body = ((req.body ?? {}) as Record<string, unknown>);
  const rawTmdb = (body['tmdbId'] ?? body['tmdb_id']) as unknown;
  const rawMedia = (body['media'] ?? body['media_type'] ?? 'movie') as unknown;
  try {
    await validateWatchlistInput(rawTmdb, rawMedia);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'invalid input';
    return res.status(400).json({ ok: false, error: msg });
  }
  let db;
  try {
    db = resolveRequestDb(req);
  } catch {
    return res.status(503).json({ ok: false, error: 'store unavailable' });
  }
  try {
    const { tmdbId, media } = await validateWatchlistInput(rawTmdb, rawMedia);
    const out = await removeFromList(db, auth.session.userId, tmdbId, media);
    return res.status(200).json({ ok: true, onList: false, count: out.count });
  } catch (err) {
    if (err instanceof WatchlistValidationError) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    if (isDbUnavailable(err)) {
      return res.status(503).json({ ok: false, error: 'store unavailable' });
    }
    return res.status(500).json({ ok: false, error: 'remove failed' });
  }
}

export const POST: APIRoute = wrapLegacy(handler as never);
