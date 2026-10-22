# Indexing playbook (extramovies.org)

Written 2026-10-22. Companion to `docs/seo/gsc-findings-2026-10-20.md`
(Findings C, D and F) and `docs/seo/indexnow.md`.

## Where the site stands on 2026-10-22

| Fact | Value | How it was measured |
|---|---|---|
| URLs in the live sitemap | 104 | `https://extramovies.org/sitemap.xml` |
| Sitemap last downloaded by Google | 2026-10-22T06:12:43Z | Search Console API, `sitemaps.list` |
| Sitemap contents counter | submitted 104, indexed 0 | Search Console API, `sitemaps.list` |
| Sitemaps registered for the property | 1 (`https://extramovies.org/sitemap.xml`) | Search Console API, `sitemaps.list` |
| URLs known to Google | 10 of 104 | URL Inspection API, audit run 2026-10-22 |
| URLs actually in the search index | 7 of 104 | URL Inspection API, audit run 2026-10-22 |
| URLs Google never saw | 94 of 104 | URL Inspection API, audit run 2026-10-22 |
| URLs that need a Request Indexing click | 97 of 104 | URL Inspection API, audit run 2026-10-22 |

The "indexed 0" counter is a property-level counter that lags badly. It is
not a verdict on any single URL. The per-URL truth comes from the URL
Inspection API, which is what `gsc_index_audit.py` runs.

The 10 URLs Google knows break down as 7 indexed ("Submitted and indexed")
and 3 known but not indexed ("Discovered - currently not indexed"). The 7
indexed ones are the homepage, the review hub, and five older reviews.
Everything else is either unseen (94) or seen but not indexed (3).

## The three tools

All three are Python 3 standard library only. No pip install, no new
dependency. Credentials come from the environment and from the existing
service-account key, never from a file in the repo. Nothing they print
contains a secret.

### 1. `scripts/seo/gsc_index_audit.py` (Search Console URL Inspection sweep)

What it does: reads the live sitemap, inspects every URL one at a time with
`urlInspection.index.inspect`, and records the verdict, the coverage state,
the robots.txt state, the canonical Google picked, and the last crawl time
for each URL. It then decides, per URL, whether Google knows the page, and
prints the URLs Google does not know yet, grouped by page kind (review, hub,
taxonomy, site). That list is the worklist the owner pastes into
Search Console -> URL Inspection -> Request Indexing.

The audit writes one CSV per run to `data/legacy/gsc-index-audit-<date>.csv`
(that folder is gitignored). Columns: `url`, `kind`, `status`, `verdict`,
`coverage_state`, `robots_txt_state`, `google_canonical`, `last_crawl_time`,
`page_fetch_state`, `indexing_state`, `known_to_google`, `indexed`,
`error`.

The rule behind `known_to_google`: a URL is known when neither the verdict
nor the coverage state says "URL is unknown to Google", and the page fetch
came back neither empty nor a 404. A URL Google has never seen reports
`coverage_state = "URL is unknown to Google"` and
`page_fetch_state = "PAGE_FETCH_STATE_UNSPECIFIED"`.

`indexed` is the stricter question: is the page in the search index
(`coverage_state = "Submitted and indexed"`). A URL can be known to Google
and still not be indexed ("Discovered - currently not indexed"). Those URLs
need the owner's Request Indexing click just as much as the unseen ones,
so the worklist is built from "not indexed", not from "unknown to Google".

Auth is delegated to `scripts/seo/gsc_api.py` (`load_key`, `mint_token`,
`SCOPES`). The read-only scope is enough. The key path comes from
`$GSC_SA_KEY` or the default `~/.config/gsc-sa/extramovies-gsc-reader.json`.

Commands:

```bash
# offline self-test, no network
python3 scripts/seo/gsc_index_audit.py --selftest

# full sweep of the live sitemap (caps at 200 URLs per run)
python3 scripts/seo/gsc_index_audit.py --max 200

# a smaller, slower sweep
python3 scripts/seo/gsc_index_audit.py --max 50 --delay 0.4

# against a different sitemap
python3 scripts/seo/gsc_index_audit.py --sitemap-url https://extramovies.org/sitemap.xml
```

