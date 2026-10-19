#!/usr/bin/env node
/**
 * scripts/seo/cwv-baseline.mjs — Core Web Vitals baseline capture + regression diff.
 *
 * Node-only, ZERO new npm dependencies: global `fetch`, `node:fs`, `node:path` only.
 *
 *   node scripts/seo/cwv-baseline.mjs [sitemapURL] [options]
 *
 * Options
 *   --against <file>   diff this run against a previous snapshot (exit 1 on regression)
 *   --strategy <s>     mobile | desktop | both          (default: mobile)
 *   --out <file>       snapshot path (default: <repo>/docs/seo/baseline-cwv-<date>.json)
 *   --out-dir <dir>    snapshot directory (default: <repo>/docs/seo)
 *   --limit <n>        max URLs to measure (default: 20, 0 = all)
 *   --timeout <ms>     per-request timeout (default: 60000)
 *   -h, --help         usage
 *
 * Environment
 *   PSI_BASE_URL       override the PSI endpoint (offline stub tests)
 *   PSI_API_KEY        optional Google API key — the anonymous free tier is
 *                      quota'd to 0/day and answers every request with HTTP 429
 *
 * Exit codes
 *   0  snapshot written / diff clean (a fully-skipped run is a quiet pass)
 *   1  regression detected in --against mode
 *   2  usage or environment error (bad args, unreachable sitemap, unreadable --against)
 *
 * Snapshot shape (docs/seo/baseline-cwv-<YYYY-MM-DD>.json)
 *   { "date": "YYYY-MM-DD",
 *     "urls": [ { "url": "...", "ps": { "score": 92, "lcp": 2100, "inp": 180, "cls": 0.05 } },
 *               { "url": "...", "ps": "skipped" } ] }
 *
 *   `ps` is the primary strategy result (mobile unless --strategy says otherwise).
 *   `psDesktop` is present only for --strategy both (the desktop run).
 *   `score` is the PSI performance score on a 0..100 scale.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_SITEMAP_URL = 'https://extramovies.org/sitemap.xml';
const DEFAULT_PSI_BASE = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, 'docs', 'seo');
const DEFAULT_LIMIT = 20;
const DEFAULT_TIMEOUT_MS = 60_000;

/** A performance score drop of MORE than this many points fails the diff. */
const SCORE_DROP_LIMIT = 5;

/** Snapshot keys that hold a PSI result (primary + optional desktop companion). */
const VARIANT_KEYS = ['ps', 'psDesktop'];

/** Core Web Vitals metrics, in report order. */
const METRICS = ['lcp', 'inp', 'cls'];

/**
 * CrUX-style bucket boundaries. `good` <= value <= `poor` is "needs-improvement".
 * lcp/inp are milliseconds, cls is unitless.
 */
const BUCKET_LIMITS = {
  lcp: { good: 2500, poor: 4000 },
  inp: { good: 200, poor: 500 },
  cls: { good: 0.1, poor: 0.25 },
};

const BUCKET_RANK = { good: 0, 'needs-improvement': 1, poor: 2 };

const USER_AGENT = 'movie-review-cwv-baseline/1.0 (+https://extramovies.org)';

/* ------------------------------------------------------------------ utils */

class UsageError extends Error {}

