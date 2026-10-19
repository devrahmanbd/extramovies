/**
 * Offline self-test for scripts/seo/cwv-baseline.mjs.
 *
 * A local stub serves BOTH the sitemap and a PageSpeed-Insights-shaped payload,
 * so the whole capture + diff flow is exercised without touching the network:
 *   - PSI_BASE_URL points the script at the stub
 *   - the sitemap URL is passed as the CLI argument
 *
 * Pins the behaviours the brief demands:
 *   1. a run writes a snapshot with the documented shape
 *   2. a self-diff of that snapshot reports "no change" and exits 0
 *   3. a rate-limited URL is recorded as `skipped` and never fails the run
 *      (a fully-skipped run is a quiet pass)
 *   4. a score drop > 5 points or a metric bucket regression exits 1
 *
 * Plus the fix round:
 *   5. the snapshot records strategy / sitemap / limit
 *   6. mismatched strategies are never compared (exit 3, no false regression)
 *   7. only URLs present in BOTH snapshots are scored, the rest are "missing"
 *   8. failure reasons are sanitized (no key / query leak)
 *   9. a non-default PSI endpoint may not write the default snapshot path
 *  10. an improved diff prints "improved", not "no change"
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'seo', 'cwv-baseline.mjs');
const DEFAULT_SNAPSHOT_DIR = path.join(REPO_ROOT, 'docs', 'seo');

/** PSI payload shaped like a real v5 runPagespeed response (score is 0..1). */
function psiPayload(score: number, lcp: number, inp: number, cls: number) {
  return {
    analysisUTCTimestamp: '2026-10-19T00:00:00.000Z',
    lighthouseResult: {
      requestedUrl: 'https://example.test/',
      finalUrl: 'https://example.test/',
      categories: {
        performance: { id: 'performance', title: 'Performance', score },
        seo: { id: 'seo', title: 'SEO', score: 0.9 },
      },
      audits: {
        'largest-contentful-paint': { id: 'largest-contentful-paint', numericValue: lcp },
        'interaction-to-next-paint': { id: 'interaction-to-next-paint', numericValue: inp },
        'cumulative-layout-shift': { id: 'cumulative-layout-shift', numericValue: cls },
        'total-blocking-time': { id: 'total-blocking-time', numericValue: 120 },
      },
    },
    loadingExperience: {
      metrics: {
        LARGEST_CONTENTFUL_PAINT_MS: { percentile: lcp },
        INTERACTION_TO_NEXT_PAINT: { percentile: inp },
        CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: cls },
      },
    },
  };
}

let server: Server;
let origin = '';
let workDir = '';

/** Paths the stub rate-limits (HTTP 429), like the real free tier. */
const RATE_LIMITED_PATHS = ['/b/', '/b-one/', '/b-two/'];

function isRateLimited(target: string) {
  try {
    return RATE_LIMITED_PATHS.includes(new URL(target).pathname);
  } catch {
    return false;
  }
}

/**
 * Per-path / per-strategy PSI payloads.
 * The desktop payload is deliberately WORSE than mobile: if a desktop run were
 * ever compared against a mobile baseline it would look like a score drop.
 */
function payloadFor(target: string, strategy: string) {
  const pathname = new URL(target).pathname;
  if (strategy === 'desktop') {
    if (pathname.includes('/bucket/')) return psiPayload(0.62, 4200, 640, 0.31);
    return psiPayload(0.6, 3900, 600, 0.3);
  }
  if (pathname.includes('/bucket/')) return psiPayload(0.85, 3000, 180, 0.05); // lcp: needs-improvement
  return psiPayload(0.85, 2100, 180, 0.05); // lcp/inp/cls: all good
}

