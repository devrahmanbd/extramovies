# IndexNow integration — report (2026-10-21)

Slice: announce every publish to the IndexNow participants (Bing first) so
the engine looks at a new URL now instead of at the next crawl.

**Status: DONE.** `npm test` green (462 passed), `npm run build` green, no
new npm dependencies.

## The key (PUBLIC — the protocol fetches it from the site root)

```
b51dda5f33279591da8c2fd0653384a4
```

- Key file: `public/b51dda5f33279591da8c2fd0653384a4.txt` (plain text, one
  line, no quotes) → served at `https://extramovies.org/b51dda5f33279591da8c2fd0653384a4.txt`.
- Generated with node's `crypto.randomBytes(16).toString('hex')` (32 hex chars).
- Committed as the default in `src/lib/seo/indexnow.ts`
  (`INDEXNOW_DEFAULT_KEY`); `INDEXNOW_KEY` env overrides it (env wins).
- NOT a secret: never gated on, never a required env var, never a hard
  failure. The owner may mint a Bing-specific key later (Bing Webmaster
  Tools → IndexNow tab) and put it in the site's ecosystem env.

## Files changed

| File | Change |
|---|---|
| `src/lib/seo/indexnow.ts` (new, 300 lines) | The whole integration: key + key override, origin resolution, the pinger, the deadline wrapper |
| `public/b51dda5f33279591da8c2fd0653384a4.txt` (new) | The public key file at the site root |
| `src/pages/api/admin/publish.ts:7-41,75` | After a successful publish → announce the review URL (deadline-guarded, never fatal) |
| `scripts/import.ts:10-14,114-115,196-198,202-206,210-238` | Collect published seeds → announce them in ONE batched request (never fatal) |
| `tests/indexnow.test.ts` (new, 13 tests) | The covering suite (below) |
| `tests/publish-rating-guard.test.ts:66-73` | Stub `fetch` in the existing publish suite so a test run never touches the real endpoint |
| `docs/seo/indexnow.md` (new) | What IndexNow is, the public key, the Bing-specific key steps, "what is still manual" (Bing Webmaster API / Block URLs) |
| `docs/seo/gsc-findings-2026-10-20.md:104-131` | Finding F (the Bing "Blocked" verdict) + action-list rows 7 and 8 |
| `.github/workflows/deploy.yml:57-58,71,80,126,201,214,223,269` | Per-job `SITE_URL` (the deploy shell had none, so the importer could not build absolute URLs) |

### Pinger contract (`src/lib/seo/indexnow.ts`)

- `notifyIndexNow(urls, opts)` → `{ pinged, failed }`; POSTs
  `{ host, key, urlList }` to `https://api.indexnow.org/indexnow`.
- Empty list → no request, zero counts.
- Only `http`/`https` URLs, and only URLs on **our own host** (an external
  host is never announced; it is counted as `failed`).
- ≤ 10,000 URLs per request (protocol limit) → longer lists are split.
- 10s timeout per request (`AbortController`).
- Every network/HTTP failure is swallowed: counts come back, ONE concise
  `console.warn` is logged. It never throws into the publish path.
- `notifyIndexNowSoon(...)` = the same call with a 2s deadline, so a slow
  endpoint can never delay a publish response or a deploy.
- Origin resolution (one place): `SITE_URL` env → request host (behind the
  panel proxy the scheme defaults to `https`) → dashboard `site.url`
  setting. Nothing resolvable → the ping is skipped with one warning (a
  guessed host would announce the wrong site).

### Call sites

- `src/pages/api/admin/publish.ts:75` — `await announcePublish(req, review.slug)`
  after `upsertReview` and BEFORE the 200 response. The publish result
  never depends on the ping.
- `scripts/import.ts:205` — after the store file is written, one batched
  `notifyIndexNowSoon(urls)` for every seed this run published. A ping
  failure is a warning, never an import failure.

## Covering tests — `tests/indexnow.test.ts` (13)

