import type { NextApiRequest, NextApiResponse } from 'next';
import type { APIRoute } from 'astro';
import { wrapLegacy } from '../../../lib/api-adapter';
import { getSession, getSessionToken, resolveSessionDb } from '../../../lib/auth/session';
import {
  isOnList,
  countForUser,
  resolveRequestDb,
  isDbUnavailable,
  validateWatchlistInput,
} from '../../../lib/watchlist/store';

export const prerender = false;

/**
 * GET /api/list/status?tmdbId=&media=
 * Auth optional: anonymous → 200 {onList:false, count:null} so public pages can probe.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  const q = (name: string): string | undefined => {
    const v = (req.query as Record<string, string | string[] | undefined>)[name];
    return Array.isArray(v) ? v[0] : v;
  };
  let tmdbId: number;
  let media: 'movie' | 'tv';
  try {
    const v = await validateWatchlistInput(q('tmdbId') ?? q('tmdb_id'), q('media') ?? q('media_type') ?? 'movie');
    tmdbId = v.tmdbId;
    media = v.media;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'invalid input';
    return res.status(400).json({ ok: false, error: msg });
  }
  const raw = await getSession(getSessionToken(req as never), resolveSessionDb(req as never));
  const session = raw && raw.role === 'member' && raw.userId ? raw : null;
  if (!session) {
    return res.status(200).json({ ok: true, onList: false, count: null });
  }
  let db;
  try {
    db = resolveRequestDb(req);
  } catch {
    return res.status(503).json({ ok: false, error: 'store unavailable' });
  }
  try {
    const [onList, count] = await Promise.all([
      isOnList(db, session.userId, tmdbId, media),
      countForUser(db, session.userId),
    ]);
    return res.status(200).json({ ok: true, onList, count });
  } catch (err) {
    if (isDbUnavailable(err)) {
      return res.status(503).json({ ok: false, error: 'store unavailable' });
    }
    return res.status(500).json({ ok: false, error: 'status failed' });
  }
}

export const GET: APIRoute = wrapLegacy(handler as never);
