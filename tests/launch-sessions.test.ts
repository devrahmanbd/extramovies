import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// L1 — D1-backed sessions. Temp DB file only (never data/local.db).
// create → validate (role + csrf) → wrong-token rejected → expired rejected
// → logout destroys → clearExpired purges. Fast, no network.

async function makeSessionDb() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'launch-sessions-'));
  const file = path.join(dir, 'sessions.db');
  const Database = (await import('better-sqlite3')).default;
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const schema = await import('../src/lib/db/schema');
  const sqlite = new Database(file);
  sqlite.pragma('foreign_keys = ON');
  const ddl = await fs.readFile(
    path.join(process.cwd(), 'migrations', '0006_sessions.sql'),
    'utf8',
  );
  sqlite.exec(ddl);
  const db = drizzle(sqlite, { schema }) as never;
  return { db, sqlite, dir, file };
}

async function countRows(db: never): Promise<number> {
  const { dbExecute } = await import('../src/lib/db/adapter');
  const { sql } = await import('drizzle-orm');
  const rows = await dbExecute<{ n: number | string }>(
    db as never,
    sql`SELECT COUNT(*) AS n FROM sessions`,
  );
  return Number(rows[0]?.n ?? 0);
}

describe('launch L1 D1-backed sessions', () => {
  it('create → validate (role + csrf) for admin', async () => {
    const { db } = await makeSessionDb();
    const session = await import('../src/lib/auth/session');
    const { token, csrfToken } = await session.createSession('editor@example.com', db as never);
    expect(token).toBeTruthy();
    expect(csrfToken).toBeTruthy();
    const s = await session.getSession(token, db as never);
    expect(s?.email).toBe('editor@example.com');
    expect(s?.role ?? 'admin').toBe('admin');
    expect(s?.csrfToken).toBe(csrfToken);
  });

  it('member sessions carry role member + userId', async () => {
    const { db } = await makeSessionDb();
    const session = await import('../src/lib/auth/session');
    const { token, csrfToken } = await session.createMemberSession(
      'u_abc123',
      'Fan@Example.com',
      db as never,
    );
    const s = await session.getSession(token, db as never);
    expect(s?.role).toBe('member');
    expect(s?.userId).toBe('u_abc123');
    expect(s?.email).toBe('fan@example.com');
    expect(s?.csrfToken).toBe(csrfToken);
  });

  it('sessions persist in the DB (not process memory)', async () => {
    const { db } = await makeSessionDb();
    const session = await import('../src/lib/auth/session');
    const { token } = await session.createSession('editor@example.com', db as never);
    expect(await countRows(db)).toBe(1);
    // A fresh module state would lose an in-memory Map; the DB row is the source of truth.
    const { dbExecute } = await import('../src/lib/db/adapter');
    const { sql } = await import('drizzle-orm');
    const rows = await dbExecute<{ token: string }>(
      db as never,
      sql`SELECT token FROM sessions WHERE token = ${token}`,
    );
    expect(rows[0]?.token).toBe(token);
  });

  it('wrong-token rejected', async () => {
    const { db } = await makeSessionDb();
    const session = await import('../src/lib/auth/session');
    expect(await session.getSession('no-such-token', db as never)).toBeNull();
    expect(await session.getSession(null, db as never)).toBeNull();
    expect(await session.getSession(undefined, db as never)).toBeNull();
  });

  it('expired rejected + swept lazily on read', async () => {
    const { db } = await makeSessionDb();
    const session = await import('../src/lib/auth/session');
    const { dbExecute } = await import('../src/lib/db/adapter');
    const { sql } = await import('drizzle-orm');
    const past = new Date(Date.now() - 60_000).toISOString();
    const now = new Date().toISOString();
    await dbExecute(
      db as never,
      sql`INSERT INTO sessions (token, email, user_id, role, csrf_token, created_at, expires_at)
           VALUES ('tok-expired', 'e@example.com', NULL, 'admin', 'csrf-x', ${now}, ${past})`,
    );
    expect(await session.getSession('tok-expired', db as never)).toBeNull();
    expect(await countRows(db)).toBe(0);
  });

  it('logout destroys', async () => {
    const { db } = await makeSessionDb();
    const session = await import('../src/lib/auth/session');
    const { token } = await session.createSession('editor@example.com', db as never);
    expect(await session.getSession(token, db as never)).toBeTruthy();
    await session.destroySession(token, db as never);
    expect(await session.getSession(token, db as never)).toBeNull();
  });

  it('clearExpired purges only expired rows', async () => {
    const { db } = await makeSessionDb();
    const session = await import('../src/lib/auth/session');
    const { dbExecute } = await import('../src/lib/db/adapter');
    const { sql } = await import('drizzle-orm');
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();
    const now = new Date().toISOString();
    for (const t of ['tok-old-1', 'tok-old-2']) {
      await dbExecute(
        db as never,
        sql`INSERT INTO sessions (token, email, user_id, role, csrf_token, created_at, expires_at)
             VALUES (${t}, 'e@example.com', NULL, 'admin', 'c', ${now}, ${past})`,
      );
    }
    const live = await session.createSession('live@example.com', db as never);
    const purged = await session.clearExpired(db as never);
    expect(purged).toBe(2);
    expect(await session.getSession(live.token, db as never)).toBeTruthy();
    expect(await countRows(db)).toBe(1);
  });
});
