# Spec: Legacy authority claim + Core Web Vitals hardening (2026-10-19)

Two parts. **Part A** is the owner-facing operating guideline (what to do
weekly, what never to do). **Part B** is the engineering spec (what to build:
code, Core Web Vitals, pagespeed tooling). Grounded in the codebase as of
2026-10-19 with `file:line` evidence. Code work inherits AGENTS.md §6:
additive, fallback-first — missing or invalid data renders TODAY's output,
never blank. Pre-push gates stay `npm test` + `npm run build`.

---

## Part A — Owner guideline: claiming the legacy domain's authority

The site is legitimate (review magazine). The domain carries 10 years of
demand, indexed legacy URLs, and backlinks that point at pages which no
longer know they exist. The claim is a loop, not a one-shot:

### A1. The claim loop (weekly rhythm)

1. **Verify in Search Console (BLOCKED on you, once)**: Domain property via
   DNS TXT on the Spaceship panel. Everything downstream needs this unlock.
2. **Collect the link inventory (after verification)**: GSC → Links →
   "Top linked pages". Export monthly. This is the real backlink graph the
   Wayback project never had — Wayback gave us demand, not links.
   Concretely, from the GSC UI (the account is `elsinnombre3301@gmail.com`):
   - External links → "Top linked pages" → Download CSV → save as
     `data/legacy/gsc_links.csv` (gitignored). This is the direct input for
     `scripts/seo/backlink_rescue.py` (it matches the export's
     "Top linked pages" / "Referring page" headers).
   - External links → "Top linking sites" → Download CSV → save as
     `data/legacy/gsc_linking_sites.csv` (scale + quality triage: which
     referring domains deserve a personal outreach).
   - Indexing → Pages → Download CSV → save as `data/legacy/gsc_pages.csv`
     (the legacy URLs Google still knows about; drives the "validate fix"
     batch order in step 4).
   - Performance → Queries → Download CSV → save as
     `data/legacy/gsc_queries.csv` (brand-query baseline for A3).
   Note: the v1 GSC external-links API is deprecated, so the external-link
   inventory is a UI export; the automatable API surfaces are sitemaps,
   Search Analytics, and URL Inspection (service-account access, see below).
3. **Rescue live backlinks (highest-value action)**: for each live source
   page still linking a legacy path, update that link directly to
   `/reviews/<slug>` or `/movies/<tmdbId>`. A direct link beats a redirect
   hop. Small numbers win: 30-50 upgraded real backlinks outweigh savings
   from thousands of forum spam links that Google likely discounts anyway.
4. **Let the 301 map consolidate index equity**: legacy paths keep
   redirecting indefinitely; Google recrawls redirects on its own schedule.
   After verification, use URL Inspection → "validate fix" on batches of
   legacy URLs to accelerate recrawling.
5. **Publish into the demand**: turn the top legacy-demand titles into real
   hubs with reviews (Part B4 queue). A 301 landing on a content page
   transfers equity; landing on a stub wastes it. Sitemap stays
   review-driven (policy unchanged).
6. **Re-check the Manual Actions surface every GSC session**: aged domain
   history with inherited profile makes this a standing watch item, not a
   launch-week checkbox.

### A2. Hard rules (violate none)

- Never 200-serve a legacy path: 301 to real content or 410. Shipped
  app-level in `src/lib/legacy/router.ts` — do not regress it.
- Never mass-index TMDB-only pages or legacy targets; a hub enters the
  sitemap only via the attached-review gate (`src/pages/sitemap.xml.ts:25`).
- Parasite operations follow `docs/seo/parasite-playbook.md` unchanged:
  canonical discipline, participation-first, tier-2 rule. This spec does
  not amend it.
- Brand queries are the contamination zone: pursue "extramovies review"
  positioning per the P0 keyword rows; never the download phrasings, on
  platform or off.
- Exports and contact data stay under `data/legacy/` (gitignored). Never
  commit third-party emails or GSC/Semrush export files containing them.

### A3. KPIs (how we judge the claim, monthly)

| KPI | Source | 6-month target |
|---|---|---|
| Legacy URLs consolidating into the live tree | GSC Coverage (legacy rows draining, valid rows rising) | positive trend, no fixed number |
| Upgraded direct backlinks | GSC Links: new referring domains pointing at live paths | 30-50 real ones |
| Verdict-pattern ranks (`is {film} worth watching`, `{film} {year} review`) | GSC Top queries | page one for 3-5 titles |
| CrUX mobile LCP / INP / CLS, 75th percentile | CrUX via PSI (Part B0) | all green |
| Brand-query share vs pirate-intent variant | GSC Queries | rising share month over month |

