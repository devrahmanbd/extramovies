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
 *   --allow-nondefault-endpoint
 *                      allow writing the default docs/seo/baseline-cwv-*.json path
 *                      while PSI_BASE_URL points at a non-default endpoint
 *   -h, --help         usage
 *
 * Environment
 *   PSI_BASE_URL       override the PSI endpoint (offline stub tests)
 *   PSI_API_KEY        optional Google API key — the anonymous free tier is
 *                      quota'd to 0/day and answers every request with HTTP 429
 *
 * Exit codes
 *   0  snapshot written / diff clean or improved (a fully-skipped run is a quiet pass)
 *   1  regression detected in --against mode
 *   2  usage or environment error (bad args, unreachable sitemap, unreadable
 *      --against, or a stub endpoint aimed at the default snapshot path)
 *   3  strategy mismatch — the two snapshots were captured under different
 *      strategies, so nothing was compared
 *
 * Snapshot shape (docs/seo/baseline-cwv-<YYYY-MM-DD>.json)
 *   { "date": "YYYY-MM-DD",
 *     "strategy": ["mobile"],
 *     "sitemap": "https://extramovies.org/sitemap.xml",
 *     "limit": 20,
 *     "urls": [ { "url": "...", "ps": { "score": 92, "lcp": 2100, "inp": 180, "cls": 0.05 } },
 *               { "url": "...", "ps": "skipped" } ] }
 *
 *   `ps` is the primary strategy result (mobile unless --strategy says otherwise).
 *   `psDesktop` is present only for --strategy both (the desktop run).
 *   `score` is the PSI performance score on a 0..100 scale.
 *   `strategy` / `sitemap` / `limit` describe HOW the snapshot was captured, so
 *   two snapshots are only compared when they were captured the same way.
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

/** Canonical strategy order, used when a strategy set is compared or printed. */
const STRATEGY_ORDER = ['mobile', 'desktop'];

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

/** Longest failure reason kept in a log line. */
const REASON_MAX_LENGTH = 160;

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

/**
 * Make a failure reason safe to print.
 * A malformed PSI_BASE_URL makes undici answer
 *   "Failed to parse URL from https://host/runPagespeed?url=...&key=<KEY>"
 * so the reason can carry the endpoint AND the API key. Strip the query
 * string, redact secret-looking parameters, then cap the length.
 */
