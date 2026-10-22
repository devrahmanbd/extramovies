#!/usr/bin/env python3
"""gsc_index_audit.py — URL Inspection sweep for extramovies.org.

Answers one question for every URL in the live sitemap: does Google know
this page, and if not, why not? The answer is the owner's "Request Indexing"
worklist, so the sweep writes both a machine-readable CSV and a grouped
summary on screen.

Auth is delegated to scripts/seo/gsc_api.py (load_key, mint_token, SCOPES,
api_request). Nothing about the signing is duplicated here, and no credential
is ever written to disk or printed.

The URL Inspection API allows 2,000 inspections per day per property
(developers.google.com/webmaster-tools/limits). The run is capped at --max
(200 by default) so a sweep can never eat the daily quota, and the summary
always states how many URLs were inspected and how many were skipped.

What lands in the CSV (one row per sitemap URL):

  url               the sitemap URL
  kind              review | hub | taxonomy | site  (what the page IS)
  status            inspected | error | skipped
  verdict           PASS | NEUTRAL | FAIL | PARTIAL | INFORMATIONAL
  coverage_state    Google's own coverage wording ("Submitted and indexed",
                    "URL is unknown to Google", ...)
  robots_txt_state  ALLOWED | DISALLOWED | ...
  google_canonical  the canonical Google picked, if any
  last_crawl_time   when Google last fetched the page
  page_fetch_state  SUCCESSFUL | EMPTY | NOT_FOUND | ...
  indexing_state    INDEXING_ALLOWED | BLOCKED_BY_ROBOTS_TXT | ...
  known_to_google   True when Google knows the URL at all
  indexed           True when the URL is in the search index itself
  error             the failure text when status is "error"

"known_to_google" rule (stated here because it is the number the owner acts
on): the URL is known when neither the verdict nor the coverage state says
"URL is unknown to Google", and the page fetch was neither empty nor a 404.
A URL that Google has never seen reports
coverage_state="URL is unknown to Google" with
page_fetch_state="PAGE_FETCH_STATE_UNSPECIFIED".

"indexed" is the stricter question: Google says the page is in the search
index (coverage_state="Submitted and indexed"). A URL can be known to Google
and still not be indexed (coverage_state="Discovered - currently not
indexed"). Those URLs need the owner's Request Indexing click just as much
as the unknown ones, so the worklist is built from "not indexed", not from
"unknown to Google".

Usage:
  python3 scripts/seo/gsc_index_audit.py
  python3 scripts/seo/gsc_index_audit.py --sitemap-url https://extramovies.org/sitemap.xml
  python3 scripts/seo/gsc_index_audit.py --max 50 --delay 0.4
  python3 scripts/seo/gsc_index_audit.py --selftest

Exit codes: 0 ok, 1 input/API error, 2 usage error.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

import gsc_api  # noqa: E402  (sibling module, path set above)

REPO_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_SITE = "sc-domain:extramovies.org"
DEFAULT_SITEMAP = "https://extramovies.org/sitemap.xml"
DEFAULT_MAX = 200
DEFAULT_DELAY = 0.25

# The URL Inspection API allows 2,000 inspections per day per property.
# A single run may never ask for more than that, whatever --max says.
DAILY_QUOTA = 2000

SITEMAP_NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"

USER_AGENT = "extramovies-seo-audit/1.0 (+https://extramovies.org)"

# The kinds the owner asks for. The rules follow the site's own route set
# (src/pages) and the sitemap builder (src/pages/sitemap.xml.ts).
KIND_REVIEW = "review"
KIND_HUB = "hub"
KIND_TAXONOMY = "taxonomy"
KIND_SITE = "site"
KIND_ORDER = [KIND_REVIEW, KIND_HUB, KIND_TAXONOMY, KIND_SITE]

CSV_COLUMNS = [
    "url",
    "kind",
    "status",
    "verdict",
    "coverage_state",
    "robots_txt_state",
    "google_canonical",
    "last_crawl_time",
    "page_fetch_state",
    "indexing_state",
    "known_to_google",
    "indexed",
    "error",
]

UNKNOWN_MARKER = "url is unknown to google"


# --------------------------------------------------------------------------
# URL kinds
# --------------------------------------------------------------------------


def classify_url(url: str) -> str:
    """Return the page kind of a sitemap URL.

    review    /reviews/<slug>          the editorial review
    hub       /reviews, /movies, /series, /upcoming and the per-title hubs
              /movies/<tmdbId>, /series/<tmdbId>
    taxonomy  /category/<slug>, /cast/<slug>, /director/<slug>
    site      /, /about, /contact and any other static page
    """
    path = urllib.parse.urlsplit(url).path or "/"
    parts = [p for p in path.split("/") if p]

    if not parts:
        return KIND_SITE
    if parts[0] == "reviews" and len(parts) >= 2:
        return KIND_REVIEW
    if parts[0] in ("category", "cast", "director") and len(parts) >= 2:
        return KIND_TAXONOMY
    if parts[0] in ("movies", "series"):
        return KIND_HUB
    if parts[0] in ("reviews", "upcoming"):
        return KIND_HUB
    return KIND_SITE


# --------------------------------------------------------------------------
# Sitemap
# --------------------------------------------------------------------------


def fetch_text(url: str, timeout: int = 45) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_sitemap_locs(xml_text: str) -> tuple[list[str], list[str]]:
    """Return (page URLs, child sitemap URLs) for a sitemap document."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise ValueError(f"not valid XML: {exc}") from exc

    tag = root.tag.split("}")[-1]
    pages: list[str] = []
    children: list[str] = []
    if tag == "sitemapindex":
        for node in root.iter(f"{SITEMAP_NS}sitemap"):
            loc = node.findtext(f"{SITEMAP_NS}loc")
            if loc:
                children.append(loc.strip())
    else:
        for node in root.iter(f"{SITEMAP_NS}url"):
            loc = node.findtext(f"{SITEMAP_NS}loc")
            if loc:
                pages.append(loc.strip())
    return pages, children


