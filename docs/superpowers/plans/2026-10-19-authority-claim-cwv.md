# Authority claim + CWV hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the engineering part of the 2026-10-19 spec: CWV baseline tooling, uploads transport hardening, hero LCP/CLS fixes, one schema field, and two legacy/SEO scripts.

**Architecture:** Astro 5 SSR, node standalone, zero public-page client JS stays. Additive code only: uploads route gains ETag/streaming; hero imgs gain dimensions/preload; pages remains static. Scripts are node-only (B0) and Python (B4/B5) with gitignored outputs.

**Tech Stack:** Astro 5 / better-sqlite3 / node:fs streaming; Python 3 stdlib (csv, urllib), zero new npm deps.

**Spec:** `docs/superpowers/specs/2026-10-19-authority-claim-cwv.md` (argument source; executors read both)

## Global Constraints

- Additive, fallback-first (AGENTS.md §6): missing/invalid data renders today's output, never blank; an image request must never 500.
- Zero new npm dependencies. No client JS on public pages (no-new-infra rule, spec B2.4).
- No AggregateRating schema (banned, `src/lib/seo/jsonld.ts:5`).
- Script outputs live under `data/legacy/` or `docs/seo/` snapshots only; never commit third-party contact data.
- Gates: `npm test` + `npm run build` green before any push; agents never push.

## Review Focus

1. Unknown TMDB variant size on a hero surface → omit size pair, keep preload (pinned by Task 2 page test).
2. App headers must be verified against PROD (curl), never threshold-asserted in CI (Task 1 keeps unit tests mid).
3. PSI 429 → quiet `skipped` row, exit 0; full-skip run still passes (Task 4).
4. Stale/unresolvable map row during script runs → labeled loudly (SKIP_BOT / queue drop), never wrong-target mapping (Tasks 5-6).
5. Ragged CSV quoting (commas in URLs) round-trips via csv module with comma-bearing fixture rows (Task 6).

---

### Task 1: Uploads ETag + streaming + cache headers

**Files:**
- Modify: `src/pages/uploads/[...path].ts` (readFile at :57; Cache-Control at :65)
- Create: `tests/uploads-headers.test.ts`

**Interfaces:**
- Produces: same GET route signature (APIRoute); adds ETag/304 logic internal to the handler. No exports change; other tasks do not consume it.

- [ ] Step 1: Write failing test: 200 serves Cache-Control `public, max-age=604800` + ETag present; If-None-Match repeat → 304 (no body); traversal `../` → 404.
- [ ] Step 2: Run `npx vitest tests/uploads-headers.test.ts` → FAIL.
- [ ] Step 3: Implement: content-length+mtime ETag; conditional GET short-circuit; `fs.createReadStream` → Response body with `Content-Type` by extension (map from existing code path); ETag-derive errors → serve 200 normally.
- [ ] Step 4: Full `npm test` green (312 + new).
- [ ] Step 5: Commit `perf(uploads): etag 304, streaming body, 7d cache`.

### Task 2: Hero LCP/CLS fixes (publication + magazine + fonts)

**Files:**
- Modify: `src/pages/index.astro:129-135` (backdrop img), add head preload
- Modify: `src/components/public/MagazineHome.astro:36-42`
- Modify: `src/layouts/Base.astro:110-118` (append `display=swap`)
- Test: page/render assertions in a new `tests/hero-lcp.test.ts` (fallback branch: unknown variant → no size pair, preload kept)

**Interfaces:**
- Consumes: TMDB URL size variants already used by `DiscoverHome.astro:105-112` (w1280→1280x720, w780→780x439, poster w300→300x450).
- Produces: preload `<link rel="preload" as="image">` present on publication home + magazine layout when a hero image URL exists.

- [ ] Step 1: Write failing test: rendered publication homepage HTML (theme fixture) contains width/height on the backdrop img AND preload link; variant-unknown fixture omits pair, keeps preload.
- [ ] Step 2: Run test → FAIL.
- [ ] Step 3: Implement sizes/preload; append `&display=swap` to fonts URL.
- [ ] Step 4: `npm test` green; `npm run build` green.
- [ ] Step 5: Commit `perf(hero): intrinsic sizes, preload, font-display swap`.