---

## Part B — Engineering spec: what to build

Evidence gathered 2026-10-19 (source + live probes). Existing gaps, ranked:
no CWV tooling at all (nothing named lighthouse/psi/vitals in scripts/,
package.json, docs/), uploads cache only 1 day with no ETag
(`src/pages/uploads/[...path].ts:57,65`), hero image missing intrinsic
dimensions on the publication theme (`src/pages/index.astro:129-135`,
`src/components/public/MagazineHome.astro:36-42`), fonts load via a
print-to-all CSS trick with no `display=swap`
(`src/layouts/Base.astro:110-118`), and no `rel=preload` anywhere in src/.
Public pages have zero hydration outside `client:` islands in admin — that
is already an INP asset; the spec must not add client JS to public pages.

### B0. CWV baseline + regression guard ([P0] — measurement first)

- Create `scripts/seo/cwv-baseline.mjs`: node-only, `fetch`, ZERO new
  dependencies. Input: URLs pulled live from `/sitemap.xml`. Calls the
  PageSpeed Insights API (`https://www.googleapis.com/pagespeedonline/v5/runPagespeed`,
  free tier, `strategy=mobile` and `desktop`) per URL and extracts: overall
  performance score, LCP/INP/CLS values, and top lab opportunities.
  PSI is rate-limited without a key: on HTTP 429, record the URL as
  `skipped` in the snapshot and keep exit code 0; never abort a run.
- Output: `docs/seo/baseline-cwv-<YYYY-MM-DD>.json` (same convention as the
  existing `docs/seo/baseline-*.json` files, AGENTS.md §5). Add a
  `--against <file>` diff mode: prints per-URL score and metric deltas,
  exits non-zero when performance score drops by more than 5 points or any
  CrUX/Lab metric bucket regresses a category (Green→Orange→Red verdict is
  the unit, not raw ms noise).
- Acceptance: first run writes the snapshot; second run diffs readable;
  skipped URLs participate as `skipped` rows and pass quietly.

### B1. Uploads transport hardening ([P0] — the only app-served asset surface)

- `src/pages/uploads/[...path].ts` (owns all of `/uploads`):
  1. Cache-Control: `public, max-age=604800` (7 days). Keep the no-auth
     posture. Do NOT add `immutable`: upload filenames are not
     content-hashed.
  2. Add an `ETag` derived from mtime + size, and short-circuit
     conditional GETs with `304` when `If-None-Match` matches.
     Fallback-first: if ETag derivation throws, serve 200 normally — an
     image request must never become a 500.
  3. Replace `fs.readFile` (line 57) with streaming
     (`fs.createReadStream` piped into the Response body; the node
     standalone adapter accepts it) so big uploads are not read fully into
     memory per request.
  4. Keep the traversal guard unchanged and covered.
  5. New test `tests/uploads-headers.test.ts`: assert Cache-Control +
     ETag on 200; second request carrying If-None-Match → 304; traversal
     path → 404 (pre-existing guard, pinned now).
- Upstream note (owner panel TODO, zero repo change): verify CyberPanel
  returns `content-encoding: br|gzip` for HTML above the fold. If
  compression is absent upstream, enable it in the panel — server
  configuration, not repo code. Record the finding when B0's first
  snapshot is captured.

### B2. LCP / CLS fixes on the hero surfaces ([P0] — small and surgical)

1. `src/pages/index.astro:129-135` backdrop `img.glam-cover-bg`: add
   explicit `width`/`height` matching the TMDB size variant actually
   requested (w1280 → 1280x720, w780 → 780x439, poster w300 → 300x450;
   the same numbers DiscoverHome already uses,
   `src/components/discover/DiscoverHome.astro:105-112`), plus emit
   `<link rel="preload" as="image">` in the head for the same URL.
   If the variant is unknown at render time, omit the size pair and keep
   the preload — never guess dimensions.
2. `src/components/public/MagazineHome.astro:36-42`: same treatment.
2b. **Discovery branch (the live extramovies theme)**: `src/pages/index.astro`
   derives the first slide's backdrop URL and feeds Base's `preloadImage`
   channel so the preload renders in the HEAD; the same URL string is passed
   into `src/components/discover/DiscoverHome.astro` for slide 0's `src`, so
   href and src cannot drift. A preload inside the component body renders too
   late to help the LCP element and is not body-ok markup. The component must
   not emit a link itself.
