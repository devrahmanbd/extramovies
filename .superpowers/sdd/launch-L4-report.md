# L4 — Launch verification report (2026-10-07)

## Status: CONDITIONAL FAIL — one L1 defect blocks member auth (details §4)

## 1. Suite / build / dry-run (all PASS, fresh evidence this run)

- `npm test`: **PASS** — 21 files / 195 tests green (`Test Files 21 passed, Tests 195 passed`).
- `npm run build`: **PASS** — `[build] Complete!`
- `npx wrangler deploy --dry-run`: **PASS** — config-clean, bindings `env.DB (movie_reviews) D1`, `env.ASSETS`, vars shown, `--dry-run: exiting now.`
- No `npm install` run. `data/reviews.json` untouched. Dev DB restored to baseline (§6).

## 2. Visual QA `/reviews` (both themes, PASS)

Dev `:4321` restarted per brief (root 200, `global.css` 200). Widths 1200 + narrow.
Narrow note: this Chrome's window floor is 500px, so "400" was verified at 500.

- discovery (`SITE_THEME=discovery`): **PASS** — calm branch (`d-guide-grid`, `d-kicker`,
  compact MovieTiles), 3 reviews (Dune: Part Two, The Batman, Joker). 1200: docSW=1200,
  offenders none. 500: docSW=500, offenders none. Console errors: none. Screenshot taken.
- publication (`SITE_THEME=publication`): **PASS** — glam branch (`glam-archive`,
  ReviewCard lead+cells), same 3 reviews/same data. 1200: no overflow. 500: no overflow.
  Console errors: none. Screenshot taken.

## 3. B end-to-end in browser: BLOCKED by member-session split-brain (FAIL, §4)

- signup (browser form): **PASS** — `l4verifya2` created, 200, redirect `/`.
- login (browser form + curl): **PASS** — 200 + `Set-Cookie admin_session=…` + csrfToken.
- POST `/api/member/reviews` (valid cookie + csrf, curl, 3 attempts): **FAIL — 401
  `{"ok":false,"error":"unauthorized"}`** (dev log confirms `401 POST /api/member/reviews`).
- Movie page as logged-in member: shows "Log in to write a member review" (session ignored).
- Admin control: login **PASS**; `POST /api/admin/moderation {action:list}` with cookie
  alone → 403 `bad csrf` (proves session validated); with csrf → **PASS** `ok:true`,
  returns baseline flagged item (`mr_aefcd6ea46d4297b`, cinephile_anna, 1 report, visible).

## 4. Root cause (L1 defect, needs rework — not re-litigation, evidence only)

`astro.config` uses cloudflare `platformProxy`, so dev `locals.runtime.env.DB` is a live
(empty) Miniflare D1. `resolveSessionDb` (`session.ts:82-94`) prefers `env.DB`:

- Session **reads** (guards, pages) → Miniflare D1 (empty) → member 401 always.
- Member session **creates** (`api/auth/signup.ts`, `api/auth/login.ts` local `resolveDb`
  → `getDb({})`, no runtime lookup) → `./data/local.db` (6 member session rows observed there).
- Admin login (`api/admin/login.ts:33`) uses `resolveSessionDb` → D1, consistent → admin works.
- Prod mirror-image risk: on Workers, member creates hit `getDb({})` → better-sqlite3 → 500,
  while reads hit real D1. Suggested fix (L1 lane): make member login/signup resolve the
  session DB via `resolveSessionDb` like admin login does.

## 5. B business-logic chain (PASS, isolated DB copy `/tmp/l4chain.db`, discarded after)

Real lib fns, HTTP-route call order, all green: signup A → session validates (member) →
post review (`mr_5858…`) → public `listForMovie` includes it → profile `listForUser`
includes it (while visible) → signup B → self-report rejected, B-report accepted →
`listFlagged` contains it → `setReviewStatus hidden` ok → public list excludes it.
Semantics note: `listForUser` is visible-only, so post-hide the profile also excludes it —
"/u/[handle] lists it" holds pre-hide.

## 6. Dev DB restore (PASS) + owner handoff

`users 3 / member_reviews 1 / review_reports 1 / sessions 0` — matches pre-run baseline;
throwaway users/sessions/debug review deleted. Temp vitest files removed.
Owner needs: (a) L1 rework per §4, then re-run browser B flow; (b) production checklist
unchanged (D1 id + secrets + domain — dry-run only, no real deploy attempted).
