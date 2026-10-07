/**
 * watchlist store — DB-only (no file fallback).
 * Table (auth-crew migration):
 *   watchlist_items(user_id TEXT, tmdb_id INTEGER, media_type TEXT DEFAULT 'movie',
 *     status TEXT DEFAULT 'planned', added_at TEXT,
 *     PRIMARY KEY(user_id, tmdb_id, media_type))
 *
 * Uses dbExecute from lib/db/adapter (never db.execute — absent in this drizzle version).
 */
import { sql } from 'drizzle-orm';
import { dbExecute, resolveDbFromRequest, type AppDb } from '../db/adapter';

export type WatchlistMedia = 'movie' | 'tv';

export interface WatchlistItem {
  user_id: string;
  tmdb_id: number;
  media_type: WatchlistMedia;
  status: string;
  added_at: string;
  // Optional enrichment (joined by callers, not stored here).
  title?: string | null;
  poster?: string | null;
  year?: number | null;
}

export type WatchlistDb = AppDb | { execute: (q: unknown) => unknown } | { all: (q: unknown) => unknown };

export class WatchlistValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'WatchlistValidationError';
  }
}

export async function validateWatchlistInput(
  tmdbId: unknown,
  media: unknown = 'movie'
): Promise<{ tmdbId: number; media: WatchlistMedia }> {
  const id = typeof tmdbId === 'string' && tmdbId.trim() !== '' ? Number(tmdbId) : (tmdbId as number);
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
    throw new WatchlistValidationError('invalid tmdbId: must be a positive integer');
  }
  const m = (media ?? 'movie') as string;
  if (m !== 'movie' && m !== 'tv') {
    throw new WatchlistValidationError("invalid media: must be 'movie' or 'tv'");
  }
  return { tmdbId: id, media: m as WatchlistMedia };
}

export async function addToList(
  db: WatchlistDb,
  userId: string,
  tmdbId: number,
  media: WatchlistMedia = 'movie'
): Promise<{ onList: true; count: number }> {
  const v = await validateWatchlistInput(tmdbId, media);
  if (!userId || typeof userId !== 'string') throw new WatchlistValidationError('invalid userId');
  const now = new Date().toISOString();
  await dbExecute(db as never, sql`INSERT INTO watchlist_items (user_id, tmdb_id, media_type, status, added_at)
    VALUES (${userId}, ${v.tmdbId}, ${v.media}, 'planned', ${now})
    ON CONFLICT(user_id, tmdb_id, media_type) DO NOTHING`);
  const count = await countForUser(db, userId);
  return { onList: true as const, count };
}

export async function removeFromList(
  db: WatchlistDb,
  userId: string,
  tmdbId: number,
  media: WatchlistMedia = 'movie'
): Promise<{ onList: false; count: number }> {
  const v = await validateWatchlistInput(tmdbId, media);
  await dbExecute(
    db as never,
    sql`DELETE FROM watchlist_items WHERE user_id = ${userId} AND tmdb_id = ${v.tmdbId} AND media_type = ${v.media}`
  );
  const count = await countForUser(db, userId);
  return { onList: false as const, count };
}

export async function listForUser(db: WatchlistDb, userId: string): Promise<WatchlistItem[]> {
  const rows = await dbExecute<WatchlistItem>(
    db as never,
    sql`SELECT user_id, tmdb_id, media_type, status, added_at FROM watchlist_items
        WHERE user_id = ${userId} ORDER BY added_at DESC LIMIT 200`
  );
  return rows as WatchlistItem[];
}

export async function isOnList(
  db: WatchlistDb,
  userId: string,
  tmdbId: number,
  media: WatchlistMedia = 'movie'
): Promise<boolean> {
  const v = await validateWatchlistInput(tmdbId, media);
  const rows = await dbExecute<{ one: number }>(
    db as never,
    sql`SELECT 1 AS one FROM watchlist_items WHERE user_id = ${userId} AND tmdb_id = ${v.tmdbId} AND media_type = ${v.media} LIMIT 1`
  );
  return rows.length > 0;
}

export async function countForUser(db: WatchlistDb, userId: string): Promise<number> {
  const rows = await dbExecute<{ count: number }>(
    db as never,
    sql`SELECT COUNT(*) AS count FROM watchlist_items WHERE user_id = ${userId}`
  );
  const raw = (rows[0]?.count ?? 0) as number;
  return typeof raw === 'number' ? raw : Number(raw) || 0;
}

/**
 * Resolve a drizzle DB for API handlers (launch L1F: delegates to the shared
 * resolveDbFromRequest so watchlist and session paths share one database).
 * Priority: req.db / req.locals.db (tests + future middleware) →
 * locals.runtime.env (Cloudflare D1; authoritative only when no DB_FILE is
 * configured) → getDb({}).
 * Throws with code DB_UNAVAILABLE so handlers can return clean 503 JSON.
 */
export function resolveRequestDb(req: unknown): WatchlistDb {
  try {
    return resolveDbFromRequest(req) as WatchlistDb;
  } catch (err) {
    const e = new Error('store unavailable') as Error & { code?: string };
    e.code = 'DB_UNAVAILABLE';
    throw e;
  }
}

export function isDbUnavailable(err: unknown): boolean {
  if (!err) return false;
  const code = (err as { code?: string }).code;
  if (code === 'DB_UNAVAILABLE') return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /unavailable|no such table|SQLITE_CANTOPEN|D1_ERROR|connect|ENOTFOUND/i.test(msg);
}