def collect_sitemap_urls(url: str, depth: int = 0) -> list[str]:
    """Fetch a sitemap and every child sitemap, and return the page URLs."""
    pages, children = parse_sitemap_locs(fetch_text(url))
    if depth < 2:
        for child in children:
            try:
                pages.extend(collect_sitemap_urls(child, depth + 1))
            except Exception as exc:  # a broken child must not kill the sweep
                print(f"  warning: child sitemap {child} failed ({exc})", file=sys.stderr)
    seen: set[str] = set()
    unique: list[str] = []
    for page in pages:
        if page not in seen:
            seen.add(page)
            unique.append(page)
    return unique


# --------------------------------------------------------------------------
# Inspection
# --------------------------------------------------------------------------


def known_to_google(verdict: str, coverage_state: str, page_fetch_state: str) -> bool:
    """True when the URL is in Google's index.

    Unknown when the verdict or the coverage state carries the
    "URL is unknown to Google" marker, or when the page fetch came back
    empty / not found.
    """
    if UNKNOWN_MARKER in (verdict or "").lower():
        return False
    if UNKNOWN_MARKER in (coverage_state or "").lower():
        return False
    if (page_fetch_state or "").upper() in ("EMPTY", "NOT_FOUND"):
        return False
    return True


def is_indexed(verdict: str, coverage_state: str) -> bool:
    """True when the page itself is in Google's search index.

    Google can know a URL (it has seen it) and still not have indexed the
    page. Those pages are reported as "Discovered - currently not indexed".
    """
    return (coverage_state or "").strip().lower() == "submitted and indexed"


def is_redirected(coverage_state: str, page_fetch_state: str) -> bool:
    """True when Google fetched a redirect instead of the page."""
    if (page_fetch_state or "").upper() == "REDIRECTED":
        return True
    return "redirect" in (coverage_state or "").lower()


def inspect_url(site: str, url: str, token: str, timeout: int = 60) -> dict:
    """Run one urlInspection.index.inspect call and flatten the answer."""
    body = json.dumps(
        {"siteUrl": site, "inspectionUrl": url, "languageCode": "en-US"}
    ).encode()
    req = urllib.request.Request(
        f"{gsc_api.INSPECT_API}/urlInspection/index:inspect",
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode())

    index = (data.get("inspectionResult") or {}).get("indexStatusResult") or {}
    verdict = index.get("verdict") or ""
    coverage = index.get("coverageState") or ""
    page_fetch = index.get("pageFetchState") or ""
    return {
        "verdict": verdict,
        "coverage_state": coverage,
        "robots_txt_state": index.get("robotsTxtState") or "",
        "google_canonical": index.get("googleCanonical") or "",
        "last_crawl_time": index.get("lastCrawlTime") or "",
        "page_fetch_state": page_fetch,
        "indexing_state": index.get("indexingState") or "",
        "known_to_google": known_to_google(verdict, coverage, page_fetch),
        "indexed": is_indexed(verdict, coverage),
    }


