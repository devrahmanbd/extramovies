# IndexNow — instant URL notification (extramovies.org)

Added 2026-10-21. Companion to `docs/seo/gsc-findings-2026-10-20.md`
(Finding F) and to the Bing "Blocked — URL cannot appear on Bing" state
the owner hit while inspecting URLs in Bing Webmaster Tools.

## What IndexNow is

IndexNow (<https://www.indexnow.org>) is an open protocol that lets a
site tell search engines **"these URLs changed — look at them now"**
instead of waiting for the next crawl. Bing, Yandex, Seznam, Naver,
Seznam and the other participants share ONE endpoint, so a single ping
reaches all of them:

```
POST https://api.indexnow.org/indexnow
{ "host": "extramovies.org", "key": "<key>", "urlList": ["https://extramovies.org/reviews/<slug>"] }
```

**What it is NOT:** a ranking request. IndexNow never asks for a better
position, never asks for inclusion, and never lifts a crawl block. It
only says "look at this URL again, it changed". Bing still decides what
to do with the notification, and the legacy "Blocked" state on old URLs
is a separate, manual thing (see "what is still manual" below).

## The key is PUBLIC (by design)

The protocol requires the key to be **fetchable from the site root**, so
anyone can read it. It is a shared token, not a secret:

- it lives in the repo at `public/b51dda5f33279591da8c2fd0653384a4.txt`
  (plain text, one line) and is therefore served at
  `https://extramovies.org/b51dda5f33279591da8c2fd0653384a4.txt`;
- it is also the committed default in `src/lib/seo/indexnow.ts`
  (`INDEXNOW_DEFAULT_KEY`), so the app and the seed importer read the
  same value;
- **never** gate anything on it, never treat it as a credential, never
  make it a required env var. The code works without it.

## How it is wired

| Where | What happens |
|---|---|
| `src/lib/seo/indexnow.ts` | the pinger (`notifyIndexNow`) + the key + the origin resolution |
| `src/pages/api/admin/publish.ts` | after a successful publish, the new review URL is announced (2s deadline, never fatal) |
| `scripts/import.ts` | after a seed run lands published reviews, their URLs are announced in ONE batched request (never fatal) |
| `public/<key>.txt` | the key file the protocol fetches |

Safety rules baked into the pinger:

- only `http`/`https` URLs, and only URLs on **our own host** (an
  external host is never announced);
- at most 10,000 URLs per request (the protocol limit);
- 10s timeout per request;
- every failure is swallowed and reported as counts — a dead endpoint
  can never break a publish or a deploy.

The announced origin is resolved in this order: `SITE_URL` env → the
request host (behind the panel proxy the scheme defaults to `https`) →
the dashboard `site.url` setting. If none resolves, the ping is skipped
with one warning (a guessed host would announce the wrong site).

## Getting a Bing-specific key later (optional)

The shared key above is enough for every IndexNow participant. If the
owner wants a Bing-specific key:

1. Bing Webmaster Tools → the property → **IndexNow** tab → create /
   copy the key for the host;
2. put it in the site's **ecosystem env** (the file that lives outside
   the repo on the box):

   ```js
   // /home/extramovies.org/ecosystem.config.js
   env: { SITE_ID: 'extramovies', SITE_URL: 'https://extramovies.org', INDEXNOW_KEY: '<bing-key>' }
   ```

3. host the key file at the site root too (the file name must be the
   key: `public/<bing-key>.txt` — or keep the default file and let the
   env override win);
4. `pm2 delete extramovies && pm2 start ecosystem.config.js` (a bare
   `restart` does NOT pick up env changes).

`INDEXNOW_KEY` wins over the committed default, so a second brand can
use its own key with no code change.

## What is still manual

IndexNow is the instant half only. These still need the owner's Bing
account:

| # | What | Where | Why it is not automated |
|---|---|---|---|
| 1 | **Clear the legacy "Blocked" list** | Bing Webmaster Tools → **Block URLs** (or Crawl Control) | The blocked list is legacy state for the 2016-2025 piracy corpus; only the account holder can clear it |
| 2 | **Bulk submission / re-index** | **Bing Webmaster API** (API key: Bing Webmaster Tools → Settings → **API access**) | The API can submit URL batches and re-submit the whole sitemap after a cleanup; it needs a key that only the account owner can mint |
| 3 | Verify the key file is reachable | `curl https://extramovies.org/<key>.txt` | Must return the key itself |

The Bing Webmaster API is the tool for step 1+2 at scale (submit batches
of URLs, then re-submit the sitemap); IndexNow is the tool for "this one
URL just went live, come now".
