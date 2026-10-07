import { describe, expect, it, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

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

async function makeSocialDb() {
  const Database = (await import('better-sqlite3')).default;
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const schema = await import('../src/lib/db/schema');
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const migPath = path.join(process.cwd(), 'migrations', '0004_social.sql');
  const ddl = await fs.readFile(migPath, 'utf8');
  sqlite.exec(ddl);
  const sessPath = path.join(process.cwd(), 'migrations', '0006_sessions.sql');
  sqlite.exec(await fs.readFile(sessPath, 'utf8'));
  const db = drizzle(sqlite, { schema }) as never;
  return { db, sqlite };
}

describe('member validation edges', () => {
  it('validateHandle accepts good, rejects bad + reserved', async () => {
    const v = await import('../src/lib/users/validate');
    expect(v.validateHandle('moviefan_99').ok).toBe(true);
    expect(v.validateHandle('ab').ok).toBe(false);
    expect(v.validateHandle('a'.repeat(21)).ok).toBe(false);
    expect(v.validateHandle('MovieFan').ok).toBe(false);
    expect(v.validateHandle('bad-handle').ok).toBe(false);
    for (const r of ['admin', 'api', 'login', 'signup', 'u']) {
      expect(v.validateHandle(r).ok).toBe(false);
    }
  });

  it('validateEmail / validatePassword / validateDisplayName edges', async () => {
    const v = await import('../src/lib/users/validate');
    expect(v.validateEmail('fan@example.com').ok).toBe(true);
    expect(v.validateEmail('not-an-email').ok).toBe(false);
    expect(v.validateEmail('a@b').ok).toBe(false);
    expect(v.validateEmail(`${'a'.repeat(250)}@x.com`).ok).toBe(false);
    expect(v.validatePassword('0123456789').ok).toBe(true);
    expect(v.validatePassword('short').ok).toBe(false);
    expect(v.validateDisplayName('Cinephile').ok).toBe(true);
    expect(v.validateDisplayName('').ok).toBe(false);
    expect(v.validateDisplayName('x'.repeat(41)).ok).toBe(false);
  });
});

describe('member store (real sqlite)', () => {
  it('create + verify + duplicate handling with safe messages', async () => {
    const { db } = await makeSocialDb();
    const store = await import('../src/lib/users/store');
    const created = await store.createUser(db as never, {
      handle: 'moviefan_99',
      displayName: 'Movie Fan',
      email: 'Fan@Example.com',
      password: '0123456789abcdef',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.user.email).toBe('fan@example.com');
    expect(created.user.handle).toBe('moviefan_99');

    const dupHandle = await store.createUser(db as never, {
      handle: 'moviefan_99',
      displayName: 'Other',
      email: 'other@example.com',
      password: '0123456789abcdef',
    });
    expect(dupHandle.ok).toBe(false);
    if (dupHandle.ok) return;
    expect(dupHandle.error).toBe('handle taken');

    const dupEmail = await store.createUser(db as never, {
      handle: 'other_handle',
      displayName: 'Other',
      email: 'FAN@example.com',
      password: '0123456789abcdef',
    });
    expect(dupEmail.ok).toBe(false);
    if (dupEmail.ok) return;
    expect(dupEmail.error).toBe('email registered');

    const ok = await store.verifyUser(db as never, 'fan@example.com', '0123456789abcdef');
    expect(ok?.handle).toBe('moviefan_99');
    expect(await store.verifyUser(db as never, 'fan@example.com', 'wrongpassword1')).toBeNull();
    expect(await store.verifyUser(db as never, 'nobody@example.com', '0123456789abcdef')).toBeNull();

    expect((await store.getUserByHandle(db as never, 'moviefan_99'))?.id).toBe(created.user.id);
    expect((await store.getUserById(db as never, created.user.id))?.email).toBe('fan@example.com');
  });
});

describe('member session role round-trip', () => {
  it('admin path keeps role admin, member path sets role member', async () => {
    const { db } = await makeSocialDb();
    const session = await import('../src/lib/auth/session');
    const admin = await session.createSession('editor@example.com', db as never);
    const a = await session.getSession(admin.token, db as never);
    expect(a?.email).toBe('editor@example.com');
    expect(a?.role ?? 'admin').toBe('admin');
    expect(a?.userId).toBeUndefined();

    const member = await session.createMemberSession('u_abc123', 'fan@example.com', db as never);
    expect(member.token).toBeTruthy();
    expect(member.csrfToken).toBeTruthy();
    const m = await session.getSession(member.token, db as never);
    expect(m?.role).toBe('member');
    expect(m?.userId).toBe('u_abc123');
    await session.destroySession(member.token, db as never);
    expect(await session.getSession(member.token, db as never)).toBeNull();
  });
});

describe('member guards 401/403', () => {
  it('requireMemberApi blocks anonymous (401) and bad CSRF (403), passes with CSRF', async () => {
    const { db } = await makeSocialDb();
    const session = await import('../src/lib/auth/session');
    const guard = await import('../src/lib/auth/guard');
    const anon = mockRes() as never;
    expect(
      await guard.requireMemberApi({ method: 'GET', headers: {}, cookies: {}, db } as never, anon),
    ).toBeNull();
    expect((anon as unknown as ReturnType<typeof mockRes>).statusCode).toBe(401);

    const admin = await session.createSession('editor@example.com', db as never);
    const adminRes = mockRes() as never;
    expect(
      await guard.requireMemberApi(
        { method: 'GET', headers: {}, cookies: { admin_session: admin.token }, db } as never,
        adminRes,
      ),
    ).toBeNull();
    expect((adminRes as unknown as ReturnType<typeof mockRes>).statusCode).toBe(401);

    const { token, csrfToken } = await session.createMemberSession('u_1', 'fan@example.com', db as never);
    const noCsrf = mockRes() as never;
    expect(
      await guard.requireMemberApi(
        {
          method: 'POST',
          headers: { cookie: `admin_session=${token}` },
          cookies: { admin_session: token },
          db,
        } as never,
        noCsrf,
      ),
    ).toBeNull();
    expect((noCsrf as unknown as ReturnType<typeof mockRes>).statusCode).toBe(403);

    const okRes = mockRes() as never;
    const out = await guard.requireMemberApi(
      {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken, cookie: `admin_session=${token}` },
        cookies: { admin_session: token },
        db,
      } as never,
      okRes,
    );
    expect(out?.session.userId).toBe('u_1');
  });

  it('requireAdminApi still passes (no regression)', async () => {
    const { db } = await makeSocialDb();
    const session = await import('../src/lib/auth/session');
    const guard = await import('../src/lib/auth/guard');
    const { token, csrfToken } = await session.createSession('editor@example.com', db as never);
    const res = mockRes() as never;
    const out = await guard.requireAdminApi(
      {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken, cookie: `admin_session=${token}` },
        cookies: { admin_session: token },
        db,
      } as never,
      res,
    );
    expect(out?.session.email).toBe('editor@example.com');
  });
});