def blank_row(url: str) -> dict:
    row = {col: "" for col in CSV_COLUMNS}
    row["url"] = url
    row["kind"] = classify_url(url)
    return row


# --------------------------------------------------------------------------
# Output
# --------------------------------------------------------------------------


def write_csv(rows: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for row in rows:
            out = dict(row)
            for flag in ("known_to_google", "indexed"):
                out[flag] = "true" if row.get(flag) is True else "false"
            writer.writerow(out)


def group_worklist(rows: list[dict]) -> dict[str, list[dict]]:
    """Group the URLs that still need a Request Indexing click, by kind."""
    grouped: dict[str, list[dict]] = {kind: [] for kind in KIND_ORDER}
    for row in rows:
        if row.get("status") != "inspected":
            continue
        if row.get("indexed") is True:
            continue
        grouped.setdefault(row.get("kind") or KIND_SITE, []).append(row)
    return grouped


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="gsc_index_audit.py",
        description="Sweep every sitemap URL through Search Console URL Inspection.",
    )
    parser.add_argument("--site", default=DEFAULT_SITE, help=f"GSC property (default: {DEFAULT_SITE})")
    parser.add_argument(
        "--sitemap-url", default=DEFAULT_SITEMAP, help=f"sitemap to read (default: {DEFAULT_SITEMAP})"
    )
    parser.add_argument(
        "--max",
        type=int,
        default=DEFAULT_MAX,
        help=f"maximum URLs to inspect in this run (default: {DEFAULT_MAX}, hard cap {DAILY_QUOTA})",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=DEFAULT_DELAY,
        help=f"seconds between calls (default: {DEFAULT_DELAY})",
    )
    parser.add_argument(
        "--out",
        default=None,
        help="CSV output path (default: data/legacy/gsc-index-audit-<date>.csv)",
    )
    parser.add_argument("--selftest", action="store_true", help="run the offline checks and exit")
    return parser


