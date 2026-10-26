# Semrush keyword validation: real volumes + KD for the rankable 10 (2026-10-27)

First absolute volume data this project has had. `docs/seo/rankable-10-2026-10-25.md` was built on Trends
relative index + autocomplete only, because `SEMRUSH_TOKEN` carried no API entitlement (`ERROR 120`). This run
used the owner's Semrush **trial session** (cookie export) driven through headless Chrome over CDP.

## Method

| Step | Detail |
|---|---|
| Transport | Owner's `www.semrush.com` header-string export (31 cookies incl. `PHPSESSID`/`SSO-JWT`) injected into a fresh headless Chrome profile via CDP `Network.setCookie`. Chrome 156 refuses a debugging port on the default profile dir, so a non-default user-data-dir was used. Cookie values never printed/logged. |
| Data read #1 | JSON-RPC `POST /kwogw/v2/webapi` → `keywords.GetInfo` returns one call across 9 databases (cross-check volumes). |
| Data read #2 | Keyword Overview UI: load `?q=<phrase>&db=<in|us>`, click **Update metrics** (1 quota unit per keyword+db), scrape rendered text. This fills KD%, intent, CPC, SERP features and the top-10 authority columns that `keywords.GetInfo` leaves null. |
| Quota | 21 / 250 update units used; 229 remain. Bing-style daily caps not hit. |
| Databases | IN (google.co.in) and US (google.com), desktop, 2026-10-27. |
| Raw data | `.opencode`-temp run: `semrush/results.jsonl` (20 records, 0 errors) — not committed. |

Caveats: Semrush volumes are modeled monthly averages and undercount romanized regional-language queries
(2 of 10 returned `n/a` volume). KD is Semrush's model, calibrated for backlink-based SERPs — directional for a
zero-authority site, not a promise.

## The 10 with real numbers

| # | Keyword | IN vol | IN KD | US vol | US KD | Global | Intent | Priority (proposed) |
|---|---|---|---|---|---|---|---|---|
| 1 | `777 charlie ending explained` | **170** | 23 Easy | 0 | 16 Easy | 170 | Info | **P0** |
| 2 | `magadheera review` | **390** | 33 Possible | 20 | 41 Possible | 510 | Commercial | **P0** |
| 3 | `tumbbad ending explained` | 110 | 25 Easy | 20 | **14 Very easy** | 230 | Info | **P0** |
| 4 | `grave of the fireflies ending explained` | 30 | 34 Possible | **70** | 25 Easy | 510 | Info | P1 |
| 5 | `the lunchbox ending explained` | 10 | 26 Easy | 20 | 24 Easy | 210 | Info | P1 |
| 6 | `ratsasan ending explained` | 20 | 33 Possible | 20 | 32 Possible | 80 | Info | P1 |
| 7 | `premam ending explained` | 20 | 29 Easy | 20 | 22 Easy | 50 | Info | P1 |
| 8 | `kumbalangi nights ending explained` | n/a | 30 Possible | 0 | 17 Easy | n/a | Info | P2 (see below) |
| 9 | `kaithi ending explained` | 20 | 38 Possible | 20 | **54 Difficult** | 60 | Info | P2 (IN-first) |
| 10 | `eega ending explained` | n/a | **53 Difficult** | n/a | 38 Possible | n/a | Info | P2 (defer) |

KD scale: 0–14 Very easy, 15–29 Easy, 30–49 Possible, 50–69 Difficult (Semrush labels as shown).

## What the numbers change vs the estimate-based plan

1. **The rankable thesis holds.** 7 of 10 sit at KD ≤ 34 in both databases; the four weakest SERPs from the
   manual audit are also the ones Semrush flags. No retraction needed.
2. **`magadheera review` was underrated.** The rankable-10 doc called it "compound below floor" — Semrush says
   **390/mo IN** (largest single number in the set, Commercial intent, KD 33) and its variation
   `magadheera movie review` adds **320/mo IN at KD 38**. One page serves both. Propose P2 → **P0**.