function sanitizeReason(reason) {
  let text = String(reason ?? '').trim() || 'unknown error';
  text = text.replace(/\?[^\s]*/g, '?[query]');
  text = text.replace(
    /\b((?:api[_-]?key|apikey|key|token|secret|password|passwd)\s*=\s*)([^\s&]+)/gi,
    '$1[redacted]',
  );
  if (text.length > REASON_MAX_LENGTH) {
    text = `${text.slice(0, REASON_MAX_LENGTH - 3)}...`;
  }
  return text;
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
    allowNonDefaultEndpoint: false,
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
      case '--allow-nondefault-endpoint': opts.allowNonDefaultEndpoint = true; break;
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
    '  --allow-nondefault-endpoint',
    '                     allow the default docs/seo snapshot path while PSI_BASE_URL',
    '                     points at a non-default (stub/offline) endpoint',
    '  -h, --help         show this help',
    '',
    'env: PSI_BASE_URL (endpoint override), PSI_API_KEY (optional Google API key)',
    '',
    'exit: 0 clean/improved | 1 regression | 2 usage error | 3 strategy mismatch',
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
        warn(`child sitemap unreachable (${sanitizeReason(child)}): ${sanitizeReason(err.message)}`);
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
 * Every reason is sanitized before it can reach a log line.
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
    if (!res.ok) return { skipped: true, reason: sanitizeReason(`HTTP ${res.status}`) };
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
    const reason = err?.name === 'AbortError' ? 'timeout' : (err?.message || 'request failed');
    return { skipped: true, reason: sanitizeReason(reason) };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------- diff */

function isPsObject(value) {
  return isPlainObject(value);
}

/** The strategy set a snapshot was captured with, or null when it is unknown. */
function strategySet(snapshot) {
  const value = snapshot?.strategy;
  const list = Array.isArray(value) ? value : (typeof value === 'string' ? [value] : null);
  if (!list) return null;
  const set = list.filter((entry) => entry === 'mobile' || entry === 'desktop');
  // Canonical order (mobile first) so two snapshots compare equal regardless
  // of how the set was written.
  return set.length ? STRATEGY_ORDER.filter((entry) => set.includes(entry)) : null;
}

/** Human label for a strategy set: "mobile" | "desktop" | "mobile+desktop". */
function strategyLabel(set) {
  return set ? set.join('+') : 'unknown';
}

/**
 * Map strategy -> the snapshot key that holds that strategy's measurement.
 * A single-strategy run keeps it in `ps`; `--strategy both` splits it
 * (`ps` = mobile, `psDesktop` = desktop).
 */
function variantIndex(snapshot) {
  const index = new Map();
  const set = strategySet(snapshot);
  if (!set) return index;
  if (set.includes('mobile')) index.set('mobile', 'ps');
  if (set.includes('desktop')) index.set('desktop', set.length > 1 ? 'psDesktop' : 'ps');
  return index;
}

/** Compare one baseline measurement with one current measurement. */
function compareMeasurement(url, label, before, after, regressions, improvements) {
  const out = [];
  const prefix = `    ${label.padEnd(7)}`;

  const scoreBefore = finiteOrNull(before.score);
  const scoreAfter = finiteOrNull(after.score);
  if (scoreBefore !== null && scoreAfter !== null) {
    const delta = scoreAfter - scoreBefore;
    const drop = scoreBefore - scoreAfter;
    const failed = drop > SCORE_DROP_LIMIT;
    const better = delta > 0;
    out.push(
      `${prefix} score  ${formatScore(scoreBefore)} -> ${formatScore(scoreAfter)}`
      + `  (delta ${delta >= 0 ? '+' : ''}${delta})`
      + (failed ? '  REGRESSION (drop > 5 points)' : better ? '  IMPROVED' : ''),
    );
    if (failed) regressions.push({ url, label, metric: 'score', from: scoreBefore, to: scoreAfter });
    else if (better) improvements.push({ url, label, metric: 'score', from: scoreBefore, to: scoreAfter });
  } else {
    out.push(`${prefix} score  n/a (not compared)`);
  }

  for (const metric of METRICS) {
    const metricBefore = finiteOrNull(before[metric]);
    const metricAfter = finiteOrNull(after[metric]);
    if (metricBefore === null || metricAfter === null) {
      out.push(`${prefix} ${metric.padEnd(6)} n/a (not compared)`);
      continue;
    }
    const bucketBefore = bucketOf(metric, metricBefore);
    const bucketAfter = bucketOf(metric, metricAfter);
    const delta = metricAfter - metricBefore;
    const failed = BUCKET_RANK[bucketAfter] > BUCKET_RANK[bucketBefore];
    const better = BUCKET_RANK[bucketAfter] < BUCKET_RANK[bucketBefore];
    out.push(
      `${prefix} ${metric.padEnd(6)} ${formatMetric(metric, metricBefore)} -> ${formatMetric(metric, metricAfter)}`
      + `  (delta ${delta >= 0 ? '+' : ''}${Number(delta.toFixed(3))})`
      + `  ${bucketBefore} -> ${bucketAfter}`
      + (failed ? '  REGRESSION (bucket regressed)' : better ? '  IMPROVED (bucket improved)' : ''),
    );
    if (failed) regressions.push({ url, label, metric, from: bucketBefore, to: bucketAfter });
    else if (better) improvements.push({ url, label, metric, from: bucketBefore, to: bucketAfter });
  }

  return out;
}

/**
 * Compare the current snapshot against a baseline snapshot.
 * Returns { lines, regressions, improvements, compared, mismatch }.
 *
 * Rules
 *   - only URLs present in BOTH snapshots are scored; the rest are reported as
 *     missing and are never regressions
 *   - snapshots captured under different strategy sets are never compared
 *     (mismatch is returned, the caller exits 3)
 *   - a `skipped` row on either side is reported and not compared
 */
function diffSnapshots(baseline, current) {
  const lines = [];
  const regressions = [];
  const improvements = [];
  let compared = 0;
  let mismatch = null;

  const baseRows = new Map((baseline?.urls || []).map((row) => [row.url, row]));
  const curRows = new Map((current?.urls || []).map((row) => [row.url, row]));

  const baseSet = strategySet(baseline);
  const curSet = strategySet(current);
  const baseIndex = variantIndex(baseline);
  const curIndex = variantIndex(current);
  const currentHasMeasurements = (current?.urls || []).some((row) => VARIANT_KEYS.some((key) => isPsObject(row[key])));

  // --- strategy alignment -------------------------------------------------
  const pairs = [];
  if (baseSet && curSet) {
    if (baseSet.join(',') !== curSet.join(',')) {
      const detail = `baseline captured [${strategyLabel(baseSet)}], current captured [${strategyLabel(curSet)}]`;
      if (!currentHasMeasurements) {
        lines.push(`  note: strategy mismatch (${detail}) - this run measured nothing, nothing to compare`);
        return { lines, regressions, improvements, compared: 0, mismatch: null };
      }
      lines.push(`  strategy mismatch: ${detail} - nothing compared`);
      lines.push('    re-capture the baseline with the same --strategy to compare');
      return { lines, regressions, improvements, compared: 0, mismatch: detail };
    }
    for (const [strategy, key] of curIndex) {
      pairs.push({ label: strategy, baseKey: baseIndex.get(strategy) || key, curKey: key });
    }
  } else {
    // One side carries no strategy record (a hand-made baseline): compare key
    // to key and say so, rather than silently guessing.
    for (const key of VARIANT_KEYS) pairs.push({ label: key, baseKey: key, curKey: key });
    lines.push('  note: no strategy record on one side - compared on trust');
  }

  // --- capture context ----------------------------------------------------
  if (baseline?.sitemap && current?.sitemap && baseline.sitemap !== current.sitemap) {
    lines.push(`  note: different sitemap sources (baseline ${baseline.sitemap}, current ${current.sitemap})`);
  }
  if (baseline?.limit !== undefined && current?.limit !== undefined && baseline.limit !== current.limit) {
    lines.push(`  note: different --limit (baseline ${baseline.limit}, current ${current.limit}) - URL sets may differ`);
  }

  // --- per-URL comparison -------------------------------------------------
  const missingFromBaseline = new Set();
  const missingFromCurrent = new Set();

  for (const row of current?.urls || []) {
    const previous = baseRows.get(row.url);
    const urlLines = [];
    for (const pair of pairs) {
      if (!previous) {
        missingFromBaseline.add(row.url);
        continue;
      }
      const before = previous[pair.baseKey];
      const after = row[pair.curKey];
      if (before === undefined || after === undefined) continue; // variant not run on one side
      if (!isPsObject(before) || !isPsObject(after)) {
        urlLines.push(`    ${pair.label.padEnd(7)} skipped (not compared)`);
        continue;
      }
      compared += 1;
      urlLines.push(...compareMeasurement(row.url, pair.label, before, after, regressions, improvements));
    }
    if (urlLines.length) {
      lines.push(`  ${row.url}`);
      lines.push(...urlLines);
    }
  }

  for (const row of baseline?.urls || []) {
    if (!curRows.has(row.url)) missingFromCurrent.add(row.url);
  }

  for (const url of missingFromBaseline) {
    lines.push(`  ${url}`);
    lines.push('    missing from the baseline snapshot (not compared)');
  }
  for (const url of missingFromCurrent) {
    lines.push(`  ${url}`);
    lines.push('    missing from this run (not compared)');
  }

  return { lines, regressions, improvements, compared, mismatch };
}

/* ------------------------------------------------------------------- main */

/** Normalised endpoint, so a trailing slash does not look like a different endpoint. */
function normalizeEndpoint(endpoint) {
  return String(endpoint || '').trim().replace(/\/+$/, '');
}

/** True when `outPath` is the committed baseline path (docs/seo/baseline-cwv-*.json). */
function isDefaultSnapshotPath(outPath) {
  return path.dirname(outPath) === DEFAULT_OUT_DIR && /^baseline-cwv-.*\.json$/.test(path.basename(outPath));
}

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
  const outPath = opts.out
    ? path.resolve(opts.out)
    : path.join(opts.outDir, `baseline-cwv-${date}.json`);

  // A stub/offline endpoint must never pollute the committed baseline history.
  const endpoint = process.env.PSI_BASE_URL || DEFAULT_PSI_BASE;
  const nonDefaultEndpoint = normalizeEndpoint(endpoint) !== normalizeEndpoint(DEFAULT_PSI_BASE);
  if (nonDefaultEndpoint && isDefaultSnapshotPath(outPath) && !opts.allowNonDefaultEndpoint) {
    process.stderr.write(
      `refusing to write the default snapshot path ${outPath}\n`
      + `  PSI_BASE_URL points at a non-default endpoint (${sanitizeReason(endpoint)}).\n`
      + '  write elsewhere with --out <file> / --out-dir <dir>, or pass\n'
      + '  --allow-nondefault-endpoint if you really mean to overwrite the baseline.\n',
    );
    return 2;
  }

  const primaryStrategy = opts.strategy === 'both' ? 'mobile' : opts.strategy;
  const secondaryStrategy = opts.strategy === 'both' ? 'desktop' : null;
  const capturedStrategies = secondaryStrategy ? [primaryStrategy, secondaryStrategy] : [primaryStrategy];

  let allUrls;
  try {
    allUrls = await collectUrls(opts.sitemap, opts.timeout);
  } catch (err) {
    process.stderr.write(`sitemap unreachable: ${opts.sitemap} (${sanitizeReason(err.message)})\n`);
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

  const snapshot = {
    date,
    strategy: capturedStrategies,
    sitemap: opts.sitemap,
    limit: opts.limit,
    urls: rows,
  };
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
    process.stderr.write(`cannot read --against snapshot ${opts.against} (${sanitizeReason(err.message)})\n`);
    return 2;
  }

  const { lines, regressions, improvements, compared, mismatch } = diffSnapshots(baseline, snapshot);
  process.stdout.write(`\nCWV diff vs ${path.resolve(opts.against)}\n`);
  for (const line of lines) process.stdout.write(`${line}\n`);

  if (mismatch) {
    process.stdout.write(`Result: strategy mismatch (${mismatch}) - nothing compared\n`);
    return 3;
  }

  if (regressions.length > 0) {
    process.stdout.write(`\nRegressions (${regressions.length}):\n`);
    for (const regression of regressions) {
      process.stdout.write(
        `  ${regression.url}  ${regression.label}.${regression.metric}`
        + `  ${regression.from} -> ${regression.to}\n`,
      );
    }
    process.stdout.write(
      `Result: REGRESSION (${regressions.length} regression(s), ${improvements.length} improvement(s),`
      + ` ${compared} measurement(s) compared)\n`,
    );
    return 1;
  }

  if (improvements.length > 0) {
    process.stdout.write(`\nImprovements (${improvements.length}):\n`);
    for (const improvement of improvements) {
      process.stdout.write(
        `  ${improvement.url}  ${improvement.label}.${improvement.metric}`
        + `  ${improvement.from} -> ${improvement.to}\n`,
      );
    }
    process.stdout.write(
      `Result: improved (${improvements.length} improvement(s), ${compared} measurement(s) compared)\n`,
    );
    return 0;
  }

  process.stdout.write(`Result: no change (${compared} measurement(s) compared, 0 regressions)\n`);
  return 0;
}

const exitCode = await main(process.argv.slice(2));
process.exitCode = exitCode;