function send(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function sitemapXml(paths: string[]) {
  const entries = paths.map((p) => `<url><loc>${origin}${p}</loc></url>`).join('');
  return '<?xml version="1.0" encoding="UTF-8"?>'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    + `${entries}</urlset>`;
}

function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', origin);

  if (url.pathname === '/sitemap.xml') {
    res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' });
    res.end(sitemapXml(['/a/', '/b/']));
    return;
  }
  if (url.pathname === '/sitemap-one.xml') {
    res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' });
    res.end(sitemapXml(['/a/']));
    return;
  }
  if (url.pathname === '/sitemap-skip-only.xml') {
    res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' });
    res.end(sitemapXml(['/b-one/', '/b-two/']));
    return;
  }
  if (url.pathname === '/sitemap-bucket.xml') {
    res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' });
    res.end(sitemapXml(['/bucket/']));
    return;
  }
  if (url.pathname === '/runPagespeed') {
    const target = url.searchParams.get('url') || '';
    if (isRateLimited(target)) {
      send(res, 429, { error: { code: 429, message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } });
      return;
    }
    send(res, 200, payloadFor(target, url.searchParams.get('strategy') || 'mobile'));
    return;
  }

  send(res, 404, { error: { code: 404, message: 'not found' } });
}

beforeAll(async () => {
  server = createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('stub server did not bind a port');
  origin = `http://127.0.0.1:${address.port}`;
  workDir = await mkdtemp(path.join(tmpdir(), 'cwv-baseline-'));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

function runScript(args: string[], env: Record<string, string> = {}) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, PSI_BASE_URL: `${origin}/runPagespeed`, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

function snapshotPath(name: string) {
  return path.join(workDir, name);
}

describe('cwv-baseline script (offline stub)', () => {
  it('writes a snapshot with the documented shape', async () => {
    const out = snapshotPath('baseline-cwv-2026-10-19.json');
    const run = await runScript([`${origin}/sitemap.xml`, '--out', out]);

    expect(run.stderr).toBe('');
    expect(run.code).toBe(0);

    const snapshot = JSON.parse(await readFile(out, 'utf8'));
    expect(Object.keys(snapshot).sort()).toEqual(['date', 'limit', 'sitemap', 'strategy', 'urls']);
    expect(snapshot.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(snapshot.urls)).toBe(true);
    expect(snapshot.urls).toHaveLength(2);

    const measured = snapshot.urls.find((row: { url: string }) => row.url === `${origin}/a/`);
    expect(measured.ps).toEqual({ score: 85, lcp: 2100, inp: 180, cls: 0.05 });

    const limited = snapshot.urls.find((row: { url: string }) => row.url === `${origin}/b/`);
    expect(limited.ps).toBe('skipped');
  });

  it('records the strategy, the sitemap source and the limit', async () => {
    const out = snapshotPath('capture-context.json');
    const run = await runScript([`${origin}/sitemap-one.xml`, '--out', out, '--limit', '5']);

    expect(run.code).toBe(0);
    const snapshot = JSON.parse(await readFile(out, 'utf8'));
    expect(snapshot.strategy).toEqual(['mobile']);
    expect(snapshot.sitemap).toBe(`${origin}/sitemap-one.xml`);
    expect(snapshot.limit).toBe(5);
  });

  it('self-diffs the snapshot it just wrote: no change, exit 0', async () => {
    const baseline = snapshotPath('self-diff-baseline.json');
    const current = snapshotPath('self-diff-current.json');

    const first = await runScript([`${origin}/sitemap.xml`, '--out', baseline]);
    expect(first.code).toBe(0);

    const second = await runScript([`${origin}/sitemap.xml`, '--out', current, '--against', baseline]);
    expect(second.code).toBe(0);
    expect(second.stdout).toContain('no change');
    expect(second.stdout).not.toContain('REGRESSION');
  });

  it('records a rate-limited URL as skipped and still exits 0', async () => {
    const out = snapshotPath('skipped.json');
    const run = await runScript([`${origin}/sitemap.xml`, '--out', out]);

    expect(run.code).toBe(0);
    expect(run.stdout).toContain('skipped');
    const snapshot = JSON.parse(await readFile(out, 'utf8'));
    expect(snapshot.urls.filter((row: { ps: unknown }) => row.ps === 'skipped')).toHaveLength(1);
  });

  it('treats a fully-skipped run as a quiet pass', async () => {
    const out = snapshotPath('all-skipped.json');
    const run = await runScript([`${origin}/sitemap-skip-only.xml`, '--out', out]);

    expect(run.code).toBe(0);
    const snapshot = JSON.parse(await readFile(out, 'utf8'));
    expect(snapshot.urls.every((row: { ps: unknown }) => row.ps === 'skipped')).toBe(true);

    const diff = await runScript([
      `${origin}/sitemap-skip-only.xml`,
      '--out',
      snapshotPath('all-skipped-current.json'),
      '--against',
      out,
    ]);
    expect(diff.code).toBe(0);
    expect(diff.stdout).toContain('no change');
  });

  it('exits 1 when the performance score drops by more than 5 points', async () => {
    const baseline = snapshotPath('score-baseline.json');
    await writeFile(
      baseline,
      JSON.stringify({
        date: '2026-10-01',
        urls: [{ url: `${origin}/a/`, ps: { score: 95, lcp: 2100, inp: 180, cls: 0.05 } }],
      }),
      'utf8',
    );

    const run = await runScript([
      `${origin}/sitemap.xml`,
      '--out',
      snapshotPath('score-current.json'),
      '--against',
      baseline,
    ]);

    expect(run.code).toBe(1);
    expect(run.stdout).toContain('REGRESSION');
  });

  it('exits 1 when a metric bucket regresses a category', async () => {
    const baseline = snapshotPath('bucket-baseline.json');
    await writeFile(
      baseline,
      JSON.stringify({
        date: '2026-10-01',
        strategy: ['mobile'],
        sitemap: `${origin}/sitemap-bucket.xml`,
        limit: 20,
        urls: [{ url: `${origin}/bucket/`, ps: { score: 85, lcp: 1800, inp: 180, cls: 0.05 } }],
      }),
      'utf8',
    );

    const run = await runScript([
      `${origin}/sitemap-bucket.xml`,
      '--out',
      snapshotPath('bucket-current.json'),
      '--against',
      baseline,
    ]);

    expect(run.code).toBe(1);
    expect(run.stdout).toContain('REGRESSION');
    expect(run.stdout).toContain('good -> needs-improvement');
  });

  it('captures both strategies with --strategy both', async () => {
    const out = snapshotPath('both.json');
    const run = await runScript([`${origin}/sitemap.xml`, '--out', out, '--strategy', 'both']);

    expect(run.code).toBe(0);
    const snapshot = JSON.parse(await readFile(out, 'utf8'));
    expect(snapshot.strategy).toEqual(['mobile', 'desktop']);
    const measured = snapshot.urls.find((row: { url: string }) => row.url === `${origin}/a/`);
    expect(measured.ps.score).toBe(85);
    expect(measured.psDesktop.score).toBe(60);
  });

  it('exits 2 on an unreachable sitemap (never a silent empty snapshot)', async () => {
    const run = await runScript([`${origin}/does-not-exist.xml`, '--out', snapshotPath('nope.json')]);
    expect(run.code).toBe(2);
    expect(run.stderr).toContain('sitemap');
  });
});

describe('cwv-baseline fix round: capture context is part of the snapshot', () => {
  it('never compares mismatched strategies (exit 3, no false regression)', async () => {
    const mobile = snapshotPath('strategy-mobile.json');
    const desktop = snapshotPath('strategy-desktop.json');

    const mobileRun = await runScript([`${origin}/sitemap.xml`, '--out', mobile, '--strategy', 'mobile']);
    expect(mobileRun.code).toBe(0);
    const desktopRun = await runScript([`${origin}/sitemap.xml`, '--out', desktop, '--strategy', 'desktop']);
    expect(desktopRun.code).toBe(0);

    // The desktop payload is much worse than mobile: compared blindly it would
    // be a 25-point score drop. It must not be reported as a regression.
    const run = await runScript([
      `${origin}/sitemap.xml`,
      '--out',
      snapshotPath('strategy-current.json'),
      '--strategy',
      'desktop',
      '--against',
      mobile,
    ]);

    expect(run.code).toBe(3);
    expect(run.stdout).toContain('strategy mismatch');
    expect(run.stdout).not.toContain('REGRESSION');
  });

  it('scores only URLs present in both snapshots and reports the rest as missing', async () => {
    const twoUrls = snapshotPath('two-urls.json');
    const oneUrl = snapshotPath('one-url.json');

    const first = await runScript([`${origin}/sitemap.xml`, '--out', twoUrls]);
    expect(first.code).toBe(0);
    const second = await runScript([`${origin}/sitemap-one.xml`, '--out', oneUrl]);
    expect(second.code).toBe(0);

    // /b/ is in the baseline but not in this run -> missing, never a regression.
    const fewer = await runScript([
      `${origin}/sitemap-one.xml`,
      '--out',
      snapshotPath('fewer-current.json'),
      '--against',
      twoUrls,
    ]);
    expect(fewer.code).toBe(0);
    expect(fewer.stdout).toContain('missing from this run');
    expect(fewer.stdout).not.toContain('REGRESSION');

    // /b/ is in this run but not in the baseline -> missing, never a regression.
    const more = await runScript([
      `${origin}/sitemap.xml`,
      '--out',
      snapshotPath('more-current.json'),
      '--against',
      oneUrl,
    ]);
    expect(more.code).toBe(0);
    expect(more.stdout).toContain('missing from the baseline snapshot');
    expect(more.stdout).not.toContain('REGRESSION');
  });
});

describe('cwv-baseline fix round: sanitized reasons and output guards', () => {
  it('never leaks a key or a query string through a failure reason', async () => {
    const out = snapshotPath('sanitized.json');
    const run = await runScript(
      [`${origin}/sitemap.xml`, '--out', out],
      { PSI_BASE_URL: 'not a valid url?url=x&key=SUPERSECRET' },
    );

    // A malformed endpoint skips every URL but never aborts the run.
    expect(run.code).toBe(0);
    expect(run.stdout).not.toContain('SUPERSECRET');
    expect(run.stdout).toMatch(/\[(query|redacted)\]/);

    const snapshot = await readFile(out, 'utf8');
    expect(snapshot).not.toContain('SUPERSECRET');

    // A key parameter outside a query string is redacted too.
    const bare = await runScript(
      [`${origin}/sitemap.xml`, '--out', snapshotPath('sanitized-bare.json')],
      { PSI_BASE_URL: 'not a valid url key=ANOTHERSECRET' },
    );
    expect(bare.code).toBe(0);
    expect(bare.stdout).not.toContain('ANOTHERSECRET');
    expect(bare.stdout).toContain('[redacted]');
  });

  it('refuses to write the default snapshot path for a non-default endpoint', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const defaultOut = path.join(DEFAULT_SNAPSHOT_DIR, `baseline-cwv-${today}.json`);
    const existedBefore = existsSync(defaultOut);

    const run = await runScript([`${origin}/sitemap.xml`]);
    expect(run.code).toBe(2);
    expect(run.stderr).toMatch(/refusing to write the default snapshot path/i);
    if (!existedBefore) expect(existsSync(defaultOut)).toBe(false);

    // The explicit allow flag lifts the guard.
    if (!existedBefore) {
      try {
        const allowed = await runScript([`${origin}/sitemap.xml`, '--allow-nondefault-endpoint']);
        expect(allowed.code).toBe(0);
        expect(existsSync(defaultOut)).toBe(true);
      } finally {
        if (!existedBefore) await rm(defaultOut, { force: true });
      }
    }
  });

  it('prints "improved" when the diff shows an improvement', async () => {
    const baseline = snapshotPath('improved-baseline.json');
    await writeFile(
      baseline,
      JSON.stringify({
        date: '2026-10-01',
        strategy: ['mobile'],
        sitemap: `${origin}/sitemap.xml`,
        limit: 20,
        urls: [{ url: `${origin}/a/`, ps: { score: 60, lcp: 3900, inp: 600, cls: 0.3 } }],
      }),
      'utf8',
    );

    const run = await runScript([
      `${origin}/sitemap.xml`,
      '--out',
      snapshotPath('improved-current.json'),
      '--against',
      baseline,
    ]);

    expect(run.code).toBe(0);
    expect(run.stdout).toContain('improved');
    expect(run.stdout).not.toContain('no change');
  });
});
