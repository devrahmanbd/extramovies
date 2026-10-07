/**
 * Member user store — drizzle-portable via dbExecute (D1 + better-sqlite3).
 * Never use db.execute directly: this drizzle version's better-sqlite3
 * session exposes `.all`, not `.execute` (see lib/db/adapter).
 */
import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { dbExecute } from '../db/adapter';
import { hashPassword, verifyPassword } from '../auth/password';
import {
  validateDisplayName,
  validateEmail,
  validateHandle,
  validatePassword,
} from './validate';

export interface MemberUser {
  id: string;
  handle: string;
  displayName: string;
  email: string;
  bio: string;
  createdAt: string;
}

export interface CreateUserInput {
  handle: string;
  displayName: string;
  email: string;
  password: string;
}

type AnyDb = Parameters<typeof dbExecute>[0];

interface UserRow {
  id: string;
  handle: string;
  display_name: string;
  email: string;
  password_hash: string;
  bio: string;
  created_at: string;
}

function toUser(row: UserRow): MemberUser {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    email: row.email,
    bio: row.bio ?? '',
    createdAt: row.created_at,
  };
}

function newUserId(): string {
  return `u_${randomBytes(8).toString('hex')}`;
}

function newReviewId(): string {
  return `mr_${randomBytes(8).toString('hex')}`;
}

export { newReviewId };

export async function createUser(
  db: AnyDb,
  input: CreateUserInput,
): Promise<{ ok: true; user: MemberUser } | { ok: false; error: string }> {
  const handle = String(input.handle ?? '').trim().toLowerCase();
  const email = String(input.email ?? '').trim().toLowerCase();
  const displayName = String(input.displayName ?? '').trim();
  const password = String(input.password ?? '');

  const h = validateHandle(handle);
  if (!h.ok) return { ok: false, error: (h as { error: string }).error };
  const d = validateDisplayName(displayName);
  if (!d.ok) return { ok: false, error: (d as { error: string }).error };
  const e = validateEmail(email);
  if (!e.ok) return { ok: false, error: (e as { error: string }).error };
  const p = validatePassword(password);
  if (!p.ok) return { ok: false, error: (p as { error: string }).error };

  const byHandle = await dbExecute<UserRow>(
    db,
    sql`SELECT id FROM users WHERE handle = ${handle} LIMIT 1`,
  );
  if (byHandle.length > 0) return { ok: false, error: 'handle taken' };

  const byEmail = await dbExecute<UserRow>(
    db,
    sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`,
  );
  if (byEmail.length > 0) return { ok: false, error: 'email registered' };

  const id = newUserId();
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(password);

  try {
    await dbExecute(
      db,
      sql`INSERT INTO users (id, handle, display_name, email, password_hash, bio, created_at) VALUES (${id}, ${handle}, ${displayName}, ${email}, ${passwordHash}, ${''}, ${now})`,
    );
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err).toLowerCase();
    if (msg.includes('email')) return { ok: false, error: 'email registered' };
    if (msg.includes('handle') || msg.includes('unique')) return { ok: false, error: 'handle taken' };
    throw err;
  }

  return {
    ok: true,
    user: { id, handle, displayName, email, bio: '', createdAt: now },
  };
}

/** Generic failure (null) — never reveals whether email or password was wrong. */
export async function verifyUser(
  db: AnyDb,
  email: string,
  password: string,
): Promise<MemberUser | null> {
  if (typeof email !== 'string' || typeof password !== 'string') return null;
  if (!password) return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const rows = await dbExecute<UserRow>(
    db,
    sql`SELECT id, handle, display_name, email, password_hash, bio, created_at FROM users WHERE email = ${normalized} LIMIT 1`,
  );
  const row = rows[0];
  if (!row) return null;
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return null;
  return toUser(row);
}

export async function getUserByHandle(db: AnyDb, handle: string): Promise<MemberUser | null> {
  if (typeof handle !== 'string') return null;
  const normalized = handle.trim().toLowerCase();
  if (!normalized) return null;
  const rows = await dbExecute<UserRow>(
    db,
    sql`SELECT id, handle, display_name, email, password_hash, bio, created_at FROM users WHERE handle = ${normalized} LIMIT 1`,
  );
  return rows[0] ? toUser(rows[0]) : null;
}

export async function getUserById(db: AnyDb, id: string): Promise<MemberUser | null> {
  if (typeof id !== 'string' || !id) return null;
  const rows = await dbExecute<UserRow>(
    db,
    sql`SELECT id, handle, display_name, email, password_hash, bio, created_at FROM users WHERE id = ${id} LIMIT 1`,
  );
  return rows[0] ? toUser(rows[0]) : null;
}
