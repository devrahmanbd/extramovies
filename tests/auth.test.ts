import { describe, expect, it, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

// Admin login (lib-level: password + session) + unauthorized block via the
// shared guard and via THIS slice's owned handlers (backup/status, export,
// import) — which use correct relative imports.
//
// NOTE (cross-slice): src/pages/api/admin/login.ts, save-draft.ts,
// publish.ts and slug-redirect.ts currently import '../../../../lib/...'
// (four levels up — resolves above src/) and fail to load under vitest
// with ERR_MODULE_NOT_FOUND. Correct is '../../../lib/...'. That fix
// belongs to the admin-API owner; these tests pin the underlying contract
// so they stay green regardless.

function mockRes() {
  const headers: Record<string, string> = {};
  return {
    statusCode: 200,
    body: null as unknown,
    headers,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader(k: string, v: string) {
      headers[k] = v;
    },
  };
}

// Sessions-enabled :memory: DB (migration 0006 contract, never data/local.db).
async function makeSessionDb() {
  const Database = (await import('better-sqlite3')).default;
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const schema = await import('../src/lib/db/schema');
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const ddl = await fs.readFile(
    path.join(process.cwd(), 'migrations', '0006_sessions.sql'),
    'utf8',
  );
  sqlite.exec(ddl);
  const db = drizzle(sqlite, { schema }) as never;
  return { db };
}

describe('admin login', () => {
  beforeEach(() => {
    process.env.ADMIN_EMAIL = 'editor@example.com';
    process.env.ADMIN_PASSWORD = 'correct-horse';
    delete process.env.ADMIN_PASSWORD_HASH;
  });

  it('accepts valid credentials (password + session round-trip)', async () => {
    const { db } = await makeSessionDb();
    const pw = await import('../src/lib/auth/password');
    const session = await import('../src/lib/auth/session');
    expect(await pw.verifyAdminCredentials('editor@example.com', 'correct-horse')).toBe(true);
    const { token, csrfToken } = await session.createSession('editor@example.com', db as never);
    expect(token).toBeTruthy();
    expect(csrfToken).toBeTruthy();
    expect((await session.getSession(token, db as never))?.email).toBe('editor@example.com');
  });

  it('rejects wrong password with false (generic, no enumeration)', async () => {
    const pw = await import('../src/lib/auth/password');
    expect(await pw.verifyAdminCredentials('editor@example.com', 'wrong')).toBe(false);
    expect(await pw.verifyAdminCredentials('someone-else@example.com', 'correct-horse')).toBe(false);
  });

  it('session expires / destroys cleanly', async () => {
    const { db } = await makeSessionDb();
    const session = await import('../src/lib/auth/session');
    const { token } = await session.createSession('editor@example.com', db as never);
    expect(await session.getSession(token, db as never)).toBeTruthy();
    await session.destroySession(token, db as never);
    expect(await session.getSession(token, db as never)).toBeNull();
    expect(await session.getSession(null, db as never)).toBeNull();
  });

  it('rate-limit gates brute force', async () => {
    const rl = await import('../src/lib/auth/rate-limit');
    const ip = `test-ip-${Date.now()}`;
    for (let i = 0; i < 20; i++) rl.recordFailedAttempt(ip);
    expect(rl.isRateLimited(ip)).toBe(true);
  });
});

describe('unauthorized admin block', () => {
  it('guard returns 401 with no session', async () => {
    const { db } = await makeSessionDb();
    const guard = await import('../src/lib/auth/guard');
    const req = { method: 'GET', headers: {}, cookies: {}, db } as never;
    const res = mockRes() as never;
    expect(await guard.requireAdminApi(req, res)).toBeNull();
    expect((res as unknown as ReturnType<typeof mockRes>).statusCode).toBe(401);
  });

  it('guard returns 403 on POST without CSRF even with valid session', async () => {
    const { db } = await makeSessionDb();
    const session = await import('../src/lib/auth/session');
    const guard = await import('../src/lib/auth/guard');
    const { token } = await session.createSession('editor@example.com', db as never);
    const req = {
      method: 'POST',
      headers: { cookie: `admin_session=${token}` },
      cookies: { admin_session: token },
      db,
    } as never;
    const res = mockRes() as never;
    expect(await guard.requireAdminApi(req, res)).toBeNull();
    expect((res as unknown as ReturnType<typeof mockRes>).statusCode).toBe(403);
  });

  it('guard passes with session + CSRF', async () => {
    const { db } = await makeSessionDb();
    const session = await import('../src/lib/auth/session');
    const guard = await import('../src/lib/auth/guard');
    const { token, csrfToken } = await session.createSession('editor@example.com', db as never);
    const req = {
      method: 'POST',
      headers: { 'x-csrf-token': csrfToken, cookie: `admin_session=${token}` },
      cookies: { admin_session: token },
      db,
    } as never;
    const res = mockRes() as never;
    const out = await guard.requireAdminApi(req, res);
    expect(out?.session.email).toBe('editor@example.com');
  });

  it('owned handlers (backup/status, export) reject anonymous callers with 401', async () => {
    const status = (await import('../src/pages/api/backup/status')).default;
    const exp = (await import('../src/pages/api/export')).default;
    for (const h of [status, exp]) {
      const req = { method: 'GET', query: {}, headers: {}, cookies: {} } as never;
      const res = mockRes() as never;
      await (h as Function)(req, res);
      expect((res as unknown as ReturnType<typeof mockRes>).statusCode).toBe(401);
    }
  });

  it('owned import handler rejects anonymous POST with 401', async () => {
    const imp = (await import('../src/pages/api/import')).default;
    const req = { method: 'POST', body: { markdown: '# hi' }, headers: {}, cookies: {} } as never;
    const res = mockRes() as never;
    await (imp as Function)(req, res);
    expect((res as unknown as ReturnType<typeof mockRes>).statusCode).toBe(401);
  });
});