3. `src/layouts/Base.astro:110-118`: append `display=swap` to the Google
   Fonts URL (removes invisible-text pop; the print-to-all trick stays).
4. Rule: NO new infrastructure — no image CDN, no `astro:assets` adoption,
   no client JS on public pages. Sizes and preload only.

### B3. Schema completeness ([P2] — no new types; policy forbids AggregateRating)

- `src/lib/seo/jsonld.ts` review nodes already ship Review + embedded
  Rating; AggregateRating is forbidden by policy (comment at jsonld.ts:5
  stands; do not touch).
- One sanctioned gap: add `isBasedOn` on the Review node itself, pointing at
  the reviewed work's existing TMDB record (the Movie node already exists at
  `jsonld.ts:68`). Do NOT put `isBasedOn` on the `itemReviewed` Movie node:
  that asserts the film is based on the page for itself, which reads as a
  false claim to a crawler. Extend `tests/streaming-seo.test.ts` with one
  assertion covering the new field; break zero existing assertions.

### B4. Demand-ranked hub queue ([P1] — fuels Part A1 step 5)

- Create `scripts/legacy/rank_demand.py` (same tooling style as
  `archive_recover.py`; outputs stay gitignored). Inputs: box artifacts
  `redirect_map.csv` + `cdx.jsonl`. Output `data/legacy/demand_top.csv`
  with columns
  `tmdb_id,tmdb_type,legacy_hits,mapped_count,confidence,title,year,queue`,
  sorted by `legacy_hits` desc. This is a read-only VIEW: never mutate the
  map or unresolved files.
- The owner works down the queue in `/admin` (review + hub flow). The
  sitemap gate already decides which hubs become public URLs.
- Acceptance: runs offline against fixture CSVs in repo, and on the box
  against real artifacts; malformed rows are skipped loudly in the log,
  never crashed on.

### B5. Backlink-rescue tooling ([P1] — fuels Part A1 step 3)

- Create `scripts/seo/backlink_rescue.py`: input is a GSC "Top linked
  pages" export CSV (Semrush equivalent after token rotation into `.env`,
  not CLI flags). Normalize rows to
  `(legacy_path, referring_domain, referrer_url)`. For each unique legacy
  path: HEAD-check the referrer URL status, reverse-lookup the redirect
  target of the legacy path in the map, and write
  `data/legacy/outreach.csv` with columns
  `referrer,target_url,source_status,map_status,note` where `source_status` ∈
  `200|404|DNS_FAIL|SKIP_BOT` and `map_status` ∈ `ok|missing|stale`. A referrer
  page that is dead or robot-blocked is archived with its label, never silently
  dropped. Add a `--draft` mode printing a 3-line outreach note per live-source
  row; the owner sends messages manually — this script never contacts anyone.
- Acceptance: plain `csv` module (quote-safe), missing files → header-only
  output + exit 0, all writes under `data/legacy/`.

### B6. Verification gates

- `npm test` + `npm run build` green before any push. No exceptions
  (AGENTS.md §6).
- New tests: `tests/uploads-headers.test.ts` (B1), one streaming-seo
  assertion (B3). Sitemap gating tests untouched and green.
- Browser verification on preview for the B2 changes: snapshot → ctrl:
  1200px + 400px widths, both themes, console clean.
- Released evidence: `curl -sD -` on one `/uploads` URL shows the 7-day
  Cache-Control and the 304 chain; re-run `cwv-baseline.mjs` and the diff
  shows the LCP/CLS deltas.

### Review Focus (failure modes the tests above do not exercise)

1. A TMDB variant with unknown intrinsic size on a hero surface → expect
   the size ATTRIBUTE PAIR to be omitted (preload kept), not guessed; the
   owning page test in B2 pins the fallback branch.
2. The panel proxy strips or overrides app headers → only the PROD curl
   step verifies real header behavior; threshold assertions never run in
   CI against localhost-only behavior.
3. PSI rate limit mid-run → snapshot records the URL as `skipped` and the
   diff compares only present keys; a fully-skipped run is a quiet pass.
4. A stale redirect_map row during B4/B5 reverse lookup → row is labeled
   (B5: `SKIP_BOT`/stale note; B4: falls out of the queue loudly) and
   never maps to a wrong target.
5. Referrer CSVs with quoting + commas in source URLs → accepted by the
   csv module round-trip; the pinned test in B5 uses two comma-bearing
   fixture rows.
