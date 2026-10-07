/**
 * Member reviews store — DB-only (no file fallback).
 * Table (auth crew migration 0004_social.sql):
 *   member_reviews(id TEXT PK, user_id, tmdb_id INTEGER,
 *     media_type DEFAULT 'movie', rating INTEGER NULL 0..10,
 *     title TEXT DEFAULT '', body_markdown NOT NULL, created_at, updated_at)
 *
 * One review per user per tmdb+media: enforced here via SELECT-then-write
 * (the table uses a surrogate PK, so no ON CONFLICT target exists).
 * Uses dbExecute from lib/db/adapter (never db.execute — absent in this
 * drizzle version). Mirrors the watchlist slice's resolve/isDbUnavailable
 * pattern so handlers stay thin and tests can inject an in-memory db.
 */
import { sql } from 'drizzle-orm';
import { dbExecute, resolveDbFromRequest, type AppDb } from '../db/adapter';
import { newReviewId } from '../users/store';

export type ReviewMedia = 'movie' | 'tv';

export type MemberDb =
  | AppDb
  | { execute: (q: unknown) => unknown }
  | { all: (q: unknown) => unknown };

export interface ReviewInput {
  tmdbId: unknown;
  media?: unknown;
  rating?: unknown;
  title?: unknown;
  body?: unknown;
}

export interface ValidReview {
  tmdbId: number;
  media: ReviewMedia;
  rating: number | null;
  title: string;
  body: string;
}

export type ReviewValidation =
  | { ok: true; value: ValidReview }
  | { ok: false; error: string };

export interface MemberReviewRow {
  id: string;
  userId: string;
  tmdbId: number;
  media: ReviewMedia;
  rating: number | null;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  handle: string | null;
  displayName: string | null;
}

export interface UserReviewRow {
  id: string;
  tmdbId: number;
  media: ReviewMedia;
  rating: number | null;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export type UpsertResult =
  | { ok: true; id: string; created: boolean }
  | { ok: false; error: string };

const TITLE_MAX = 120;
const BODY_MIN = 20;
const BODY_MAX = 5000;

/** Pure validation: tmdbId positive int, media movie|tv, rating null|0..10 int. */
export function validateReviewInput(input: ReviewInput): ReviewValidation {
  const rawId =
    typeof input.tmdbId === 'string' && input.tmdbId.trim() !== ''
      ? Number(input.tmdbId)
      : (input.tmdbId as number);
  if (
    typeof rawId !== 'number' ||
    !Number.isSafeInteger(rawId) ||
    rawId <= 0
  ) {
    return { ok: false, error: 'invalid tmdbId: must be a positive integer' };
  }
  const media = (input.media ?? 'movie') as string;
  if (media !== 'movie' && media !== 'tv') {
    return { ok: false, error: "invalid media: must be 'movie' or 'tv'" };
  }
  let rating: number | null = null;
  if (input.rating !== undefined && input.rating !== null && input.rating !== '') {
    const r = typeof input.rating === 'string' ? Number(input.rating) : input.rating;
    if (typeof r !== 'number' || !Number.isInteger(r) || r < 0 || r > 10) {
      return { ok: false, error: 'invalid rating: must be an integer 0..10 or omitted' };
    }
    rating = r;
  }
  const title = input.title === undefined || input.title === null ? '' : input.title;
  if (typeof title !== 'string') {
    return { ok: false, error: 'invalid title: must be a string' };
  }
  if (title.length > TITLE_MAX) {
    return { ok: false, error: `invalid title: must be ≤ ${TITLE_MAX} characters` };
  }
  if (typeof input.body !== 'string') {
    return { ok: false, error: 'invalid body: must be a string' };
  }
  const body = input.body;
  if (body.trim().length < BODY_MIN || body.length > BODY_MAX) {
    return {
      ok: false,
      error: `invalid body: must be ${BODY_MIN}..${BODY_MAX} characters`,
    };
  }
  return {
    ok: true,
    value: { tmdbId: rawId, media: media as ReviewMedia, rating, title, body },
  };
}

/**
 * Create or update the caller's review for a tmdb+media (upsert on re-post).
 * Returns { ok, id } — validation failures are { ok:false, error } (no throw).
 */
export async function createOrUpdateReview(
  db: MemberDb,
  userId: string,
  input: ReviewInput,
): Promise<UpsertResult> {
  if (!userId || typeof userId !== 'string') {
    return { ok: false, error: 'unauthorized' };
  }
  const v = validateReviewInput(input);
  if (!v.ok) return v;
  const { tmdbId, media, rating, title, body } = v.value;
  const now = new Date().toISOString();
  const existing = await dbExecute<{ id: string }>(
    db as never,
    sql`SELECT id FROM member_reviews
        WHERE user_id = ${userId} AND tmdb_id = ${tmdbId} AND media_type = ${media}
        LIMIT 1`,
  );
  const row = existing[0];
  if (row) {
    await dbExecute(
      db as never,
      sql`UPDATE member_reviews
          SET rating = ${rating}, title = ${title}, body_markdown = ${body},
              updated_at = ${now}
          WHERE id = ${row.id}`,
    );
    return { ok: true, id: row.id, created: false };
  }
  const id = newReviewId();
  await dbExecute(
    db as never,
    sql`INSERT INTO member_reviews
        (id, user_id, tmdb_id, media_type, rating, title, body_markdown, created_at, updated_at)
        VALUES (${id}, ${userId}, ${tmdbId}, ${media}, ${rating}, ${title}, ${body}, ${now}, ${now})`,
  );
  return { ok: true, id, created: true };
}

function clampLimit(raw: unknown, fallback: number, max: number): number {
  const n = typeof raw === 'string' ? Number(raw) : (raw as number);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(n)));
}

