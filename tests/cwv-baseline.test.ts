/**
 * Offline self-test for scripts/seo/cwv-baseline.mjs.
 *
 * A local stub serves BOTH the sitemap and a PageSpeed-Insights-shaped payload,
 * so the whole capture + diff flow is exercised without touching the network:
 *   - PSI_BASE_URL points the script at the stub
 *   - the sitemap URL is passed as the CLI argument
 *
 * Pins the four behaviours the brief demands:
 *   1. a run writes a snapshot with the documented shape
 *   2. a self-diff of that snapshot reports "no change" and exits 0
 *   3. a rate-limited URL is recorded as `skipped` and never fails the run
 *      (a fully-skipped run is a quiet pass)
 *   4. a score drop > 5 points or a metric bucket regression exits 1
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'seo', 'cwv-baseline.mjs');

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

/** Per-path PSI payloads, so a diff can be driven by a chosen metric. */
function payloadFor(target: string, strategy: string) {
  if (target.includes('/bucket/')) return psiPayload(0.85, 3000, 180, 0.05); // lcp: needs-improvement
  if (strategy === 'desktop') return psiPayload(0.95, 1200, 90, 0.02);
  return psiPayload(0.85, 2100, 180, 0.05); // lcp/inp/cls: all good
}

function send(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', origin);

  if (url.pathname === '/sitemap.xml') {
    res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' });
    res.end(
      '<?xml version="1.0" encoding="UTF-8"?>'
      + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
      + `<url><loc>${origin}/a/</loc></url>`
      + `<url><loc>${origin}/b/</loc></url>`
      + '</urlset>',
    );
    return;
  }

  if (url.pathname === '/sitemap-skip-only.xml') {
    res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' });
    res.end(
      '<?xml version="1.0" encoding="UTF-8"?>'
      + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
      + `<url><loc>${origin}/b-one/</loc></url>`
      + `<url><loc>${origin}/b-two/</loc></url>`
      + '</urlset>',
    );
    return;
  }

  if (url.pathname === '/sitemap-bucket.xml') {
    res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' });
    res.end(
      '<?xml version="1.0" encoding="UTF-8"?>'
      + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
      + `<url><loc>${origin}/bucket/</loc></url>`
      + '</urlset>',
    );
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

function runScript(args: string[]) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, PSI_BASE_URL: `${origin}/runPagespeed` },
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
    expect(Object.keys(snapshot).sort()).toEqual(['date', 'urls']);
    expect(snapshot.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(snapshot.urls)).toBe(true);
    expect(snapshot.urls).toHaveLength(2);

    const measured = snapshot.urls.find((row: { url: string }) => row.url === `${origin}/a/`);
    expect(measured.ps).toEqual({ score: 85, lcp: 2100, inp: 180, cls: 0.05 });

    const limited = snapshot.urls.find((row: { url: string }) => row.url === `${origin}/b/`);
    expect(limited.ps).toBe('skipped');
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
    const measured = snapshot.urls.find((row: { url: string }) => row.url === `${origin}/a/`);
    expect(measured.ps.score).toBe(85);
    expect(measured.psDesktop.score).toBe(95);
  });

  it('exits 2 on an unreachable sitemap (never a silent empty snapshot)', async () => {
    const run = await runScript([`${origin}/does-not-exist.xml`, '--out', snapshotPath('nope.json')]);
    expect(run.code).toBe(2);
    expect(run.stderr).toContain('sitemap');
  });
});
