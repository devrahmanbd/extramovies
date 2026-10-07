import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// L1F — runtime-env DB resolution parity. Temp DB files only (never data/local.db).
// Defect: signup/login resolved req.db → locals.db → getDb({}) and never checked
// locals.runtime.env, while guards (resolveSessionDb) preferred the runtime env.
// Sessions were written to local SQLite and read from Miniflare/real D1 → 401s.
// These tests use a runtime-env-shaped fake ({ locals: { runtime: { env:
// { DB_FILE } } } }) so the "runtime env" is a temp SQLite file: pre-fix the
// member resolver ignored it (fell through to ./data/local.db) and the
// round-trip below returned null; post-fix both resolvers land on the same DB.

async function makeRuntimeDbFile(): Promise<{ dir: string; file: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'launch-dbres-'));
  const file = path.join(dir, 'runtime.db');
  const Database = (await import('better-sqlite3')).default;
  const sqlite = new Database(file);
  sqlite.pragma('foreign_keys = ON');
  const ddl = await fs.readFile(
    path.join(process.cwd(), 'migrations', '0006_sessions.sql'),
    'utf8',
  );
  sqlite.exec(ddl);
  sqlite.close();
  return { dir, file };
}

function runtimeReq(dbFile: string): Record<string, unknown> {
  return { locals: { runtime: { env: { DB_FILE: dbFile } } } };
}

function fakeRes(): { statusCode: number; body: unknown } & {
  status(code: number): never;
  json(body: unknown): unknown;
  setHeader(): void;
} {
  const captured = { statusCode: 200, body: null as unknown };
  return {
    ...captured,
    status(code: number) {
      (this as unknown as { statusCode: number }).statusCode = code;
      return this as never;
    },
    json(body: unknown) {
      (this as unknown as { body: unknown }).body = body;
      return body;
    },
    setHeader() {},
  } as never;
}

describe('launch L1F runtime-env DB resolution', () => {
  it('member + session resolvers honor locals.runtime.env (same DB)', async () => {
    const { file } = await makeRuntimeDbFile();
    const req = runtimeReq(file);
    const session = await import('../src/lib/auth/session');
    const members = await import('../src/lib/members/reviews');

    // Signup/login write path (now resolveSessionDb-based).
    const sessionDb = session.resolveSessionDb(req);
    const { token } = await session.createMemberSession('u_l1f', 'L1F@example.com', sessionDb);

    // Guard read path (resolveMemberDb + requireMemberApi).
    const memberDb = members.resolveMemberDb(req);
    const back = await session.getSession(token, memberDb as never);
    expect(back?.userId).toBe('u_l1f');
    expect(back?.role).toBe('member');
  });

  it('requireMemberApi guard validates a runtime-env session (no 401)', async () => {
    const { file } = await makeRuntimeDbFile();
    const session = await import('../src/lib/auth/session');
    const guard = await import('../src/lib/auth/guard');

    const { token } = await session.createMemberSession(
      'u_l1f2',
      'guard@example.com',
      session.resolveSessionDb(runtimeReq(file)),
    );
    const req = {
      method: 'GET',
      cookies: { admin_session: token },
      headers: {},
      ...runtimeReq(file),
    };
    const res = fakeRes();
    const auth = await guard.requireMemberApi(req as never, res as never);
    expect(auth?.session.userId).toBe('u_l1f2');
  });

  it('injected/test db still wins over runtime env', async () => {
    const { file } = await makeRuntimeDbFile();
    const session = await import('../src/lib/auth/session');
    const members = await import('../src/lib/members/reviews');
    const watchlist = await import('../src/lib/watchlist/store');

    const { db } = await (async () => {
      const Database = (await import('better-sqlite3')).default;
      const { drizzle } = await import('drizzle-orm/better-sqlite3');
      const schema = await import('../src/lib/db/schema');
      const sqlite = new Database(':memory:');
      return { db: drizzle(sqlite, { schema }) as never };
    })();
    const req = { db, locals: { runtime: { env: { DB_FILE: file } } } };
    expect(session.resolveSessionDb(req)).toBe(db);
    expect(members.resolveMemberDb(req)).toBe(db);
    expect(watchlist.resolveRequestDb(req)).toBe(db);
  });

  it('watchlist resolver honors locals.runtime.env too', async () => {
    const { file } = await makeRuntimeDbFile();
    const watchlist = await import('../src/lib/watchlist/store');
    const { getDb } = await import('../src/lib/db/adapter');
    const viaResolver = watchlist.resolveRequestDb(runtimeReq(file));
    // Same underlying file as a direct getDb({ DB_FILE }) open.
    expect(viaResolver).toBeTruthy();
    expect(getDb({ DB_FILE: file })).toBeTruthy();
  });

  it('empty dev D1 decoy loses to a configured DB_FILE (L4 mirror-image)', async () => {
    // Dev platformProxy always injects a (scratch, empty) Miniflare D1 binding
    // while .env declares DB_FILE as the dev store. Resolvers must ignore the
    // decoy binding and use the file — otherwise writes land in empty D1 while
    // page-level getDb({}) reads hit local.db (split-brain, mirrored).
    const { file } = await makeRuntimeDbFile();
    const session = await import('../src/lib/auth/session');
    const members = await import('../src/lib/members/reviews');
    const decoyDb = { __decoyD1: true };
    const req = { locals: { runtime: { env: { DB: decoyDb, DB_FILE: file } } } };
    const { token } = await session.createMemberSession(
      'u_decoy',
      'decoy@example.com',
      session.resolveSessionDb(req),
    );
    const back = await session.getSession(token, members.resolveMemberDb(req) as never);
    expect(back?.userId).toBe('u_decoy');
  });
});
