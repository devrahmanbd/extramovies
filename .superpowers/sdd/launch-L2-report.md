# Report: Task L2 — Wrangler + secrets wiring

## Changes
- `wrangler.toml:9` — `[assets] directory` fixed: `"dist/client"` → `"dist"`.
  Verified by fresh `npm run build`: `dist/` root holds `_worker.js`, `_routes.json`,
  `_astro/`, `brand/`, `vendor/`; `dist/client` does not exist. `main` unchanged
  (`dist/_worker.js`).
- `README.md` — appended `## LAUNCH checklist` after `## Deploy notes`
  (no restructure): D1 create → paste id → remote migrations → 4 secrets →
  SITE_URL + ADMIN_EMAIL vars → `npm run deploy`, each step marked for owner's
  Cloudflare account vs repo-only. Notes SESSION_SECRET optional (see below).
- `wrangler.toml:16` D1 id left as `REPLACE_WITH_D1_ID` per instructions —
  checklist points at it. No secrets added to repo; `npm install` not run.

## Secrets verification (code-read)
- Required `wrangler secret put`: TMDB_API_KEY (`src/lib/streaming.ts:112`),
  OMDB_API_KEY (`src/lib/omdb.ts`), OPENROUTER_API_KEY (`src/lib/ai/openrouter.ts`),
  ADMIN_PASSWORD (+ ADMIN_EMAIL bootstrap seed, `src/lib/auth/password.ts:46-53`).
- SESSION_SECRET is **not read** by runtime code (only comment/docs mentions;
  sessions are opaque `randomBytes` tokens in `src/lib/auth/session.ts`) —
  checklist marks it optional. DEPLOY.md env table row calling it "Yes/required"
  is stale (out of L2 scope, flagged only).

## Verify evidence
- `npm run build` → `[build] Complete!` (both runs, incl. after edit).
- `npx wrangler deploy --dry-run` → exit 0, config-clean; bindings resolve
  (DB/ASSETS/4 vars). No account needed for dry-run.
- `grep -n REPLACE_WITH_D1_ID wrangler.toml` → line 16, placeholder intact.

## Could NOT verify without owner's Cloudflare account
- Real `wrangler d1 create` id, `--remote` migrations apply, secret values,
  `SITE_URL` canonical origin, and actual `wrangler deploy` + production smoke
  (dry-run does not validate the placeholder D1 id resolves remotely).
