#!/usr/bin/env node
/**
 * scripts/seo/homepage-baseline.mjs — homepage SEO baseline capture + diff.
 *
 * Node-only, ZERO new npm dependencies: global `fetch`, `node:fs`, `node:path`,
 * `node:crypto` only.
 *
 *   node scripts/seo/homepage-baseline.mjs [options]
 *
 * Options
 *   --base <url>       origin to crawl (default: http://127.0.0.1:4321 — the dev server)
 *   --out <file>       snapshot path (default: <repo>/docs/seo/baseline-<date>.json)
 *   --out-dir <dir>    snapshot directory (default: <repo>/docs/seo)
 *   --against <file>   diff this run against a previous snapshot
 *   --allow <list>     fields allowed to differ in --against mode
 *                      (default: title,meta_description,og_title — the homepage copy fields)
 *   --timeout <ms>     per-request timeout (default: 30000)
 *   -h, --help         usage
 *
 * Snapshot shape (docs/seo/baseline-<YYYY-MM-DD>.json) — the same shape as
 * docs/seo/baseline-2026-10-07.json:
 *   { "captured_at": "<iso>",
 *     "base": "http://127.0.0.1:4321",
 *     "pages": {
 *       "/": { "status", "title", "meta_description", "canonical", "robots",
 *               "og_title", "h1": [...], "h2_count", "schema_types": [...],
 *               "html_sha256" },
 *       ...
 *       "/sitemap.xml": { ..., "url_count" },
 *       "/robots.txt":  { ..., "body_head" }
 *     } }
 *
 *   Values are RAW HTML (no entity decoding) so a snapshot is a faithful
 *   picture of what the crawler sees, and `html_sha256` is the first 16 hex
 *   chars of the sha256 of the whole response body.
 *
 * Exit codes
 *   0  snapshot written, or diff clean (only allowed fields differ)
 *   1  diff found a change OUTSIDE the allowed fields (unexpected drift)
 *   2  usage or environment error (bad args, unreachable base, unreadable --against)
 *
 * Why a diff can fail: AGENTS.md §5 requires the homepage baseline to be
 * re-captured and diffed whenever the homepage copy changes. The copy change
 * itself may only touch the title/description strings — anything else (a
 * changed H1, schema types, canonical, robots) is a regression to explain.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_BASE = 'http://127.0.0.1:4321';
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, 'docs', 'seo');
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_ALLOW = ['title', 'meta_description', 'og_title'];
const H1_MAX = 90;

/** Pages captured — the same set as docs/seo/baseline-2026-10-07.json. */
const PAGES = [
  '/',
  '/reviews',
  '/movies',
  '/movies/693134',
  '/reviews/dune-part-two',
  '/search?q=Dune',
  '/u/rakib',
  '/login',
  '/sitemap.xml',
  '/robots.txt',
];

function usage() {
  return [
    'Usage: node scripts/seo/homepage-baseline.mjs [options]',
    '',
    '  --base <url>      origin to crawl (default ' + DEFAULT_BASE + ')',
    '  --out <file>      snapshot path (default docs/seo/baseline-<date>.json)',
    '  --out-dir <dir>   snapshot directory (default docs/seo)',
    '  --against <file>  diff this run against a previous snapshot',
    '  --allow <list>    fields allowed to differ (default ' + DEFAULT_ALLOW.join(',') + ')',
    '  --timeout <ms>    per-request timeout (default ' + DEFAULT_TIMEOUT_MS + ')',
    '  -h, --help        usage',
  ].join('\n');
}

function parseArgs(argv) {
  const opts = {
    base: DEFAULT_BASE,
    out: '',
    outDir: DEFAULT_OUT_DIR,
    against: '',
    allow: DEFAULT_ALLOW.slice(),
    timeout: DEFAULT_TIMEOUT_MS,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) {
        throw new Error(`missing value for ${arg}`);
      }
      return v;
    };
    if (arg === '--base') opts.base = next();
    else if (arg === '--out') opts.out = next();
    else if (arg === '--out-dir') opts.outDir = next();
    else if (arg === '--against') opts.against = next();
    else if (arg === '--allow') opts.allow = next().split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg === '--timeout') opts.timeout = Number(next());
    else if (arg === '-h' || arg === '--help') {
      opts.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return opts;
}

function todayStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Python-style ISO timestamp (matches the 2026-10-07 snapshot's shape). */
function capturedAt() {
  const iso = new Date().toISOString(); // 2026-10-20T08:23:08.338Z
  return iso.replace('Z', '+00:00');
}

function sha16(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function collapse(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function attr(html, tagRe, name) {
  const m = html.match(tagRe);
  if (!m) return null;
  const value = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(m[0]);
  return value ? value[1] : null;
}

/** Inner HTML of every <h1> … </h1>, whitespace-collapsed, capped at 80 chars. */
function h1List(html) {
  const out = [];
  const re = /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push(collapse(m[1]).slice(0, H1_MAX));
  }
  return out;
}

function countTag(html, tag) {
  const re = new RegExp(`<${tag}\\b`, 'gi');
  return (html.match(re) ?? []).length;
}

/** Every @type found in the page's JSON-LD blocks (recursive), deduped + sorted. */
function schemaTypes(html) {
  const types = new Set();
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let node;
    try {
      node = JSON.parse(m[1]);
    } catch {
      continue; // malformed JSON-LD is not a baseline signal
    }
    const walk = (v) => {
      if (Array.isArray(v)) {
        v.forEach(walk);
        return;
      }
      if (!v || typeof v !== 'object') return;
      if (typeof v['@type'] === 'string') types.add(v['@type']);
      else if (Array.isArray(v['@type'])) v['@type'].forEach((t) => types.add(t));
      Object.values(v).forEach(walk);
    };
    walk(node);
  }
  return [...types].sort();
}

async function capturePage(base, route, timeoutMs) {
  const url = `${base.replace(/\/$/, '')}${route}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  let body = '';
  try {
    res = await fetch(url, { redirect: 'follow', signal: controller.signal });
    body = await res.text();
  } finally {
    clearTimeout(timer);
  }

  const page = {
    status: res.status,
    title: titleOf(body),
    meta_description: attr(body, /<meta\b[^>]*name="description"[^>]*>/i, 'content'),
    canonical: attr(body, /<link\b[^>]*rel="canonical"[^>]*>/i, 'href'),
    robots: attr(body, /<meta\b[^>]*name="robots"[^>]*>/i, 'content'),
    og_title: attr(body, /<meta\b[^>]*property="og:title"[^>]*>/i, 'content'),
  };

  // HTML pages carry the on-page signals; the XML/text endpoints keep only
  // what the 2026-10-07 snapshot recorded for them (same shape → same diff).
  if (route === '/sitemap.xml') {
    page.html_sha256 = sha16(body);
    page.url_count = countTag(body, 'loc');
  } else if (route === '/robots.txt') {
    return { status: res.status, html_sha256: sha16(body), body_head: body.slice(0, 200) };
  } else {
    page.h1 = h1List(body);
    page.h2_count = countTag(body, 'h2');
    page.schema_types = schemaTypes(body);
    page.html_sha256 = sha16(body);
  }
  return page;
}

function titleOf(html) {
  const m = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1] : null;
}

async function captureAll(base, timeoutMs) {
  const pages = {};
  for (const route of PAGES) {
    pages[route] = await capturePage(base, route, timeoutMs);
  }
  return { captured_at: capturedAt(), base, pages };
}

/** Compare two snapshots; returns the list of {page, field, from, to}. */
function diffSnapshots(previous, current) {
  const changes = [];
  const routes = new Set([...Object.keys(previous.pages ?? {}), ...Object.keys(current.pages ?? {})]);
  for (const route of routes) {
    const a = previous.pages?.[route] ?? {};
    const b = current.pages?.[route] ?? {};
    const fields = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const field of fields) {
      if (field === 'html_sha256') continue; // always changes with live content
      const from = a[field];
      const to = b[field];
      if (JSON.stringify(from ?? null) !== JSON.stringify(to ?? null)) {
        changes.push({ page: route, field, from: from ?? null, to: to ?? null });
      }
    }
  }
  return changes;
}

function printDiff(changes, allow) {
  if (changes.length === 0) {
    console.log('diff: no signal changes');
    return 0;
  }
  console.log(`diff: ${changes.length} change(s)`);
  let unexpected = 0;
  for (const c of changes) {
    const ok = allow.includes(c.field);
    if (!ok) unexpected++;
    console.log(
      `  ${ok ? 'allowed' : 'UNEXPECTED'} ${c.page} ${c.field}:`,
      JSON.stringify(c.from),
      '->',
      JSON.stringify(c.to),
    );
  }
  console.log(
    `diff: ${changes.length - unexpected} allowed, ${unexpected} unexpected ` +
      `(allowed fields: ${allow.join(',') || 'none'})`,
  );
  return unexpected;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(String(err?.message ?? err));
    console.error(usage());
    process.exit(2);
  }
  if (opts.help) {
    console.log(usage());
    return;
  }

  let snapshot;
  try {
    snapshot = await captureAll(opts.base, opts.timeout);
  } catch (err) {
    console.error(`capture failed: ${String(err?.message ?? err)}`);
    process.exit(2);
  }

  const outPath = opts.out || path.join(opts.outDir, `baseline-${todayStamp()}.json`);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  console.log(`homepage_baseline: wrote ${outPath}`);

  if (!opts.against) return;
  let previous;
  try {
    previous = JSON.parse(await readFile(opts.against, 'utf8'));
  } catch (err) {
    console.error(`--against unreadable: ${String(err?.message ?? err)}`);
    process.exit(2);
  }
  const changes = diffSnapshots(previous, snapshot);
  const unexpected = printDiff(changes, opts.allow);
  if (unexpected > 0) process.exit(1);
}

await main();
