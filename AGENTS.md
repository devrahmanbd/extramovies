# AGENTS.md — operating contract for AI agents on this repo

Movie-review CMS + publishing platform (Astro 5 SSR, Node standalone,
SQLite/better-sqlite3, TMDB). Live on two CyberPanel VPS sites; more brands
planned. Read this whole file before acting. Short hard-rules version: `.rules`.

## 1. Branches & deployment (read twice — history of silent breakage here)

- `main` = development. Pushing it auto-deploys ALL sites via
  `.github/workflows/deploy.yml` (matrix). A push IS a production deploy.
- `prod-v1` = pruned release snapshots for panel-side manual pulls. Refresh
  only via `scripts/prune-prod.sh` flow; never develop on it.
- No per-site/per-content branches, no forks — ever. Content variants live
  in per-server data, never in git branches.
- Never `push --force` shared branches. Never commit secrets, `.env`,
  `data/*.db`, `data/reviews.json`, `dist/`, or `node_modules/`.

## 2. Multi-site map (single codebase, per-server everything mutable)

| Site | Domain | Port | PM2 | DB | Theme |
|---|---|---|---|---|---|
| extramovies | extramovies.org | 3100 | extramovies | `…/extramovies.org/private/prod.sqlite` | discovery |
| cinemavilla | cinemavilla.in | 3200 | cinemavilla | `…/cinemavilla.in/private/prod.sqlite` | publication |

- Env (`ecosystem.config.js`) and DBs live on servers, outside the repo.
- After root-run ops on a box: `chown -R <siteuser>:<siteuser>` the app dir.
- PM2 rule: `delete` + `start` picks up env changes; bare `restart` does NOT.
- Never copy DB/data files between brands (merges users, leaks sessions).
  Shared content moves via `npm run export` / `npm run import` (Markdown).
- `SITE_ID` env namespaces content per brand (`extramovies`, `cinemavilla`).

## 3. Content model (core shared, content per site)

- `src/lib/seo/content.ts` DEMO rows = shared starter pack only.
- Public loaders merge published store rows over DEMO by slug (store wins,
  drafts excluded, missing file → DEMO fallback). Same slug may hold
  DIFFERENT reviews per site — no conflict (canonicals are per-domain).
- A `draft` store row suppresses its DEMO twin on that site (per-site unpublish).
- Reviews carry optional `sites`; loaders filter by `SITE_ID`. Missing = everywhere.
- Admin edits go live with no restart. `seed:reviews` seeds starters;
  `--refresh` updates `seed-*` rows only — never force it in automation.
- Excerpts ≤160 chars. `updatedAt` bumps on substantive edits only.

## 4. Writing pipeline (house writer: `.opencode/agents/writer.md`)

1. Research gate (NON-NEGOTIABLE): keyword CSV status/priority + fresh SERP
   check before any draft. No content from memory alone.
2. Voice: verdict-first, zero em-dashes, no pivots/throat-clearing, ratings earned.
3. SEO structure: E-E-A-T, quotable facts, keyword anchors (never "click here").
4. Humanizer pass (blader, 33 patterns). Model tiers: free Inkling primary,
   Nemotron Lightning cheap; never `openrouter/free` router.
5. Schema: Review/Movie/Article/AggregateRating/Collection/Person/Profile
   ONLY. NEVER FAQPage (retired May 2026) or HowTo. No hidden markup.
6. Never invent ratings, votes, quotes, scenes, awards. TMDB API for facts.

## 5. SEO policy (new domain, honest difficulty)

- `docs/seo/keywords-extramovies.csv` is authoritative; `status` column rules:
  `active` = target now, `deferred-month-6+` = do not target on purpose.
- No query-param URLs in sitemap; canonicals via `siteOrigin()` (SITE_URL env).
- SEO baseline: `docs/seo/baseline-*.json` — re-capture + diff around changes.
- AI slop policy: original criticism only; no scaled content abuse.

## 6. Verification discipline (evidence before claims)

- `npm test` + `npm run build` green before every push. Dev server `:4321`
  (discovery); `:4322` = publication (start on demand, stop after).
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
