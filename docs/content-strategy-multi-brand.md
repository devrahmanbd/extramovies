# Multi-brand content strategy (core shared, content per site)

Status: PROPOSED 2026-10-10 — no code changes until approved.
Covers extramovies.org, cinemavilla.in, and every future domain/brand.

## 1. The one rule

**Code is shared, content is namespaced, users never roam.** One repo, one
pipeline, N deploys. A review belongs to one or more named sites; a member
belongs to exactly one. No per-site branches, no code forks, no DB copies
between brands — ever (copied DBs merge user tables, leak sessions across
brands, and collide IDs; that path is closed).

## 2. Identity model (per deploy, no code)

Each site is fully described by configuration, all already supported:

| Axis | Mechanism | Example |
|---|---|---|
| Domain/origin | `SITE_URL` env | `https://newbrand.example` |
| Site key | `SITE_ID` env (new, proposed) | `newbrand` |
| Look | `brand.preset` setting + `/admin` name/logo overrides | existing presets or a new skin |
| Front | `SITE_THEME` env | discovery = guide, publication = magazine |

Adding brand N+1 = new preset JSON (optional) + fresh DB + `SITE_ID`. Zero
code changes for standard launches.

## 3. Content namespaces

- Every review carries optional `sites: string[]`. Missing/empty = shared
  starter content (today's behavior — nothing breaks on deploy day).
- Loaders filter by the deploy's `SITE_ID`. Same slug may hold DIFFERENT
  reviews on different sites with zero conflict (canonicals are per-domain).
- A `draft` store row suppresses its DEMO twin on that site only — the
  per-site unpublish mechanism.
- `/admin` editor gains "Publish to": current site default; "all sites"
  opt-in. Default is exclusive; sharing is a deliberate click.
- Shared pieces are authored ONCE (in an agreed home site) and moved with
  `npm run export` / `npm run import` (Markdown + frontmatter, already in
  repo) — never by copying database files.

## 4. Onboarding checklist (repeatable per domain)

1. Hosting + domain + SSL (DEPLOY.md §2b pattern: own port, PM2 name, DB path).
2. `SITE_ID`, `SITE_URL`, theme, preset; admin seed (`seed:reviews` starter pack).
3. Write 3–5 exclusive launch reviews (namespace default does this automatically).
4. Sitemap → Search Console + Bing; brand socials; parasite profiles.
5. Backlink/toxicity audit BEFORE any redirect points at it (merger runbook Gate 0).

## 5. Governance (who decides what)

- Shared vs exclusive is an editorial call at write time (the checkbox),
  defaulting to exclusive. No retroactive re-tagging sweeps without owner sign-off.
- Cross-posting = export/import with attribution preserved, never DB copies.
- Member data never leaves its brand (privacy boundary, not just hygiene).
- New content types (series ✓ built; anime/manga later) follow the same
  namespace rules — no separate system.

## 6. Explicit non-goals

- Per-site git branches for content. Per-site code forks. Shared user base
  across brands. Migrating reviews by copying SQLite files. Targeting
  deferred high-difficulty heads before month 6 (see keyword CSV status).
