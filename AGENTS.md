# AGENTS.md — operating contract for AI agents on this repo

Movie-review CMS + publishing platform (Astro 5 SSR, Node standalone,
SQLite/better-sqlite3, TMDB). Live on two CyberPanel VPS sites; more brands
planned. Read this whole file before acting. Short hard-rules version: `.rules`.

## 1. Branches & deployment (read twice — history of silent breakage here)

- `main` = development. It NEVER deploys. `prod` = release; pushing `prod`
  auto-deploys ALL sites via `.github/workflows/deploy.yml` (matrix
  extramovies + cinemavilla). Release flow: finish on `main`, verify green,
  `git checkout prod && git merge main && git push origin prod`.
  Merging to `prod` IS the production deploy — do it deliberately.
  Recommended: protect `prod` (require PR + green checks) so merge = approval.
- Docs-only pushes (`docs/**`, `**/*.md`, `.rules`, `.superpowers/**`) skip
  deploys via `paths-ignore`.
- `prod-v1` = pruned release snapshots for panel-side manual pulls. Refresh
  only via `scripts/prune-prod.sh` flow; never develop on it.
- No per-site/per-content branches, no forks — ever. Content variants live
  in per-server data, never in git branches.
- Never `push --force` shared branches. Never commit secrets, `.env`,
  `data/*.db`, `data/reviews.json`, `data/settings.json`, `dist/`,
  `session-*.md`, or `node_modules/`.
- Never edit code on servers; change locally, verify, push, let CI deploy.

## 2. Two-site separation (single codebase, per-server everything mutable)

| Site | Domain | Port | PM2 | DB | Theme | SITE_ID |
|---|---|---|---|---|---|---|
| extramovies | extramovies.org | 3100 | extramovies | `…/extramovies.org/private/prod.sqlite` | discovery | `extramovies` |
| cinemavilla | cinemavilla.in | 3200 | cinemavilla | `…/cinemavilla.in/private/prod.sqlite` | publication | `cinemavilla` |

- Env (`ecosystem.config.js`) and DBs live on servers, outside the repo.
  Required per-box env: `SITE_ID`, `SITE_URL`, theme/preset, DB path.
- After root-run ops on a box: `chown -R <siteuser>:<siteuser>` the app dir.
- PM2 rule: `delete` + `start` picks up env changes; bare `restart` does NOT.
- Separation is by construction, not discipline:
  1. Reviews/members/settings/homepage copy live per-server (`data/` + SQLite).
     Writing in site A's `/admin` physically cannot appear on site B.
  2. Reviews carry optional `sites`; loaders filter by `SITE_ID`.
     Missing/empty = shared starter (shows everywhere). New rows default to
     the current site only; "every site" is an explicit editor opt-in.
  3. Same slug may hold DIFFERENT reviews per site (canonicals per-domain).
  4. Users/sessions/votes are never synced, ever — no mechanism exists.
- Never copy DB/data files between brands (merges users, leaks sessions).
  Shared content moves ONLY via `npm run export` / `npm run import`
  (Markdown + frontmatter). Import stamps the current `SITE_ID` by default.
- Pre-namespace rows: tag with `scripts/backfill-sites.ts --site=<id>`
  (`--dry` first; seeds stay shared unless `--include-seeds`).
- Content seeds ship with the release: new `.md` files under `seeds/<site>/`
  import automatically on every prod deploy (`--skip-existing`, SITE_ID
  stamped, deploy logs show `SEED OK` per slug). Drafts arrive unpublished
  for the owner to adjust/publish in that site's `/admin`.

## 3. Content model (core shared, content per site)

- `src/lib/seo/content.ts` DEMO rows = NEUTRAL shared starter pack only.
  Never write site-specific voice into code — site voice lives in that
  site's store rows (store-wins merge), or it leaks to every brand.
- Public loaders merge published store rows over DEMO by slug (store wins,
  drafts excluded, missing file → DEMO fallback).
- A `draft` store row suppresses its DEMO twin on that site (per-site unpublish).
- Homepage H1 is content-driven (featured review title, SITE_ID-filtered).
  Surrounding words (meta title/description, section heads/deks) are per-site
  dashboard settings (`homepage.*` keys, `src/lib/homepage.ts` loader with
  coded fallback). Changing them is an SEO event — re-check rankings after.