| Test | What it proves |
|---|---|
| `the pinger > POSTs { host, key, urlList } to the IndexNow endpoint` | the payload shape, the endpoint, the method, the content type, the host, the key, the urlList |
| `the pinger > never pings a URL on a different host` | an external host + a non-http scheme are dropped and counted, only our URL is sent |
| `the pinger > sends nothing at all when every URL is on another host` | no request at all |
| `the pinger > does nothing for an empty list` | no request |
| `the pinger > a rejected fetch does not throw — the failure is reported` | `{pinged:0,failed:1}`, no throw, one warning |
| `the pinger > a non-2xx answer does not throw — the failure is reported` | HTTP 400 → reported, no throw |
| `the pinger > caps the url list at the protocol limit (10,000 per request)` | 10,001 URLs → 2 requests (10,000 + 1) |
| `the pinger > the key is public: env override wins, default otherwise` | `INDEXNOW_KEY` wins; the default is 32 hex chars |
| `the pinger > the key file at the site root holds exactly the key` | `public/<key>.txt` is in sync with the module constant |
| `the publish path > the publish still succeeds when the IndexNow ping fails` | a dead endpoint → the publish still returns 200 and the row is published |
| `the publish path > a successful publish announces the review URL to IndexNow` | the publish really pings `/reviews/<slug>` with host+key |
| `the seed importer > announces a published seed and never fails the import` | a published seed is announced and the import returns imported=1 |
| `the seed importer > a failing ping never fails the import` | a dead endpoint → the import still succeeds, the row is published |

## Commands + output tails

```
$ npm test
 Test Files  45 passed (45)
      Tests  462 passed (462)
   Duration  13.99s

$ npm run build
01:25:37 [build] Server built in 3.03s
01:25:37 [build] Complete!

$ ls dist/client/*.txt
dist/client/b51dda5f33279591da8c2fd0653384a4.txt   # the key file ships at the site root
```

## What the owner must do after the release

1. **Release** (this slice is committed on `main`, NOT pushed):
   `git checkout prod-extra && git merge --ff-only main && git push origin prod-extra`
   (push = deploy of extramovies; the same into `prod` for cinemavilla).
2. **Verify the key file is live** (the protocol rejects the ping without it):
   ```
   curl https://extramovies.org/b51dda5f33279591da8c2fd0653384a4.txt
   # → b51dda5f33279591da8c2fd0653384a4
   ```
3. **Verify a publish pings** — publish a review in `/admin` and look for the
   line `[indexnow] announced https://extramovies.org/reviews/<slug>` in the
   PM2 logs (`pm2 logs extramovies`). A failed ping logs one warning and
   changes nothing about the publish.
4. **Optional — a Bing-specific key**: Bing Webmaster Tools → IndexNow tab →
   put it in `/home/extramovies.org/ecosystem.config.js` as `INDEXNOW_KEY`,
   host it at the root as `public/<key>.txt`, then
   `pm2 delete extramovies && pm2 start ecosystem.config.js` (a bare
   `restart` does not pick up env changes).
5. **Still manual (needs the owner's Bing account)** — see
   `docs/seo/indexnow.md` → "what is still manual": clear the legacy
   **Block URLs** list in Bing Webmaster Tools and use the **Bing
   Webmaster API** (Settings → API access) for bulk submission / re-indexing.
   IndexNow never lifts a block: it is an instant notification, not a
   ranking request.

## Notes / risks for the reviewer

- `deploy.yml` was touched (one `SITE_URL` per job + one positional arg
  `$10`): the deploy shell had no site origin at all, so the seed importer
  could not build absolute review URLs. The value is a public domain, not a
  secret, and it is NOT exported into the remote shell — only the import
  step gets it (`SITE_ID=… SITE_URL=… npm run import`). The remote script
  uses `SITE_URL="${10:-}"` so a missing arg cannot break the deploy.
- The importer BATCHES the published seeds into one request (the protocol
  allows 10,000 URLs per call) instead of one request per seed.
- `data/settings.json` is used as the LAST origin fallback for the ping
  only; it is not a secret and is gitignored per site.