describe('member auth api (signup/login/logout)', () => {
  beforeEach(async () => {
    try {
      const signup = await import('../src/pages/api/auth/signup');
      (signup as { __clearSignupThrottle?: () => void }).__clearSignupThrottle?.();
    } catch {
      /* RED phase: module missing */
    }
  });

  it('signup validates, auto-logs-in, and throttles at 5/hour per IP', async () => {
    const { db } = await makeSocialDb();
    const signupMod = await import('../src/pages/api/auth/signup');
    const signup = signupMod.default as Function;
    const ip = `signup-ip-${Date.now()}`;

    const badReq = {
      method: 'POST',
      body: { handle: 'ab', displayName: 'F', email: 'bad', password: 'short' },
      headers: {},
      cookies: {},
      socket: { remoteAddress: ip },
      db,
    } as never;
    const badRes = mockRes() as never;
    await signup(badReq, badRes);
    expect((badRes as unknown as ReturnType<typeof mockRes>).statusCode).toBe(400);

    for (let i = 0; i < 5; i++) {
      const req = {
        method: 'POST',
        body: {
          handle: `fan_${Date.now()}_${i}`,
          displayName: `Fan ${i}`,
          email: `fan${Date.now()}_${i}@example.com`,
          password: '0123456789abcdef',
        },
        headers: {},
        cookies: {},
        socket: { remoteAddress: `throttle-ip-${Date.now()}` },
        db,
      } as never;
      const res = mockRes() as never;
      await signup(req, res);
      expect((res as unknown as ReturnType<typeof mockRes>).statusCode).toBe(200);
      expect((res as unknown as ReturnType<typeof mockRes>).body as { ok: boolean }).toMatchObject({
        ok: true,
      });
    }
    const limitedRes = mockRes() as never;
    await signup(
      {
        method: 'POST',
        body: {
          handle: 'one_more_handle',
          displayName: 'One More',
          email: 'onemore@example.com',
          password: '0123456789abcdef',
        },
        headers: {},
        cookies: {},
        socket: { remoteAddress: `throttle-ip-${Date.now()}` },
        db,
      } as never,
      limitedRes,
    );
    // Fresh IP above passes; same-IP flood is asserted below with a fixed IP.
    void limitedRes;

    const fixedIp = `flood-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      const res = mockRes() as never;
      await signup(
        {
          method: 'POST',
          body: {
            handle: `flood${i}_${Date.now()}`,
            displayName: `Flood ${i}`,
            email: `flood${i}_${Date.now()}@example.com`,
            password: '0123456789abcdef',
          },
          headers: {},
          cookies: {},
          socket: { remoteAddress: fixedIp },
          db,
        } as never,
        res,
      );
      expect((res as unknown as ReturnType<typeof mockRes>).statusCode).toBe(200);
    }
    const blocked = mockRes() as never;
    await signup(
      {
        method: 'POST',
        body: {
          handle: 'blocked_handle',
          displayName: 'Blocked',
          email: 'blocked@example.com',
          password: '0123456789abcdef',
        },
        headers: {},
        cookies: {},
        socket: { remoteAddress: fixedIp },
        db,
      } as never,
      blocked,
    );
    expect((blocked as unknown as ReturnType<typeof mockRes>).statusCode).toBe(429);
  });

  it('login uses generic errors + logout destroys session', async () => {
    const { db } = await makeSocialDb();
    const store = await import('../src/lib/users/store');
    const created = await store.createUser(db as never, {
      handle: 'loginfan',
      displayName: 'Login Fan',
      email: 'loginfan@example.com',
      password: '0123456789abcdef',
    });
    expect(created.ok).toBe(true);

    const login = (await import('../src/pages/api/auth/login')).default as Function;
    const badRes = mockRes() as never;
    await login(
      {
        method: 'POST',
        body: { email: 'loginfan@example.com', password: 'wrongpassword1' },
        headers: {},
        cookies: {},
        socket: { remoteAddress: 'unknown' },
        db,
      } as never,
      badRes,
    );
    expect((badRes as unknown as ReturnType<typeof mockRes>).statusCode).toBe(401);
    expect((badRes as unknown as ReturnType<typeof mockRes>).body).toMatchObject({
      ok: false,
    });

    const okRes = mockRes() as never;
    await login(
      {
        method: 'POST',
        body: { email: 'loginfan@example.com', password: '0123456789abcdef' },
        headers: {},
        cookies: {},
        socket: { remoteAddress: 'unknown' },
        db,
      } as never,
      okRes,
    );
    expect((okRes as unknown as ReturnType<typeof mockRes>).statusCode).toBe(200);
    const setCookie: string = (okRes as unknown as ReturnType<typeof mockRes>).headers['Set-Cookie'] ?? '';
    const token = /admin_session=([^;]+)/.exec(setCookie)?.[1] ?? '';
    expect(token).toBeTruthy();

    const logout = (await import('../src/pages/api/auth/logout')).default as Function;
    const outRes = mockRes() as never;
    await logout(
      { method: 'POST', headers: {}, cookies: { admin_session: token }, db } as never,
      outRes,
    );
    expect((outRes as unknown as ReturnType<typeof mockRes>).statusCode).toBe(200);
    const session = await import('../src/lib/auth/session');
    expect(await session.getSession(token, db as never)).toBeNull();
  });
});
