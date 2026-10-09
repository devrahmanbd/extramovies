# Brand asset uploads (logo + favicon) — build brief

Problem: logo/favicon can only be changed by editing files+rebuild. Admin
needs upload buttons; uploads must go live WITHOUT rebuilds (Astro serves
`public/` from the build, so uploads live under `data/uploads/` served by a
runtime route instead).

## Shared contract (both streams — do not deviate)
- Upload endpoint: `POST /api/admin/upload` with multipart `FormData`
  (`file` field + `kind`: `"logo"` or `"favicon"`). Auth: existing
  `requireAdminApi` + `x-csrf-token` header patterns (see save-draft.ts /
  SettingsForm.tsx save). Response: `{ok:true, path:"/uploads/<safe-name>"}`
  or `{ok:false, error}` with 4xx status.
- Validation (shared rules, implement once in the API): extension allowlist
  `svg png jpg jpeg webp ico` + magic-byte sniff (svg:`<svg`, png:`PNG`,
  jpg:`JFIF|Exif`, webp:`RIFF....WEBP`, ico:`\0\0\x01\0`) + 512KB cap +
  basename sanitize (lowercase, `[^a-z0-9._-]` → `-`, no traversal, unique
  suffix on collision, never overwrite).
- Serve route: `GET /uploads/[...path].ts` — traversal-proof (resolve +
  must stay under uploads dir), content-type map for the 6 extensions,
  `Cache-Control: public, max-age=86400`, 404 otherwise. NO auth (public assets).
- Upload dir: `<cwd>/data/uploads` (gitignored already via `data/*`? verify
  .gitignore covers data/ — if `data/uploads/` would be tracked, do NOT add
  an exception; confirm with `git check-ignore`).

## Workstream A — OWNER: api/admin/upload.ts (new), uploads/[...path].ts (new), settings.ts (add `brand.favicon` key + `BRAND_FAVICON` env seed), Base.astro line 130 (favicon link: brand.favicon ?? brand.icon)
- Unit tests for sanitize/validate/sniff as pure helpers (new test file).
- `npm test` + `npm run build` green.

## Workstream B — OWNER: SettingsForm.tsx ONLY
- Add `siteFavicon` mirroring `siteLogo` exactly (interface, EMPTY_DASHBOARD,
  load `v["brand.favicon"]`, save payload `"brand.favicon"`, UI input in
  Site & brand card with the same File-Manager hint line).
- Add Upload buttons next to BOTH logo and favicon inputs: file picker →
  POST FormData to `/api/admin/upload` (with csrf header) → on success fill
  the adjacent input with returned `path` (user still clicks Save).
- No uploader component, no other files. `npm test` green.

## Rules for both
- Working directory: /Users/rahman/Documents/Movie Review. No `npm install`.
- Do NOT touch `data/` content, `.env`, or each other's files.
- Do NOT commit or push. Report back under 12 lines.