### Task 3: Review schema `isBasedOn`

**Files:**
- Modify: `src/lib/seo/jsonld.ts` (review builder near :110-118)
- Modify: `tests/streaming-seo.test.ts` (1 new assertion)

**Interfaces:**
- Consumes: existing TMDB record already flowing into review JSON-LD composition.
- Produces: `isBasedOn` on the Review node's `itemReviewed` linkage; no signature changes.

- [ ] Step 1: Add failing assertion to streaming-seo test: review-path JSON-LD emits `isBasedOn` from TMDB id.
- [ ] Step 2: FAIL → implement → green.
- [ ] Step 3: Commit `feat(schema): isBasedOn on reviews`.

### Task 4: CWV baseline script (node, zero deps)

**Files:**
- Create: `scripts/seo/cwv-baseline.mjs`
- Create: `docs/seo/baseline-cwv-<date>.json` (output, committed snapshot; NOT a test file)

**Interfaces:**
- Produces: CLI `node scripts/seo/cwv-baseline.mjs [sitemapURL] [--against file]`; snapshot JSON shape `{ date, urls: [{ url, ps: {score, lcp, inp, cls} | "skipped" }] }`; diff mode exit 1 on regression (score drop >5 or bucket category Worst→Poor→Good).

- [ ] Step 1: Implement fetch from `/sitemap.xml` (default prod), PSI per URL with 429 → `skipped`, snapshot write, `--against` diff + exit codes.
- [ ] Step 2: Run once locally with a stub PSI response (fixture via `--position` not possible → use `PSI_BASE_URL` env override for the offline test run) and an offline `--against` self-diff → prints equal, exit 0.
- [ ] Step 3: Commit `feat(seo): cwv baseline + diff script`.

### Task 5: Demand-ranked hub queue (python)

**Files:**
- Create: `scripts/legacy/rank_demand.py`
- Create: fixture `scripts/legacy/fixtures/map_fixture.csv` (tiny, committed)

**Interfaces:**
- Produces: `python3 scripts/legacy/rank_demand.py --map redirect_map.csv --cdx cdx.jsonl --out data/legacy/demand_top.csv`; columns `tmdb_id,tmdb_type,legacy_hits,mapped_count,confidence,title,year,queue` sorted by legacy_hits desc; malformed rows skipped loudly; never mutates inputs.

- [ ] Step 1: Implement (csv stdlib, cdx hit counts aggregated by legacy path → mapped rows join).
- [ ] Step 2: Run on fixture → verify sorted output + skip-note on malformed row.
- [ ] Step 3: Commit `feat(legacy): demand-ranked hub queue script`.

### Task 6: Backlink-rescue script (python)

**Files:**
- Create: `scripts/seo/backlink_rescue.py`
- Create: fixture `scripts/seo/fixtures/gsc_links_fixture.csv` (2 comma-bearing URL rows committed)

**Interfaces:**
- Produces: `python3 scripts/seo/backlink_rescue.py --links gsc.csv --map redirect_map.csv --out data/legacy/outreach.csv [--draft]`; row shape `referrer,target_url,source_status,map_status,note`; `source_status ∈ 200|404|DNS_FAIL|SKIP_BOT`; `map_status ∈ ok|missing|stale`; `--draft` prints 3-line notes for live, mapped source rows; never contacts anyone.

- [ ] Step 1: Implement (csv stdlib, urllib HEAD with 5s timeout → DNS_FAIL mapping).
- [ ] Step 2: Fixture run: comma rows round-trip; missing inputs → empty out + exit 0.
- [ ] Step 3: Commit `feat(seo): backlink rescue classifier`.

---

**Self-review note:** Executed inline 2026-10-19. Spec coverage: B0→T4, B1→T1, B2→T2, B3→T3, B4→T5, B5→T6. Step scan: every step is one action. Type consistency: ETag shape (string) consistent; script flags named once. Review Focus: line 1 pinned in T1/T2 (implicit in step 1 of T2), 2-5 owned by the tasks above.

