/**
 * Follows store — DB-only (no file fallback).
 * Table (auth crew migration 0004_social.sql):
 *   follows(follower_id, followee_id, created_at, PK both)
 *
 * No self-follow. Uses dbExecute from lib/db/adapter (never db.execute).
 */
import { sql } from 'drizzle-orm';
import { dbExecute } from '../db/adapter';
import { getUserByHandle } from '../users/store';
import type { MemberDb } from './reviews';

export type ToggleResult =
  | { ok: true; following: boolean }
  | { ok: false; error: string };

/** Follow/unfollow by handle. Self-follow and unknown handles are errors. */
export async function toggleFollow(
  db: MemberDb,
  followerId: string,
  handle: unknown,
): Promise<ToggleResult> {
  if (!followerId || typeof followerId !== 'string') {
    return { ok: false, error: 'unauthorized' };
  }
  if (typeof handle !== 'string' || !handle.trim()) {
    return { ok: false, error: 'invalid handle' };
  }
  const followee = await getUserByHandle(db as never, handle);
  if (!followee) return { ok: false, error: 'user not found' };
  if (followee.id === followerId) {
    return { ok: false, error: 'cannot follow yourself' };
  }
  const existing = await dbExecute<{ one: number }>(
    db as never,
    sql`SELECT 1 AS one FROM follows
        WHERE follower_id = ${followerId} AND followee_id = ${followee.id} LIMIT 1`,
  );
  if (existing.length > 0) {
    await dbExecute(
      db as never,
      sql`DELETE FROM follows
          WHERE follower_id = ${followerId} AND followee_id = ${followee.id}`,
    );
    return { ok: true, following: false };
  }
  await dbExecute(
    db as never,
    sql`INSERT INTO follows (follower_id, followee_id, created_at)
        VALUES (${followerId}, ${followee.id}, ${new Date().toISOString()})`,
  );
  return { ok: true, following: true };
}

export interface FollowCounts {
  followers: number;
  following: number;
}

/** Follower/following totals for a user id. */
export async function counts(db: MemberDb, userId: string): Promise<FollowCounts> {
  if (!userId || typeof userId !== 'string') return { followers: 0, following: 0 };
  const [a, b] = await Promise.all([
    dbExecute<{ count: number | string }>(
      db as never,
      sql`SELECT COUNT(*) AS count FROM follows WHERE followee_id = ${userId}`,
    ),
    dbExecute<{ count: number | string }>(
      db as never,
      sql`SELECT COUNT(*) AS count FROM follows WHERE follower_id = ${userId}`,
    ),
  ]);
  return {
    followers: Number(a[0]?.count ?? 0) || 0,
    following: Number(b[0]?.count ?? 0) || 0,
  };
}

/** True when followerId already follows followeeId. Never throws on bad input. */
export async function isFollowing(
  db: MemberDb,
  followerId: string | null | undefined,
  followeeId: string | null | undefined,
): Promise<boolean> {
  if (!followerId || !followeeId) return false;
  if (typeof followerId !== 'string' || typeof followeeId !== 'string') return false;
  const rows = await dbExecute<{ one: number }>(
    db as never,
    sql`SELECT 1 AS one FROM follows
        WHERE follower_id = ${followerId} AND followee_id = ${followeeId} LIMIT 1`,
  );
  return rows.length > 0;
}