- Brand assets (logo/favicon/OG) stay ROOT-RELATIVE (`/uploads/…`) so they
  resolve on the requesting domain. Never prefix a preset domain: every
  preset hardcodes one host, which breaks all other brands. Absolute URLs are
  built only at emission points needing them (og:image, JSON-LD) from the
  request origin (`siteOrigin()` / overridden `brand.origin`).
- Admin edits go live with no restart. `seed:reviews` seeds starters;
  `--refresh` updates `seed-*` rows only — never force it in automation.
- Excerpts ≤160 chars. `updatedAt` bumps on substantive edits only.
- Uploads land in `data/uploads/` (served at `/uploads/…`, no rebuild).
  Upload alone changes nothing — the Logo path field + **Save all settings**
  persists it. If the nav still shows the preset logo, the save never landed.

## 4. Writing pipeline (house writer: `.opencode/agents/writer.md`)

1. Research gate (NON-NEGOTIABLE): keyword CSV status/priority + fresh SERP
   check before any draft. No content from memory alone.
2. Per-site workflow: write in THAT site's `/admin` (its drafts are invisible
   everywhere until published there). Default is exclusive to the site;
   cross-post only via export/import, then publish per site. Never publish
   untagged pre-namespace rows — tag `sites` first or they show everywhere.
3. Voice: verdict-first, zero em-dashes, no pivots/throat-clearing, ratings earned.
   Ratings are the owner's placeholders until adjusted — AI never sets taste.
4. SEO structure: E-E-A-T, quotable facts, keyword anchors (never "click here").
5. Humanizer pass (blader, 33 patterns). Model tiers: free Inkling primary,
   Nemotron Lightning cheap; never `openrouter/free` router.
6. Schema: Review/Movie/Article/AggregateRating/Collection/Person/Profile
   ONLY. NEVER FAQPage (retired May 2026) or HowTo. No hidden markup.
7. Never invent ratings, votes, quotes, scenes, awards, streaming links.
   TMDB API for facts; unreleased films are PREVIEWS (no rating, no verdict).
8. Keyword CSVs are per brand (`keywords-<site>.csv`); `status` column rules:
   `active` = target now, `deferred-month-6+` = do not target on purpose.

## 5. SEO policy (new domain, honest difficulty)

- `docs/seo/keywords-extramovies.csv` is authoritative for extramovies;
  cinemavilla needs its own CSV before targeted writing there.
- No query-param URLs in sitemap; canonicals via `siteOrigin()` (SITE_URL env
  or request origin). Sitemaps list only own-domain URLs.
- SEO baseline: `docs/seo/baseline-*.json` — re-capture + diff around
  homepage/H1/schema changes. Homepage with no overrides must render
  byte-identical (modulo dev instrumentation).
- AI slop policy: original criticism only; no scaled content abuse.

## 6. Development rules (additive, fallback-first)

- New behavior must be additive with coded fallback: missing/invalid data
  renders TODAY's output, never blank. Validate on save; fail soft on load.
- `npm test` + `npm run build` green before every push. No exceptions.
- `security.checkOrigin: false` in `astro.config.mjs` is INTENTIONAL: the
  panel proxy terminates TLS (Node sees http, browser sends https Origin;
  Astro also drops ports), which 403s all browser multipart uploads while
  JSON passes. App-level synchronizer CSRF (`x-csrf-token`, timing-safe,
  `src/lib/auth/guard.ts`) covers every mutating route instead. Do NOT
  re-enable without a proxy-aware alternative. Symptom of regression:
  `Cross-site POST form submissions are forbidden` on `/api/admin/upload`.
- Dev server `:4321` (discovery); `:4322` = publication/preview (start on
  demand, stop after). Dev React islands can fail to hydrate (known
  `jsxDEV` HMR noise) — verify admin UI against `npm run preview` builds.
- UI changes: verify in browser (snapshot → assert → screenshot), both themes
  for shared components, 1200 + 400px widths, console clean.
- Never claim "works" from code reading alone.

## 7. Subagent protocol

- Briefs in `.superpowers/sdd/<name>-brief.md`; reports to `<name>-report.md`.
- One owner per file set; subagents never push (lead reviews diffs, then pushes).
- Reports under limits stated in the brief, with file:line evidence.

## 8. Secrets

- Never print secrets, keys, hashes, or passwords in chat, logs, or files.
- Credentials travel only via server env files and GitHub environment secrets.
- If a secret touches chat/history: rotate it next stable window + `history -c`.
- Past incidents (TMDB/ngrok/Semrush tokens in chat) stay rotated; never reuse.
