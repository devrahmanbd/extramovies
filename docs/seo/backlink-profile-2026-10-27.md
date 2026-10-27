# Backlink profile audit: extramovies.org (2026-10-27)

Context: owner states the domain is **8 years old with 700+ backlinks and a piracy history**.
Verified against Semrush Backlink Analytics (owner's trial session, 2026-10-27). Follows the
`backlink-analysis` skill framework (profile summary / quality / risk / recommendations).

## Profile summary (Semrush, worldwide)

| Metric | Value | Note |
|---|---|---|
| Authority Score | **2 / 100** | "Lacks organic traffic"; components: Natural Profile, Link Power, Organic Traffic |
| Backlinks | **705** (+25% YoY) | 489 follow (69%) / 216 nofollow (31%) |
| Referring domains | **330** (+41% YoY) | grew 123 → 319 in the last 12 months |
| Organic traffic | 138 (US-scoped) | GSC anchor: 87% of clicks are India |
| Organic keywords | 29 (US) | all at positions 21–50; 9 shown: brand + misspellings only |
| Outbound domains | 0 | not a link farm itself |
| Network Graph label | **"Dangerous"** | Semrush's graph classification |
| Semrush category | "Metals & Mining" | junk category assignment — noise, but symptomatic of the source pool |
| Toxicity Score | not measured | needs a Backlink Audit campaign (not created) |
| Legacy index | **~63,735 pages** | Semrush's crawl of the pre-rebrand corpus |

## Quality assessment

**Weaknesses (why 705 links ≈ near-zero effective authority):**

- **Anchors**: brand (`extramovies.org`, `extramovies`) mixed with link-spam phrases
  (`high quality do…ks online cheap`, `our rankings im…ink building 📈`, `seo domain research`)
  and piracy keywords (`mobile movie download`, `dual audio`, junk token `sam`).
- **Sources**: SEO-checker auto-spam (`extramovies.org.sitescorechecker.com`, `wants.cfd`),
  tool pages linking `robots.txt`/`sitemap.xml` with nofollow, most marked *Lost: Link removed*.
- **Targets are dead ends**: top linked URLs are `http://extramovies.org/online.php?link=…`
  (last seen **2020**), `/category/dual-audio-movies/` and `/category/hindi-dubbed-movies/`
  (7 links / 3 domains each), and three homepage variants (`http`, `https`, `www`).
  Semrush even lists `https://extramovies.org/` as a **broken 404 page** (last seen Jul 2025 —
  a migration-era snapshot; the homepage serves 200 today).

**Strengths:**

- 8-year domain age and clean outbound profile (0 outbound).
- Link mass is still growing organically (+41% RDs YoY) without any link building.
- Brand anchors are the largest single group — the domain name itself is the equity.

## Risk signals (per backlink-analysis)

| Signal | Status | Action |
|---|---|---|
| Spammy anchors | present (link-selling + piracy phrases) | **Monitor only** — Google treats spam anchors as the linker's fault |
| Link schemes / toxic sources | suspected (checker-spam network) | No disavow without a manual penalty |
| Manual penalty | none evident (property indexes, impressions flow) | **Do not disavow** — over-disavowing harms |
| Sudden RD spike | 123 → 319/yr, largely auto-generated | Expected for a known domain; not actionable |
| Homepage variant split | links split across http/https/www | Verify all 301 to the canonical (they should already) |

## Recommendations

1. **Reclaim > acquire.** The existing equity lands on legacy URLs. The sanctioned tooling —
   `scripts/legacy/archive_recover.py` → 301s for resolvable post URLs to `/movies/<tmdbId>`,
   410 for the rest — is now the highest-leverage link action: it moves 705 links' worth of
   legacy equity onto indexable pages instead of dead ends.
2. **Redirect, don't 410, the two linked category paths.** `/category/dual-audio-movies/` and
   `/category/hindi-dubbed-movies/` each carry live backlinks; the routing rules currently
   normalize category prefixes away (→ 410). Owner decision: point these two at the matching
   category hub instead (a handful of real links; low priority but free).
3. **No disavow file** unless a manual action appears in GSC.
4. **Do not buy links.** AS 2 with this anchor mix means Google has seen the neighborhood;
   links from the same pool would compound the risk for zero benefit.
5. **Frame stays honest**: "near-zero *effective* authority" is correct for planning — the raw
   705 links do not lift ranking ability. What changes: the domain is not a fresh start either;
   it carries recoverable legacy equity and brand-anchor recognition.

## How this feeds the ranking math

- Semrush **KD does not depend on our domain** (it models the top-10 results), so the
  `docs/seo/semrush-keywords-2026-10-27.md` KD bands stand unchanged.
- Effective authority ≈ AS 2 → the P0/P1 split in that doc (KD ≤ 34 targets first) remains the
  right sequencing; nothing here justifies attacking the KD 50+ rows earlier.

Raw captures: temp `semrush/` (`domain_overview.txt`, `backlinks_base.txt`, `pages.txt`,
`refdomains.txt`) — not committed.