A single failing URL never stops the sweep. That URL gets an `error` row and
the run continues.

Runtime: the URL Inspection API answers one URL every 5 to 6 seconds, so a
full 104 URL sweep takes about 11 minutes. Run it in the background and read
the CSV afterwards. The `--delay` default of 0.25 seconds keeps the call
rate far under the 600 per minute limit.

### 2. `scripts/seo/bing_submit.py` (Bing Webmaster bulk submission)

What it does: reads the live sitemap and pushes every URL to Bing through
the Webmaster API, 100 URLs per request, logging each response and printing
a summary (submitted, failed, error text).

Endpoint and body, as used by this tool:

```
POST https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlBatch?apikey=<KEY>
Content-Type: application/json

{"siteUrl": "https://extramovies.org", "urlList": ["https://extramovies.org/", ...]}
```

A success answers `HTTP 200` with `{"d": null}`. A rejection answers
`HTTP 400` with `{"ErrorCode": 3, "Message": "..."}`. The method name is
case-insensitive on Bing's side, and the tool uses the spelling from
Microsoft's own documentation.

Credentials: `BING_API_KEY`, read from the environment only. The key is
never written to a file, never logged, and never printed (every echoed URL
has the `apikey` parameter redacted).

Commands:

```bash
# see what would be sent, send nothing
python3 scripts/seo/bing_submit.py --dry-run --site-url https://extramovies.org

# submit every sitemap URL
python3 scripts/seo/bing_submit.py --site-url https://extramovies.org

# submit one URL
python3 scripts/seo/bing_submit.py --url https://extramovies.org/reviews/joker

# read the site's daily and monthly allowance
python3 scripts/seo/bing_submit.py --quota

# offline self-test
python3 scripts/seo/bing_submit.py --selftest
```

If `BING_API_KEY` is not set, the script prints exactly what the owner has
to do and exits 0. It is not a failure.

### 3. `scripts/seo/gsc_sitemap_submit.py` (the correct sitemap submit)

What it does: `PUT`s the sitemap to Search Console with the feedpath the
API accepts, and reports which form works.

The earlier manual attempt failed with `HTTP 400 "Could not process sitemap
'sitemap.xml'"`. That message is not a broken sitemap. It is the API saying
the feedpath it was given is not a usable sitemap URL. The method is
`PUT {base}/sites/{siteUrl}/sitemaps/{feedpath}`, and for a domain property
the feedpath has to be the full sitemap URL, URL-encoded.

Measured on 2026-10-22 against the live property:

| # | Variant | Result |
|---|---|---|
| 1 | `sc-domain:extramovies.org` + `sitemap.xml` | HTTP 400 "Could not process sitemap 'sitemap.xml'" |
| 2 | `sc-domain:extramovies.org` + `https://extramovies.org/sitemap.xml` | **HTTP 204, accepted** |
| 3 | `sc-domain:extramovies.org` + `/sitemap.xml` | HTTP 400 |
| 4 | `https://extramovies.org/` + `sitemap.xml` | HTTP 403 (no URL-prefix property on this account) |
| 5 | `https://extramovies.org/` + full sitemap URL | HTTP 403 |

The variant that works:

```
PUT https://searchconsole.googleapis.com/webmasters/v3/sites/sc-domain%3Aextramovies.org/sitemaps/https%3A%2F%2Fextramovies.org%2Fsitemap.xml
```

Commands:

```bash
# offline self-test
python3 scripts/seo/gsc_sitemap_submit.py --selftest

# try the variants in order and report the one that works
python3 scripts/seo/gsc_sitemap_submit.py --site sc-domain:extramovies.org

# the exact monthly command (one request, no guessing)
python3 scripts/seo/gsc_sitemap_submit.py \
  --site sc-domain:extramovies.org \
  --feedpath https://extramovies.org/sitemap.xml
```

The sitemap write needs the full `https://www.googleapis.com/auth/webmasters`
scope. The read-only scope answers 403 "Request had insufficient
authentication scopes". The service account
`extramovies-gsc-reader@hsc2025.iam.gserviceaccount.com` already has Full
permission on the domain property, so the write works as it stands.

## What is automated today