def cmd_selftest(_args: argparse.Namespace) -> None:
    """Offline checks: URL kinds, sitemap parsing, and the known/unknown rule."""
    failures = 0

    def check(label: str, got: object, want: object) -> None:
        nonlocal failures
        if got != want:
            failures += 1
            print(f"selftest: FAIL {label} -> {got!r} (want {want!r})", file=sys.stderr)

    # 1. URL kinds.
    kinds = [
        ("https://extramovies.org/", KIND_SITE),
        ("https://extramovies.org/about", KIND_SITE),
        ("https://extramovies.org/contact", KIND_SITE),
        ("https://extramovies.org/upcoming", KIND_HUB),
        ("https://extramovies.org/reviews", KIND_HUB),
        ("https://extramovies.org/movies", KIND_HUB),
        ("https://extramovies.org/series", KIND_HUB),
        ("https://extramovies.org/movies/278", KIND_HUB),
        ("https://extramovies.org/series/46976", KIND_HUB),
        ("https://extramovies.org/reviews/joker", KIND_REVIEW),
        ("https://extramovies.org/reviews/dune-part-two", KIND_REVIEW),
        ("https://extramovies.org/category/action", KIND_TAXONOMY),
        ("https://extramovies.org/cast/tom-holland", KIND_TAXONOMY),
        ("https://extramovies.org/director/arya", KIND_TAXONOMY),
    ]
    for url, want in kinds:
        check(f"kind {url}", classify_url(url), want)

    # 2. Sitemap parsing: a urlset and a sitemap index.
    urlset = """<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://extramovies.org/</loc><lastmod>2026-10-21T13:51:35.524Z</lastmod></url>
      <url><loc>https://extramovies.org/reviews/joker</loc></url>
    </urlset>"""
    pages, children = parse_sitemap_locs(urlset)
    check("urlset pages", pages, ["https://extramovies.org/", "https://extramovies.org/reviews/joker"])
    check("urlset children", children, [])

    index = """<?xml version="1.0" encoding="UTF-8"?>
    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://extramovies.org/sitemap-a.xml</loc></sitemap>
    </sitemapindex>"""
    pages, children = parse_sitemap_locs(index)
    check("index pages", pages, [])
    check("index children", children, ["https://extramovies.org/sitemap-a.xml"])

    # 3. The known / unknown rule.
    check(
        "known: submitted and indexed",
        known_to_google("PASS", "Submitted and indexed", "SUCCESSFUL"),
        True,
    )
    check(
        "unknown: coverage marker",
        known_to_google("NEUTRAL", "URL is unknown to Google", "PAGE_FETCH_STATE_UNSPECIFIED"),
        False,
    )
    check(
        "unknown: verdict marker",
        known_to_google("URL is unknown to Google", "", ""),
        False,
    )
    check(
        "unknown: empty page fetch",
        known_to_google("NEUTRAL", "Crawled - currently not indexed", "EMPTY"),
        False,
    )
    check(
        "unknown: 404 page fetch",
        known_to_google("FAIL", "Not found", "NOT_FOUND"),
        False,
    )
    check(
        "known: crawled but not indexed is still known",
        known_to_google("NEUTRAL", "Crawled - currently not indexed", "SUCCESSFUL"),
        True,
    )

    # 4. Redirect detection.
    check("redirect: page fetch", is_redirected("Submitted and indexed", "REDIRECTED"), True)
    check("redirect: coverage", is_redirected("Redirected", "SUCCESSFUL"), True)
    check("redirect: none", is_redirected("Submitted and indexed", "SUCCESSFUL"), False)

    # 5. The indexed flag: known to Google is not the same as indexed.
    check("indexed: submitted and indexed", is_indexed("PASS", "Submitted and indexed"), True)
    check(
        "indexed: discovered is known but not indexed",
        is_indexed("NEUTRAL", "Discovered - currently not indexed"),
        False,
    )
    check("indexed: unknown", is_indexed("NEUTRAL", "URL is unknown to Google"), False)

    # 6. The worklist holds every URL that is not indexed, known or not.
    rows = [
        dict(blank_row("https://extramovies.org/"), status="inspected", known_to_google=True, indexed=True),
        dict(blank_row("https://extramovies.org/reviews/joker"), status="inspected", known_to_google=True, indexed=False),
        dict(blank_row("https://extramovies.org/about"), status="inspected", known_to_google=False, indexed=False),
        dict(blank_row("https://extramovies.org/skipped"), status="skipped", known_to_google=False, indexed=False),
    ]
    worklist = group_worklist(rows)
    check(
        "worklist holds both kinds",
        sorted(r["url"] for r in worklist["review"] + worklist["site"]),
        ["https://extramovies.org/about", "https://extramovies.org/reviews/joker"],
    )
    check("worklist skips indexed", worklist["hub"], [])
    check("worklist ignores skipped rows", len(worklist["site"]), 1)

    # 7. CSV rows keep every column and the boolean renders as text.
    row = blank_row("https://extramovies.org/reviews/joker")
    row.update({"status": "inspected", "known_to_google": True, "indexed": False})
    check("row kind", row["kind"], KIND_REVIEW)
    check("row columns", list(row.keys()), CSV_COLUMNS)

    if failures:
        print(f"selftest: {failures} FAILURE(S)", file=sys.stderr)
        raise SystemExit(1)
    print("selftest: OK")


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.selftest:
        cmd_selftest(args)
        return

    if not sys.argv[1:]:
        print("usage: python3 scripts/seo/gsc_index_audit.py [--site <property>] "
              "[--sitemap-url <url>] [--max N] [--delay S] [--out <csv>] [--selftest]")
        print("")
        print("No flags, no work: the sweep needs one flag of your choice, for example")
        print("  python3 scripts/seo/gsc_index_audit.py --max 200")
        return

    print("usage: python3 scripts/seo/gsc_index_audit.py [--site <property>] "
          "[--sitemap-url <url>] [--max N] [--delay S] [--out <csv>] [--selftest]")
    print("")

    limit = max(1, min(args.max, DAILY_QUOTA))
    if args.max > DAILY_QUOTA:
        print(f"note: --max {args.max} is above the {DAILY_QUOTA}/day inspection quota, capped at {DAILY_QUOTA}")

    print(f"reading sitemap: {args.sitemap_url}")
    try:
        urls = collect_sitemap_urls(args.sitemap_url)
    except Exception as exc:
        print(f"ERROR: cannot read the sitemap: {exc}", file=sys.stderr)
        raise SystemExit(1)
    if not urls:
        print("ERROR: the sitemap has no page URLs", file=sys.stderr)
        raise SystemExit(1)
    print(f"  {len(urls)} URLs found")

    inspected = urls[:limit]
    skipped = urls[limit:]

    print(f"inspecting {len(inspected)} URLs (site {args.site}, delay {args.delay}s)")
    token = gsc_api.token(gsc_api.SCOPES[0])

    rows: list[dict] = []
    errors = 0
    for index, url in enumerate(inspected, start=1):
        row = blank_row(url)
        row["status"] = "inspected"
        try:
            row.update(inspect_url(args.site, url, token))
        except urllib.error.HTTPError as exc:
            body = exc.read().decode(errors="replace")[:200]
            row["status"] = "error"
            row["error"] = f"HTTP {exc.code}: {body}"
            errors += 1
            print(f"  [{index}/{len(inspected)}] ERROR {url} -> HTTP {exc.code}", file=sys.stderr)
        except Exception as exc:
            row["status"] = "error"
            row["error"] = f"{type(exc).__name__}: {exc}"
            errors += 1
            print(f"  [{index}/{len(inspected)}] ERROR {url} -> {exc}", file=sys.stderr)
        else:
            state = "known" if row["known_to_google"] else "UNKNOWN"
            print(f"  [{index}/{len(inspected)}] {state:7s} {url}  ({row['coverage_state']})")
        rows.append(row)
        if index < len(inspected) and args.delay > 0:
            time.sleep(args.delay)

    for url in skipped:
        row = blank_row(url)
        row["status"] = "skipped"
        rows.append(row)

    out_path = (
        Path(args.out)
        if args.out
        else REPO_ROOT / "data" / "legacy" / f"gsc-index-audit-{date.today().isoformat()}.csv"
    )
    write_csv(rows, out_path)

    ok_rows = [r for r in rows if r["status"] == "inspected"]
    known = [r for r in ok_rows if r["known_to_google"] is True]
    unknown = [r for r in ok_rows if r["known_to_google"] is not True]
    indexed = [r for r in ok_rows if r["indexed"] is True]
    known_not_indexed = [r for r in known if r["indexed"] is not True]
    redirected = [
        r
        for r in ok_rows
        if is_redirected(r.get("coverage_state", ""), r.get("page_fetch_state", ""))
    ]

    print("")
    print("=== GSC index audit ===")
    print(f"property        : {args.site}")
    print(f"sitemap         : {args.sitemap_url}")
    print(f"urls in sitemap : {len(urls)}")
    print(f"inspected       : {len(inspected)}")
    print(f"skipped         : {len(skipped)} (run cap --max {limit}; daily quota {DAILY_QUOTA}/property)")
    print(f"errors          : {errors}")
    print(f"known to Google : {len(known)}")
    print(f"  indexed       : {len(indexed)}")
    print(f"  known, not indexed: {len(known_not_indexed)}")
    print(f"unknown to Google: {len(unknown)}")
    print(f"redirected      : {len(redirected)}")
    print(f"csv             : {out_path}")

    grouped = group_worklist(rows)
    worklist_size = sum(len(v) for v in grouped.values())
    print("")
    if worklist_size == 0:
        print("Every inspected URL is in Google's index. Nothing to request.")
    else:
        print(f"WORKLIST: {worklist_size} URLs are not in Google's index yet.")
        print("Paste each one into Search Console -> URL Inspection -> Request Indexing:")
        for kind in KIND_ORDER:
            rows_of_kind = grouped.get(kind) or []
            if not rows_of_kind:
                continue
            print("")
            print(f"-- {kind} ({len(rows_of_kind)}) --")
            for row in rows_of_kind:
                print(f"  {row['url']}   [{row.get('coverage_state') or '?'}]")


def run() -> None:
    try:
        main()
    except KeyboardInterrupt:
        print("\ninterrupted", file=sys.stderr)
        raise SystemExit(130)


if __name__ == "__main__":
    run()