3. **`eega` and `kaithi` demote.** Eega: no volume data in either db + KD 53 Difficult in IN — worst
   evidence profile in the set. Kaithi: US KD 54 Difficult; IN stays Possible (38) but at only 20/mo.
   Propose both → P2. **`kumbalangi` → P2**: KD is the best on the board (US 17 Easy) but Semrush sees no
   volume at all — autocomplete demand may be Reddit-driven; ship it as a cheap long-tail, not a P0 bet.
4. **`777 charlie` promotes to P0**: 170/mo IN at KD 23, and its variation
   `charlie 777 story ending explained` is **110/mo IN at KD 25** — same page, near-duplicate intent.
5. **US play = Grave of the Fireflies**: 70/mo US (biggest US volume among the explainers), global 510.

## Secondary keywords surfaced by the variations tables (same target pages)

| Variation | IN vol | US vol | KD | Serves |
|---|---|---|---|---|
| `magadheera movie review` | 320 | 20 | 38 | /reviews/magadheera-2009-review |
| `charlie 777 story ending explained` | 110 | 0 | 25 | /reviews/777-charlie-2022-review |
| `tumbbad movie ending explained` | 30 | 20 | n/a | /reviews/tumbbad-2018-review |
| `ratsasan movie ending explained` | 0 | 20 | n/a | /reviews/ratsasan-2018-review |
| `the lunchbox ending explained reddit` | 0 | 20 | n/a | /reviews/the-lunchbox-2013-review |
| `kaithi movie ending explained` | 0 | 20 | n/a | /reviews/kaithi-2019-review |

`n/a` KD = not yet computed on the account (229 update units remain).

## SERP authority snapshot (IN database, position/domain/Page-AS as Semrush reports)

- `tumbbad`: reddit 0, quora 0, thisisbarry 6, lifestyleasia 0, home.blog 15 — **beatable**
- `kumbalangi`: reddit 0, medium 0, dontcallitbollywood 0, tumblr 0 — **beatable, and no explainer owns it**
- `777 charlie`: wikipedia 48 is the only authority; fugitives.com 0, dogwithblog.in 0 rank
- `magadheera review`: idlebrain 28, 123telugu 0, milliblog 0, cinemachaat 0 — beatable at 390/mo
- `grave`: whataboutdrinks.com 1 (AS col shows 0), looper 17, onlineghibli 6 — beatable
- `kaithi`: wikipedia + thehindu 6 own the SERP; eega: wikipedia 52 + screenanarchy 18 — matches the KD flags
- AI Overview sits on 5 of the 10 SERPs; `Discussions and forums` on 4 → E-E-A-T + quotable-facts framing matters

## Proposed `keywords-extramovies.csv` updates — NOT applied, needs owner sign-off

1. `difficulty` column: replace estimates with measured KD, e.g.
   `tumbbad ending explained` → `Easy (25 IN / 14 US)`, `kaithi ending explained` → `Possible 38 IN / Difficult 54 US`,
   `eega ending explained` → `Difficult 53 IN / 38 US` (all 10 rows).
2. `new_priority`: magadheera P2→P0, 777 charlie P1→P0, eega P1→P2, kaithi P1→P2, kumbalangi P0→P2.
3. Optional 2 new active rows: `magadheera movie review` (P0, same target page) and
   `charlie 777 story ending explained` (P0, same target page).

## Next actions

1. Owner signs off (or edits) the CSV proposal above.
2. Writer batch: pages still 404 — order by proposed P0 first (777 Charlie, Magadheera, Tumbbad).
3. Per publish: `notify_publish.py --url <new review>` (IndexNow + GSC sitemap); Bing submit at quota reset
   (~06:00, 50 monthly left); manual GSC Request Indexing ~10/day, demand-ordered.
4. Re-run this batch for the 20 `active` P0/P1 rows still on estimates + compute KD for the six variations
   above (229 units left) when the second content batch lands.