| What | Where | When |
|---|---|---|
| IndexNow ping for the published URL | `src/pages/api/admin/publish.ts` | on every publish from the dashboard |
| IndexNow batch ping for imported seeds | `scripts/import.ts` | after a seed import that publishes reviews |
| The sitemap is regenerated | `src/pages/sitemap.xml.ts` | on every deploy |
| Monthly Search Console snapshot | `.github/workflows/gsc-snapshot.yml` (cron `17 5 1 * *`) | the 1st of every month |
| The legacy inspect queue | same workflow | same run, artifact kept 30 days |

IndexNow covers Bing, Yandex, Seznam and Naver. It never asks for inclusion
and it never lifts a crawl block. It only says "this URL changed, look at it
now".

## What only the owner can do

| # | Action | Where | Why no tool can do it |
|---|---|---|---|
| 1 | Click "Request Indexing" for each URL on the audit worklist (97 URLs on 2026-10-22) | Search Console -> URL Inspection | Google's indexing request is a manual, per-URL UI action |
| 2 | Delete the three stale sitemaps | Search Console -> Sitemaps | `sitemaps.delete` answers 403 for the service account |
| 3 | Create the Bing API key and put it in `.env` | Bing Webmaster Tools -> Settings -> API access | only the account holder can mint it |
| 4 | Clear the legacy "Block URLs" list | Bing Webmaster Tools -> Block URLs / Crawl Control | the blocked list is account state for the 2016-2025 corpus |

On item 2: the stale entries were `https://extramovies.org/sitemap_index.xml`
(2017), `http://extramovies.org/sitemap_index.xml` (2017) and
`http://extramovies.org/sitemap.xml` (2017). On 2026-10-22 the API listed
only `https://extramovies.org/sitemap.xml`, so the stale ones look gone
already. If the Search Console UI still shows them, delete them there. They
are the reason GSC used to log an error on every crawl.

On item 4: Bing says the brand URLs are "known to Bing but cannot appear".
That verdict is a block decision on Bing's side. Until the block list is
cleared, a URL submission is a notification into a blocked bucket.

## Quotas and limits

| Limit | Value | Source |
|---|---|---|
| URL Inspection | 2,000 inspections per day per property, 600 per minute | developers.google.com/webmaster-tools/limits |
| Bing URL submission, batch | 500 URLs per call is the documented maximum, this tool sends 100 | Microsoft, `IWebmasterApi.SubmitUrlBatch` |
| Bing URL submission, allowance | daily and monthly quota per site, readable with `GetUrlSubmissionQuota` | Microsoft, `IWebmasterApi.GetUrlSubmissionQuota` |
| IndexNow | 10,000 URLs per request | indexnow.org |
| Google Indexing API | 200 publish requests per day per project by default, 100 per batch request | developers.google.com/search/apis/indexing-api/v3/using-api |

`gsc_index_audit.py` caps a run at `--max 200` (2,000/day is the hard
ceiling) and always reports how many URLs were inspected and how many were
skipped, so a sweep can never eat the daily quota by accident.

## There is no bulk submit for Google

Google's Indexing API does not cover article pages. Its own documentation
says the Indexing API "can only be used to crawl pages with either
JobPosting or BroadcastEvent embedded in a VideoObject". Movie reviews are
neither. Calling it for our review pages would be a misuse of the API and
would not get a single review indexed.

So there are exactly four routes for Google, and only one of them is
automated:

1. **The sitemap.** Done. It is generated on every deploy, submitted with
   `gsc_sitemap_submit.py`, and Google downloads it.
2. **Manual Request Indexing.** The audit worklist, one URL at a time, in
   the Search Console UI. On 2026-10-22 that list was 97 URLs: 94 Google
   had never seen, and 3 it knew about but had not indexed.
3. **Internal links.** Every review links to the review hub, to its
   taxonomy pages and to its siblings. This is how Google discovers a new
   review when the sitemap is not enough.
4. **External links.** Backlinks from other sites. See
   `docs/seo/backlink-rescue.md`.

The honest summary: Google is told about every URL by the sitemap, and
IndexNow tells Bing and friends the moment a URL goes live. The remaining
gap, the manual clicks, is the only route Google offers for an article page.