/** Newest-first reviews for a title, joined with author handle/display_name. */
export async function listForMovie(
  db: MemberDb,
  tmdbId: number,
  media: ReviewMedia = 'movie',
  limit = 20,
): Promise<MemberReviewRow[]> {
  if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) return [];
  if (media !== 'movie' && media !== 'tv') return [];
  const n = clampLimit(limit, 20, 50);
  let rows: {
    id: string;
    user_id: string;
    tmdb_id: number;
    media_type: string;
    rating: number | null;
    title: string;
    body_markdown: string;
    created_at: string;
    updated_at: string;
    handle: string | null;
    display_name: string | null;
  }[];
  try {
    rows = await dbExecute(
      db as never,
      sql`SELECT mr.id, mr.user_id, mr.tmdb_id, mr.media_type, mr.rating, mr.title,
                 mr.body_markdown, mr.created_at, mr.updated_at,
                 u.handle, u.display_name
          FROM member_reviews mr LEFT JOIN users u ON u.id = mr.user_id
          WHERE mr.tmdb_id = ${tmdbId} AND mr.media_type = ${media}
            AND mr.status = 'visible'
          ORDER BY mr.created_at DESC, mr.id DESC LIMIT ${n}`,
    );
  } catch (err) {
    // Pre-0005 DBs lack member_reviews.status — fall back to unfiltered list.
    if (!/no such column/i.test(err instanceof Error ? err.message : String(err))) throw err;
    rows = await dbExecute(
      db as never,
      sql`SELECT mr.id, mr.user_id, mr.tmdb_id, mr.media_type, mr.rating, mr.title,
                 mr.body_markdown, mr.created_at, mr.updated_at,
                 u.handle, u.display_name
          FROM member_reviews mr LEFT JOIN users u ON u.id = mr.user_id
          WHERE mr.tmdb_id = ${tmdbId} AND mr.media_type = ${media}
          ORDER BY mr.created_at DESC, mr.id DESC LIMIT ${n}`,
    );
  }
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    tmdbId: Number(r.tmdb_id),
    media: (r.media_type === 'tv' ? 'tv' : 'movie') as ReviewMedia,
    rating: r.rating === null || r.rating === undefined ? null : Number(r.rating),
    title: r.title ?? '',
    body: r.body_markdown,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    handle: r.handle,
    displayName: r.display_name,
  }));
}

/** Newest-first reviews by one user (profile page). */
export async function listForUser(
  db: MemberDb,
  userId: string,
  limit = 50,
): Promise<UserReviewRow[]> {
  if (!userId || typeof userId !== 'string') return [];
  const n = clampLimit(limit, 50, 200);
  let rows: {
    id: string;
    tmdb_id: number;
    media_type: string;
    rating: number | null;
    title: string;
    body_markdown: string;
    created_at: string;
    updated_at: string;
  }[];
  try {
    rows = await dbExecute(
      db as never,
      sql`SELECT id, tmdb_id, media_type, rating, title, body_markdown, created_at, updated_at
          FROM member_reviews WHERE user_id = ${userId} AND status = 'visible'
          ORDER BY created_at DESC, id DESC LIMIT ${n}`,
    );
  } catch (err) {
    // Pre-0005 DBs lack member_reviews.status — fall back to unfiltered list.
    if (!/no such column/i.test(err instanceof Error ? err.message : String(err))) throw err;
    rows = await dbExecute(
      db as never,
      sql`SELECT id, tmdb_id, media_type, rating, title, body_markdown, created_at, updated_at
          FROM member_reviews WHERE user_id = ${userId}
          ORDER BY created_at DESC, id DESC LIMIT ${n}`,
    );
  }
  return rows.map((r) => ({
    id: r.id,
    tmdbId: Number(r.tmdb_id),
    media: (r.media_type === 'tv' ? 'tv' : 'movie') as ReviewMedia,
    rating: r.rating === null || r.rating === undefined ? null : Number(r.rating),
    title: r.title ?? '',
    body: r.body_markdown,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function countReviewsForUser(db: MemberDb, userId: string): Promise<number> {
  if (!userId || typeof userId !== 'string') return 0;
  const rows = await dbExecute<{ count: number | string }>(
    db as never,
    sql`SELECT COUNT(*) AS count FROM member_reviews WHERE user_id = ${userId}`,
  );
  return Number(rows[0]?.count ?? 0) || 0;
}

/**
 * Resolve a drizzle DB for API handlers (launch L1F: delegates to the shared
 * resolveDbFromRequest so member writes and session reads share one database).
 * Priority: req.db / req.locals.db (tests + future middleware) →
 * locals.runtime.env (Cloudflare D1; authoritative only when no DB_FILE is
 * configured) → getDb({}).
 * Throws with code DB_UNAVAILABLE so handlers can return clean 503 JSON.
 */
export function resolveMemberDb(req: unknown): MemberDb {
  try {
    return resolveDbFromRequest(req) as MemberDb;
  } catch {
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
  return /unavailable|no such table|SQLITE_CANTOPEN|D1_ERROR|connect|ENOTFOUND/i.test(
    msg,
  );
}
