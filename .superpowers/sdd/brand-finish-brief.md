# Brand-override finish work (lead has done the core)

Context: `/admin` brand edits (site name, logo) previously wrote settings
nothing read. Lead implemented `getSiteBrand(read, env?)` in
`src/lib/seo/brand.ts` (preset switch via `getBrandFromSettings` + `site.name`
+ `brand.logo` overrides, never throws) and converted Base + 8 pages to
`await getSiteBrand((k) => getSetting(getDb({}), k))`. New settings key
`brand.logo` exists in `src/lib/settings.ts` (+ `BRAND_LOGO` env seed).

## Workstream A — OWNER: rss.xml.ts ONLY
`src/pages/rss.xml.ts` still calls sync `getBrand()` for the channel
`<title>`/`<description>`. Convert to
`await getSiteBrand((k) => getSetting(getDb({}), k))` (add `getDb,
getSetting` import from `../lib/db/adapter`, swap the brand import).
Run `npm run build` to prove it compiles.

## Workstream B — OWNER: SettingsForm.tsx ONLY (brand logo field)
`src/components/admin/SettingsForm.tsx` needs a `siteLogo` dashboard field
mirroring `siteName` exactly:
- `DashboardSettings` interface + `EMPTY_DASHBOARD`: add `siteLogo: string` / `""`
- load mapping (~line 140): `siteLogo: v["brand.logo"] ?? ""`
- save payload (~line 167): `"brand.logo": dash.siteLogo.trim()`
- UI: in the "Site & brand" card, add
  `<label>Logo path<input value={dash.siteLogo} onChange={setD("siteLogo")} placeholder="/brand/noir-cinema/logo.svg" /></label>`
  plus one muted hint line: upload the file via File Manager, then paste its
  public path here. Do NOT build an uploader.
- The empty-optional pruning loop already drops `""` values — confirm
  `brand.logo` is NOT in its keep-list (only brand.preset/region.default are).

## Workstream C — OWNER: new test file ONLY
Create `tests/site-brand.test.ts` for `getSiteBrand` with a fake async read
(no DB, no env): preset switch (`brand.preset` → golden-hour changes fonts/
colors vs default), `site.name` override changes `name` only, `brand.logo`
relative path absolutized against origin + absolute URL passed through,
empty/throwing read falls back to defaults. Mirror existing vitest style
(`tests/rate-limit-ip.test.ts` is a good template).

## Rules for all
- Working directory: /Users/rahman/Documents/Movie Review. No `npm install`.
- Run `npm test` after your change (full suite must stay green).
- Do NOT commit, do NOT push, do NOT touch `data/`, `.env`, or each other's files.
- Report back under 12 lines: files changed, test result, anything surprising.