function warn(message) {
  process.stderr.write(`  ! ${message}\n`);
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Coerce to a finite number, tolerating numeric strings (PSI is a JSON API —
 * a quoted number must not silently become a null metric).
 */
function finiteOrNull(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Bucket a metric value: 'good' | 'needs-improvement' | 'poor' | null. */
function bucketOf(metric, value) {
  const v = finiteOrNull(value);
  if (v === null) return null;
  const limits = BUCKET_LIMITS[metric];
  if (!limits) return null;
  if (v <= limits.good) return 'good';
  if (v <= limits.poor) return 'needs-improvement';
  return 'poor';
}

function formatMetric(metric, value) {
  if (finiteOrNull(value) === null) return 'n/a';
  if (metric === 'cls') return `${Number(value).toFixed(3)}`;
  return `${Math.round(value)}ms`;
}

function formatScore(value) {
  const v = finiteOrNull(value);
  return v === null ? 'n/a' : String(Math.round(v));
}

function decodeXmlEntities(text) {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/* ------------------------------------------------------------------- args */

function parseArgs(argv) {
  const opts = {
    sitemap: DEFAULT_SITEMAP_URL,
    sitemapExplicit: false,
    against: null,
    strategy: 'mobile',
    out: null,
    outDir: DEFAULT_OUT_DIR,
    limit: DEFAULT_LIMIT,
    timeout: DEFAULT_TIMEOUT_MS,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new UsageError(`option ${arg} needs a value`);
      }
      i += 1;
      return value;
    };
    switch (arg) {
      case '--against': opts.against = next(); break;
      case '--strategy': opts.strategy = next(); break;
      case '--out': opts.out = next(); break;
      case '--out-dir': opts.outDir = path.resolve(next()); break;
      case '--limit': opts.limit = Number(next()); break;
      case '--timeout': opts.timeout = Number(next()); break;
      case '-h':
      case '--help': opts.help = true; break;
      default:
        if (arg.startsWith('--')) throw new UsageError(`unknown option: ${arg}`);
        if (opts.sitemapExplicit) throw new UsageError(`unexpected argument: ${arg}`);
        opts.sitemap = arg;
        opts.sitemapExplicit = true;
    }
  }

  if (!['mobile', 'desktop', 'both'].includes(opts.strategy)) {
    throw new UsageError(`--strategy must be mobile|desktop|both (got "${opts.strategy}")`);
  }
  if (!Number.isFinite(opts.limit) || opts.limit < 0) {
    throw new UsageError('--limit must be a non-negative number');
  }
  if (!Number.isFinite(opts.timeout) || opts.timeout <= 0) {
    throw new UsageError('--timeout must be a positive number of milliseconds');
  }
  return opts;
}

function usage() {
  return [
    'Usage: node scripts/seo/cwv-baseline.mjs [sitemapURL] [options]',
    '',
    '  --against <file>   diff this run against a previous snapshot (exit 1 on regression)',
    '  --strategy <s>     mobile | desktop | both (default: mobile)',
    '  --out <file>       snapshot path (default: docs/seo/baseline-cwv-<date>.json)',
    '  --out-dir <dir>    snapshot directory (default: docs/seo)',
    '  --limit <n>        max URLs to measure (default: 20, 0 = all)',
    '  --timeout <ms>     per-request timeout (default: 60000)',
    '  -h, --help         show this help',
    '',
    'env: PSI_BASE_URL (endpoint override), PSI_API_KEY (optional Google API key)',
  ].join('\n');
}

/* --------------------------------------------------------------- fetching */

async function fetchText(url, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, accept: '*/*' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function extractLocs(xml) {
  const locs = [];
  const re = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;
  let match;
  while ((match = re.exec(xml)) !== null) {
    const value = decodeXmlEntities(match[1].trim());
    if (value) locs.push(value);
  }
  return locs;
}

/** Pull the URL list out of a sitemap (follows a sitemap index one level). */
async function collectUrls(sitemapUrl, timeout) {
  const xml = await fetchText(sitemapUrl, timeout);
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  let locs = extractLocs(xml);

  if (isIndex) {
    const children = locs.slice(0, 10);
    const merged = [];
    for (const child of children) {
      try {
        const childXml = await fetchText(child, timeout);
        merged.push(...extractLocs(childXml));
      } catch (err) {
        warn(`child sitemap unreachable (${child}): ${err.message}`);
      }
    }
    locs = merged;
  }

  return [...new Set(locs)];
}

/* ---------------------------------------------------------------- PSI v5 */

function auditValue(audits, id) {
  const audit = audits?.[id];
  if (!audit) return null;
  return finiteOrNull(audit.numericValue);
}

function fieldValue(loadingExperience, key) {
  const metric = loadingExperience?.metrics?.[key];
  if (!metric) return null;
  return finiteOrNull(metric.percentile);
}

/**
 * Pull score + CWV out of a PageSpeed Insights v5 payload.
 * Prefers the per-page lab audit, falls back to the origin field data.
 * Returns null when the payload carries nothing usable.
 */
function extractPs(payload) {
  const lighthouse = payload?.lighthouseResult;
  if (!isPlainObject(lighthouse)) return null;
  const audits = isPlainObject(lighthouse.audits) ? lighthouse.audits : {};
  const field = isPlainObject(payload.loadingExperience) ? payload.loadingExperience : {};

  const rawScore = finiteOrNull(lighthouse.categories?.performance?.score);
  // PSI reports the category score on 0..1; normalise to 0..100. A payload
  // that already carries a 0..100 score is taken at face value.
  const score = rawScore === null ? null : Math.round(rawScore > 1 ? rawScore : rawScore * 100);

  const rawLcp = auditValue(audits, 'largest-contentful-paint')
    ?? fieldValue(field, 'LARGEST_CONTENTFUL_PAINT_MS');
  const rawInp = auditValue(audits, 'interaction-to-next-paint')
    ?? fieldValue(field, 'INTERACTION_TO_NEXT_PAINT');
  const rawCls = auditValue(audits, 'cumulative-layout-shift')
    ?? fieldValue(field, 'CUMULATIVE_LAYOUT_SHIFT_SCORE');

  if (score === null && rawLcp === null && rawInp === null && rawCls === null) return null;

  return {
    score,
    lcp: rawLcp === null ? null : Math.round(rawLcp),
    inp: rawInp === null ? null : Math.round(rawInp),
    cls: rawCls === null ? null : Math.round(rawCls * 1000) / 1000,
  };
}

/**
 * One PSI measurement. Never throws: a rate limit, a non-2xx, a bad body or a
 * network error all become a `skipped` result so the run keeps going.
 */
async function fetchPsi(target, strategy, timeout) {
  const base = process.env.PSI_BASE_URL || DEFAULT_PSI_BASE;
  const params = new URLSearchParams();
  params.set('url', target);
  params.set('strategy', strategy);
  if (process.env.PSI_API_KEY) params.set('key', process.env.PSI_API_KEY);
  const separator = base.includes('?') ? '&' : '?';
  const endpoint = `${base}${separator}${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(endpoint, {
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
    });
    if (!res.ok) return { skipped: true, reason: `HTTP ${res.status}` };
    let payload;
    try {
      payload = await res.json();
    } catch {
      return { skipped: true, reason: 'invalid JSON body' };
    }
    const ps = extractPs(payload);
    if (!ps) return { skipped: true, reason: 'no lighthouse payload' };
    return { ps };
  } catch (err) {
    return { skipped: true, reason: err?.name === 'AbortError' ? 'timeout' : (err?.message || 'request failed') };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------- diff */

function isPsObject(value) {
  return isPlainObject(value);
}

/**
 * Compare the current snapshot against a baseline snapshot.
 * Returns { lines, regressions, compared }.
 */
function diffSnapshots(baseline, current) {
  const baselineByUrl = new Map((baseline?.urls || []).map((row) => [row.url, row]));
  const lines = [];
  const regressions = [];
  let compared = 0;

  for (const row of current.urls || []) {
    const previous = baselineByUrl.get(row.url);
    if (!previous) {
      lines.push(`  ${row.url}`);
      lines.push('    new - no baseline row (not compared)');
      continue;
    }

    lines.push(`  ${row.url}`);
    for (const key of VARIANT_KEYS) {
      const before = previous[key];
      const after = row[key];
      if (before === undefined || after === undefined) continue; // variant not run in one of the two snapshots
      if (!isPsObject(before) || !isPsObject(after)) {
        lines.push(`    ${key}: skipped (not compared)`);
        continue;
      }
      compared += 1;

      const scoreBefore = finiteOrNull(before.score);
      const scoreAfter = finiteOrNull(after.score);
      if (scoreBefore !== null && scoreAfter !== null) {
        const delta = scoreAfter - scoreBefore;
        const drop = scoreBefore - scoreAfter;
        const failed = drop > SCORE_DROP_LIMIT;
        lines.push(
          `    ${key}.score  ${formatScore(scoreBefore)} -> ${formatScore(scoreAfter)}`
          + `  (delta ${delta >= 0 ? '+' : ''}${delta})`
          + (failed ? '  REGRESSION (drop > 5 points)' : ''),
        );
        if (failed) {
          regressions.push({ url: row.url, variant: key, metric: 'score', from: scoreBefore, to: scoreAfter });
        }
      } else {
        lines.push(`    ${key}.score  n/a (not compared)`);
      }

      for (const metric of METRICS) {
        const metricBefore = finiteOrNull(before[metric]);
        const metricAfter = finiteOrNull(after[metric]);
        if (metricBefore === null || metricAfter === null) {
          lines.push(`    ${key}.${metric}  n/a (not compared)`);
          continue;
        }
        const bucketBefore = bucketOf(metric, metricBefore);
        const bucketAfter = bucketOf(metric, metricAfter);
        const delta = metricAfter - metricBefore;
        const failed = BUCKET_RANK[bucketAfter] > BUCKET_RANK[bucketBefore];
        lines.push(
          `    ${key}.${metric}  ${formatMetric(metric, metricBefore)} -> ${formatMetric(metric, metricAfter)}`
          + `  (delta ${delta >= 0 ? '+' : ''}${Number(delta.toFixed(3))})`
          + `  ${bucketBefore} -> ${bucketAfter}`
          + (failed ? '  REGRESSION (bucket regressed)' : ''),
        );
        if (failed) {
          regressions.push({ url: row.url, variant: key, metric, from: bucketBefore, to: bucketAfter });
        }
      }
    }
  }

  const missing = (baseline?.urls || []).filter((row) => !(current.urls || []).some((r) => r.url === row.url));
  for (const row of missing) {
    lines.push(`  ${row.url}`);
    lines.push('    missing from this run (not compared)');
  }

  return { lines, regressions, compared };
}

/* ------------------------------------------------------------------- main */

async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`${err.message}\n\n${usage()}\n`);
    return 2;
  }
  if (opts.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  const date = new Date().toISOString().slice(0, 10);
  const primaryStrategy = opts.strategy === 'both' ? 'mobile' : opts.strategy;
  const secondaryStrategy = opts.strategy === 'both' ? 'desktop' : null;

  let allUrls;
  try {
    allUrls = await collectUrls(opts.sitemap, opts.timeout);
  } catch (err) {
    process.stderr.write(`sitemap unreachable: ${opts.sitemap} (${err.message})\n`);
    return 2;
  }
  if (allUrls.length === 0) {
    process.stderr.write(`sitemap has no <loc> entries: ${opts.sitemap}\n`);
    return 2;
  }

  const urls = opts.limit > 0 ? allUrls.slice(0, opts.limit) : allUrls;
  process.stdout.write(
    `CWV baseline - ${urls.length} URL(s) from ${opts.sitemap} (strategy: ${opts.strategy})\n`,
  );

  const rows = [];
  let skipped = 0;
  for (const url of urls) {
    const primary = await fetchPsi(url, primaryStrategy, opts.timeout);
    const row = { url };
    if (primary.skipped) {
      row.ps = 'skipped';
      skipped += 1;
      process.stdout.write(`  - ${url}  skipped (${primary.reason})\n`);
    } else {
      row.ps = primary.ps;
      process.stdout.write(
        `  + ${url}  score ${formatScore(primary.ps.score)}`
        + `  lcp ${formatMetric('lcp', primary.ps.lcp)}`
        + `  inp ${formatMetric('inp', primary.ps.inp)}`
        + `  cls ${formatMetric('cls', primary.ps.cls)}\n`,
      );
    }

    if (secondaryStrategy) {
      const secondary = await fetchPsi(url, secondaryStrategy, opts.timeout);
      if (secondary.skipped) {
        row.psDesktop = 'skipped';
        process.stdout.write(`    desktop skipped (${secondary.reason})\n`);
      } else {
        row.psDesktop = secondary.ps;
        process.stdout.write(
          `    desktop score ${formatScore(secondary.ps.score)}`
          + `  lcp ${formatMetric('lcp', secondary.ps.lcp)}`
          + `  inp ${formatMetric('inp', secondary.ps.inp)}`
          + `  cls ${formatMetric('cls', secondary.ps.cls)}\n`,
        );
      }
    }
    rows.push(row);
  }

  const snapshot = { date, urls: rows };
  const outPath = opts.out
    ? path.resolve(opts.out)
    : path.join(opts.outDir, `baseline-cwv-${date}.json`);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  process.stdout.write(`Snapshot written: ${outPath}\n`);

  if (skipped === rows.length) {
    process.stdout.write('All URLs were skipped - nothing measured, nothing to compare.\n');
  }

  if (!opts.against) return 0;

  let baseline;
  try {
    baseline = JSON.parse(await readFile(path.resolve(opts.against), 'utf8'));
  } catch (err) {
    process.stderr.write(`cannot read --against snapshot ${opts.against} (${err.message})\n`);
    return 2;
  }

  const { lines, regressions, compared } = diffSnapshots(baseline, snapshot);
  process.stdout.write(`\nCWV diff vs ${path.resolve(opts.against)}\n`);
  for (const line of lines) process.stdout.write(`${line}\n`);

  if (regressions.length === 0) {
    process.stdout.write(`Result: no change (${compared} measurement(s) compared, 0 regressions)\n`);
    return 0;
  }

  process.stdout.write(`\nRegressions (${regressions.length}):\n`);
  for (const regression of regressions) {
    process.stdout.write(
      `  ${regression.url}  ${regression.variant}.${regression.metric}`
      + `  ${regression.from} -> ${regression.to}\n`,
    );
  }
  process.stdout.write(`Result: REGRESSION (${regressions.length} regression(s), ${compared} measurement(s) compared)\n`);
  return 1;
}

const exitCode = await main(process.argv.slice(2));
process.exitCode = exitCode;
