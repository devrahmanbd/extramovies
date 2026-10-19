import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Task 1 (CWV): /uploads/* must serve a 7-day cache header + ETag validator,
// short-circuit repeated GETs to a bodyless 304 (If-None-Match), keep the
// traversal guard a 404 (even when the escaped file actually exists outside
// the uploads root), and never 500 on ETag/stream-derive failures.
// Temp dirs only (never data/uploads); the [...path] route module is invoked
// with a params/request-shaped context like the Astro runtime provides.

const SVG = Buffer.from('<svg xmlns="http://x"></svg>', 'utf8');
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);

type UploadsModule = typeof import('../src/pages/uploads/[...path]');

describe('uploads route headers (CWV task 1)', () => {
  let outer: string;
  let uploadsDir: string;
  let savedUploadsDir: string | undefined;

  beforeEach(async () => {
    outer = await fs.mkdtemp(path.join(os.tmpdir(), 'uploads-headers-'));
    uploadsDir = path.join(outer, 'uploads');
    await fs.mkdir(uploadsDir);
    await fs.writeFile(path.join(uploadsDir, 'logo.svg'), SVG);
    // A resolvable file OUTSIDE the uploads root: proves the traversal guard
    // 404s a real escape path, not just a missing-file coincidence.
    await fs.writeFile(path.join(outer, 'outside.png'), PNG);
    savedUploadsDir = process.env.UPLOADS_DIR_PATH;
    process.env.UPLOADS_DIR_PATH = uploadsDir;
  });

  afterAll(async () => {
    if (savedUploadsDir !== undefined) process.env.UPLOADS_DIR_PATH = savedUploadsDir;
    else delete process.env.UPLOADS_DIR_PATH;
    await fs.rm(outer, { recursive: true, force: true });
  });

  async function route(): Promise<UploadsModule> {
    return import('../src/pages/uploads/[...path]');
  }

  function ctx(paramsPath: string[], headers?: Record<string, string>): never {
    return {
      params: { path: paramsPath },
      request: new Request('http://localhost:3100/uploads/' + paramsPath.join('/'), { headers }),
    } as never;
  }

  it('200 serves Cache-Control 7d + ETag + content-type and the full body', async () => {
    const { GET } = await route();
    const res = (await GET(ctx(['logo.svg']))) as Response;
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=604800');
    expect(res.headers.get('ETag')?.length ?? 0).toBeGreaterThan(4);
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(await res.text()).toBe(SVG.toString('utf8'));
  });

  it('If-None-Match repeat → 304 with no body (zero-byte revalidation)', async () => {
    const { GET } = await route();
    const first = (await GET(ctx(['logo.svg']))) as Response;
    const etag = first.headers.get('ETag');
    expect(etag).toBeTruthy();
    const second = (await GET(ctx(['logo.svg'], { 'If-None-Match': etag! }))) as Response;
    expect(second.status).toBe(304);
    expect(await second.text()).toBe('');
    expect(second.headers.get('ETag')).toBe(etag);
    expect(second.headers.get('Cache-Control')).toBe('public, max-age=604800');
    expect(second.headers.get('Content-Type')).toBeNull();
  });

  it('If-None-Match "*" validates to 304', async () => {
    const { GET } = await route();
    const res = (await GET(ctx(['logo.svg'], { 'If-None-Match': '*' }))) as Response;
    expect(res.status).toBe(304);
    expect(await res.text()).toBe('');
  });

  it('stale validator after mtime change → 200 again with a new ETag', async () => {
    const { GET } = await route();
    const first = (await GET(ctx(['logo.svg']))) as Response;
    const oldEtag = first.headers.get('ETag')!;
    expect(oldEtag).toBeTruthy();
    // Rewritten asset far in the future: validator must flip so clients re-fetch.
    await fs.utimes(path.join(uploadsDir, 'logo.svg'), 1780000000, 1780000000);
    const second = (await GET(ctx(['logo.svg'], { 'If-None-Match': oldEtag }))) as Response;
    expect(second.status).toBe(200);
    expect(second.headers.get('ETag')).not.toBe(oldEtag);
    expect(second.headers.get('ETag')).toBeTruthy();
    expect(await second.text()).toBe(SVG.toString('utf8'));
  });

  it('traversal ../outside.png → 404 even though the file exists outside the root', async () => {
    const { GET } = await route();
    const res = (await GET(ctx(['..', 'outside.png']))) as Response;
    expect(res.status).toBe(404);
    // No 7d cache header leaked onto an error response either.
    expect(res.headers.get('Cache-Control')).toBeNull();
  });

  it('missing file and unknown extension stay 404', async () => {
    const { GET } = await route();
    expect(((await GET(ctx(['nope.svg']))) as Response).status).toBe(404);
    expect(((await GET(ctx(['outside.txt']))) as Response).status).toBe(404);
  });
});
