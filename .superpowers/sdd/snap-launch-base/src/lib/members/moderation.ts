/**
 * Member-review moderation store — DB-only (no file fallback).
 * Tables (migration 0005_moderation.sql):
 *   member_reviews(... , status TEXT NOT NULL DEFAULT 'visible')
 *   review_reports(id PK, review_id → member_reviews(id) CASCADE,
 *     reporter_id → users(id) CASCADE, reason, created_at,
 *     UNIQUE(review_id, reporter_id))
 *
 * Uses dbExecute from lib/db/adapter (never db.execute — absent in this
 * drizzle version). Mirrors the reviews slice's MemberDb shape so handlers
 * stay thin and tests can inject an in-memory db.
 */
import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { dbExecute } from '../db/adapter';
import type { MemberDb } from './reviews';

export type ReviewStatus = 'visible' | 'hidden';

export type ReportResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export type StatusResult =
  | { ok: true; status: ReviewStatus }
  | { ok: false; error: string };

export interface FlaggedReview {
  id: string;
  tmdbId: number;
  rating: number | null;
  title: string;
  handle: string | null;
  displayName: string | null;
  reports: number;
  createdAt: string;
  status: ReviewStatus;
}

const REASON_MIN = 3;
const REASON_MAX = 200;

function newReportId(): string {
  return `rep_${randomBytes(8).toString('hex')}`;
}

function isMissingColumn(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /no such (table|column)/i.test(msg);
}

/**
 * Flag a review for admin triage.
 * - reason must be 3..200 chars (trimmed).
 * - review must exist, else 'review not found'.
 * - self-reports are rejected: 'cannot report own review'.
 * - repeat reports by the same reporter are idempotent (returns existing id).
 */
export async function reportReview(
  db: MemberDb,
  reporterId: string,
  reviewId: unknown,
  reason: unknown,
): Promise<ReportResult> {
  if (!reporterId || typeof reporterId !== 'string') {
    return { ok: false, error: 'unauthorized' };
  }
  if (typeof reviewId !== 'string' || !reviewId.trim()) {
    return { ok: false, error: 'invalid reviewId' };
  }
  const id = reviewId.trim();
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length < REASON_MIN || text.length > REASON_MAX) {
    return { ok: false, error: 'invalid reason' };
  }
  const found = await dbExecute<{ id: string; user_id: string }>(
    db as never,
    sql`SELECT id, user_id FROM member_reviews WHERE id = ${id} LIMIT 1`,
  );
  const review = found[0];
  if (!review) return { ok: false, error: 'review not found' };
  if (review.user_id === reporterId) {
    return { ok: false, error: 'cannot report own review' };
  }
  const existing = await dbExecute<{ id: string }>(
    db as never,
    sql`SELECT id FROM review_reports
        WHERE review_id = ${id} AND reporter_id = ${reporterId} LIMIT 1`,
  );
  if (existing[0]) return { ok: true, id: existing[0].id };
  const reportId = newReportId();
  const now = new Date().toISOString();
  await dbExecute(
    db as never,
    sql`INSERT INTO review_reports (id, review_id, reporter_id, reason, created_at)
        VALUES (${reportId}, ${id}, ${reporterId}, ${text}, ${now})`,
  );
  return { ok: true, id: reportId };
}

/** Reviews with ≥1 report, newest first, joined with author handle/display_name. */
export async function listFlagged(db: MemberDb): Promise<FlaggedReview[]> {
  const withStatus = async (): Promise<FlaggedReview[]> => {
    const rows = await dbExecute<{
      id: string;
      tmdb_id: number;
      rating: number | null;
      title: string;
      created_at: string;
      status: string;
      handle: string | null;
      display_name: string | null;
      reports: number | string;
    }>(
      db as never,
      sql`SELECT mr.id, mr.tmdb_id, mr.rating, mr.title, mr.created_at, mr.status,
                u.handle, u.display_name, COUNT(rr.id) AS reports
         FROM member_reviews mr
         JOIN review_reports rr ON rr.review_id = mr.id
         LEFT JOIN users u ON u.id = mr.user_id
         GROUP BY mr.id
         ORDER BY mr.created_at DESC, mr.id DESC`,
    );
    return rows.map((r) => ({
      id: r.id,
      tmdbId: Number(r.tmdb_id),
      rating: r.rating === null || r.rating === undefined ? null : Number(r.rating),
      title: r.title ?? '',
      handle: r.handle,
      displayName: r.display_name,
      reports: Number(r.reports ?? 0) || 0,
      createdAt: r.created_at,
      status: (r.status === 'hidden' ? 'hidden' : 'visible') as ReviewStatus,
    }));
  };
  try {
    return await withStatus();
  } catch (err) {
    if (!isMissingColumn(err)) throw err;
    // Pre-0005 DB (no status column): same list without the flag.
    const rows = await dbExecute<{
      id: string;
      tmdb_id: number;
      rating: number | null;
      title: string;
      created_at: string;
      handle: string | null;
      display_name: string | null;
      reports: number | string;
    }>(
      db as never,
      sql`SELECT mr.id, mr.tmdb_id, mr.rating, mr.title, mr.created_at,
                u.handle, u.display_name, COUNT(rr.id) AS reports
         FROM member_reviews mr
         JOIN review_reports rr ON rr.review_id = mr.id
         LEFT JOIN users u ON u.id = mr.user_id
         GROUP BY mr.id
         ORDER BY mr.created_at DESC, mr.id DESC`,
    );
    return rows.map((r) => ({
      id: r.id,
      tmdbId: Number(r.tmdb_id),
      rating: r.rating === null || r.rating === undefined ? null : Number(r.rating),
      title: r.title ?? '',
      handle: r.handle,
      displayName: r.display_name,
      reports: Number(r.reports ?? 0) || 0,
      createdAt: r.created_at,
      status: 'visible' as ReviewStatus,
    }));
  }
}

/** Hide ('hidden') or restore ('visible') a review. Unknown ids are errors. */
export async function setReviewStatus(
  db: MemberDb,
  reviewId: unknown,
  status: unknown,
): Promise<StatusResult> {
  if (typeof reviewId !== 'string' || !reviewId.trim()) {
    return { ok: false, error: 'invalid id' };
  }
  if (status !== 'visible' && status !== 'hidden') {
    return { ok: false, error: 'invalid status' };
  }
  const id = reviewId.trim();
  const found = await dbExecute<{ id: string }>(
    db as never,
    sql`SELECT id FROM member_reviews WHERE id = ${id} LIMIT 1`,
  );
  if (!found[0]) return { ok: false, error: 'review not found' };
  const now = new Date().toISOString();
  await dbExecute(
    db as never,
    sql`UPDATE member_reviews SET status = ${status}, updated_at = ${now}
        WHERE id = ${id}`,
  );
  return { ok: true, status };
}
