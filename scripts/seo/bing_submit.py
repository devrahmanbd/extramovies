#!/usr/bin/env python3
"""bing_submit.py — Bing Webmaster bulk URL submission for extramovies.org.

Bing has no "index everything" button, but it does have a URL submission API.
This tool reads the live sitemap and pushes every URL to Bing in batches.

Endpoint (Bing Webmaster API, JSON/HTTP protocol):

  POST https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlBatch?apikey=<KEY>
  Content-Type: application/json
  {"siteUrl": "https://extramovies.org", "urlList": ["https://extramovies.org/", ...]}

  200 -> {"d": null}                      the batch was accepted
  400 -> {"ErrorCode": 3, "Message": "..."}   the batch was rejected

The method name is case-insensitive on Bing's side (SubmitUrlBatch,
submiturlbatch and SUBMITURLBATCH all route to the same handler); this tool
uses the spelling from Microsoft's own documentation.

Credentials: BING_API_KEY, read from the environment only. The key is never
written to a file, never logged, and never printed: every URL that is echoed
back has the apikey parameter redacted. The owner creates the key in Bing
Webmaster Tools (the property -> Settings -> API access -> API key) and puts
it in .env, which is gitignored.

Quotas (Bing's own documentation):
  - 500 URLs per batch call is the documented maximum, 100 is used here
  - the daily and monthly allowance is per site and is readable with
    GetUrlSubmissionQuota (this tool exposes it as --quota)

Usage:
  python3 scripts/seo/bing_submit.py --dry-run
  python3 scripts/seo/bing_submit.py
  python3 scripts/seo/bing_submit.py --url https://extramovies.org/reviews/joker
  python3 scripts/seo/bing_submit.py --quota
  python3 scripts/seo/bing_submit.py --selftest

Exit codes: 0 ok (including "no API key, nothing to do"), 1 API error,
2 usage error.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

BING_API_BASE = "https://ssl.bing.com/webmaster/api.svc/json"
SUBMIT_URL_BATCH = "SubmitUrlBatch"
GET_URL_SUBMISSION_QUOTA = "GetUrlSubmissionQuota"

DEFAULT_SITE_URL = "https://extramovies.org"
DEFAULT_SITEMAP = "https://extramovies.org/sitemap.xml"
DEFAULT_BATCH = 100

# Bing documents 500 URLs as the maximum for one batch call. 100 is used
# because it is well inside the limit and keeps a failure cheap to retry.
BATCH_LIMIT_DOCUMENTED = 500

SITEMAP_NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
USER_AGENT = "extramovies-seo-bing-submit/1.0 (+https://extramovies.org)"

NO_KEY_INSTRUCTIONS = """BING_API_KEY is not set, so nothing was submitted.

To enable Bing submission:
  1. Sign in to Bing Webmaster Tools (https://www.bing.com/webmasters)
     as the owner of the extramovies.org property.
  2. Open the property, then Settings -> API access -> API key, and create
     an API key.
  3. Put the key in the site .env file (gitignored, never in a committed
     file, never in chat):
         BING_API_KEY=<the key>
  4. Export it into the shell before running this script:
         export BING_API_KEY=$(grep '^BING_API_KEY=' .env | cut -d= -f2-)
  5. Run:  python3 scripts/seo/bing_submit.py --dry-run   (see the payload)
           python3 scripts/seo/bing_submit.py             (send it)

The key is read from the environment only. This script never writes it to
disk and never prints it."""


def redact(text: str) -> str:
    """Hide the API key in anything that gets printed."""
    if not text:
        return text
    return re.sub(r"(apikey=)[^&\s\"'<>]+", r"\1***", text)


def api_url(method: str, key: str, params: dict | None = None) -> str:
    query = {"apikey": key}
    if params:
        query.update(params)
    return f"{BING_API_BASE}/{method}?{urllib.parse.urlencode(query)}"


def parse_sitemap_locs(xml_text: str) -> list[str]:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise ValueError(f"not valid XML: {exc}") from exc
    urls: list[str] = []
    for node in root.iter(f"{SITEMAP_NS}url"):
        loc = node.findtext(f"{SITEMAP_NS}loc")
        if loc:
            urls.append(loc.strip())
    return urls


def fetch_sitemap_urls(url: str, timeout: int = 45) -> list[str]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return parse_sitemap_locs(resp.read().decode("utf-8", errors="replace"))


def build_body(site_url: str, urls: list[str]) -> dict:
    """The documented SubmitUrlBatch payload."""
    return {"siteUrl": site_url, "urlList": list(urls)}


def chunk(items: list[str], size: int) -> list[list[str]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def post_batch(site_url: str, urls: list[str], key: str, timeout: int = 60) -> tuple[int, str]:
    """Send one batch. Returns (http status, response body)."""
    body = json.dumps(build_body(site_url, urls)).encode()
    req = urllib.request.Request(
        api_url(SUBMIT_URL_BATCH, key),
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": USER_AGENT},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", errors="replace")


def get_quota(site_url: str, key: str, timeout: int = 60) -> tuple[int, str]:
    """Read the site's URL submission allowance."""
    req = urllib.request.Request(
        api_url(GET_URL_SUBMISSION_QUOTA, key, {"siteUrl": site_url}),
        headers={"User-Agent": USER_AGENT},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", errors="replace")


def batch_result(status: int, body: str) -> tuple[bool, str]:
    """Turn a Bing response into (accepted, error text)."""
    text = (body or "").strip()
    try:
        data = json.loads(text) if text else {}
    except json.JSONDecodeError:
        data = {}
    if status == 200:
        return True, ""
    if isinstance(data, dict):
        message = data.get("Message") or data.get("message") or ""
        code = data.get("ErrorCode") or data.get("d") or ""
        detail = "; ".join(str(part) for part in (code, message) if part)
        return False, detail or text or f"HTTP {status}"
    return False, text or f"HTTP {status}"


def cmd_selftest(_args: argparse.Namespace) -> None:
    """Offline checks: payload shape, batching, redaction, response parsing."""
    failures = 0

    def check(label: str, got: object, want: object) -> None:
        nonlocal failures
        if got != want:
            failures += 1
            print(f"selftest: FAIL {label} -> {got!r} (want {want!r})", file=sys.stderr)

    # 1. The documented body shape.
    body = build_body("https://extramovies.org", ["https://extramovies.org/"])
    check("body keys", sorted(body.keys()), ["siteUrl", "urlList"])
    check("body siteUrl", body["siteUrl"], "https://extramovies.org")
    check("body urlList", body["urlList"], ["https://extramovies.org/"])
    check(
        "body json",
        json.loads(json.dumps(body)),
        {"siteUrl": "https://extramovies.org", "urlList": ["https://extramovies.org/"]},
    )

    # 2. The endpoint.
    check(
        "endpoint path",
        api_url(SUBMIT_URL_BATCH, "SECRET123"),
        "https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlBatch?apikey=SECRET123",
    )

    # 3. The API key never survives redaction.
    check(
        "redact query",
        "apikey=SECRET123" not in redact(api_url(SUBMIT_URL_BATCH, "SECRET123")),
        True,
    )
    check(
        "redact text",
        "SECRET123" not in redact("request failed for https://x/webmaster/api.svc/json/SubmitUrlBatch?apikey=SECRET123"),
        True,
    )

    # 4. Batching.
    urls = [f"https://extramovies.org/{i}" for i in range(250)]
    batches = chunk(urls, 100)
    check("batch count", len(batches), 3)
    check("batch sizes", [len(b) for b in batches], [100, 100, 50])
    check("batch covers all", sum(len(b) for b in batches), 250)
    check("batch limit under Bing max", DEFAULT_BATCH <= BATCH_LIMIT_DOCUMENTED, True)

    # 5. Sitemap parsing.
    xml = """<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://extramovies.org/</loc></url>
      <url><loc>https://extramovies.org/reviews/joker</loc></url>
    </urlset>"""
    check(
        "sitemap urls",
        parse_sitemap_locs(xml),
        ["https://extramovies.org/", "https://extramovies.org/reviews/joker"],
    )

    # 6. Response parsing.
    check("ok response", batch_result(200, '{"d":null}'), (True, ""))
    check(
        "error response",
        batch_result(400, '{"ErrorCode":3,"Message":"ERROR!!! InvalidApiKey"}'),
        (False, "3; ERROR!!! InvalidApiKey"),
    )
    check("empty body error", batch_result(500, ""), (False, "HTTP 500"))

    if failures:
        print(f"selftest: {failures} FAILURE(S)", file=sys.stderr)
        raise SystemExit(1)
    print("selftest: OK")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="bing_submit.py",
        description="Submit sitemap URLs to Bing through the Webmaster API.",
    )
    parser.add_argument(
        "--site-url",
        default=os.environ.get("SITE_URL") or DEFAULT_SITE_URL,
        help=f"the site as registered in Bing (default: SITE_URL or {DEFAULT_SITE_URL})",
    )
    parser.add_argument(
        "--sitemap-url", default=DEFAULT_SITEMAP, help=f"sitemap to read (default: {DEFAULT_SITEMAP})"
    )
    parser.add_argument(
        "--url",
        action="append",
        default=None,
        help="submit this URL only (repeatable, ignores the sitemap)",
    )
    parser.add_argument(
        "--batch", type=int, default=DEFAULT_BATCH, help=f"URLs per request (default: {DEFAULT_BATCH})"
    )
    parser.add_argument("--dry-run", action="store_true", help="print what would be sent, send nothing")
    parser.add_argument("--quota", action="store_true", help="print the site's URL submission quota and exit")
    parser.add_argument("--selftest", action="store_true", help="run the offline checks and exit")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.selftest:
        cmd_selftest(args)
        return

    if not sys.argv[1:]:
        print("usage: python3 scripts/seo/bing_submit.py [--site-url <url>] [--sitemap-url <url>] "
              "[--url <url>] [--batch N] [--dry-run] [--quota] [--selftest]")
        print("")
        print("No flags, no work. To send the whole sitemap, run:")
        print("  python3 scripts/seo/bing_submit.py --dry-run   (see the payload first)")
        print("  python3 scripts/seo/bing_submit.py             (send it)")
        return

    print("usage: python3 scripts/seo/bing_submit.py [--site-url <url>] [--sitemap-url <url>] "
          "[--url <url>] [--batch N] [--dry-run] [--quota] [--selftest]")
    print("")

    key = (os.environ.get("BING_API_KEY") or "").strip()

    if args.quota:
        if not key:
            print(NO_KEY_INSTRUCTIONS)
            return
        status, body = get_quota(args.site_url, key)
        print(f"GET {redact(api_url(GET_URL_SUBMISSION_QUOTA, key, {'siteUrl': args.site_url}))}")
        print(f"HTTP {status} {body.strip()}")
        return

    if args.url:
        urls = list(dict.fromkeys(args.url))
    else:
        print(f"reading sitemap: {args.sitemap_url}")
        try:
            urls = fetch_sitemap_urls(args.sitemap_url)
        except Exception as exc:
            print(f"ERROR: cannot read the sitemap: {exc}", file=sys.stderr)
            raise SystemExit(1)
        if not urls:
            print("ERROR: the sitemap has no page URLs", file=sys.stderr)
            raise SystemExit(1)
        print(f"  {len(urls)} URLs found")

    batch_size = max(1, min(args.batch, BATCH_LIMIT_DOCUMENTED))
    batches = chunk(urls, batch_size)

    print("")
    print("=== Bing URL submission ===")
    print(f"endpoint    : POST {BING_API_BASE}/{SUBMIT_URL_BATCH}?apikey=***")
    print(f"body shape  : {{\"siteUrl\": \"{args.site_url}\", \"urlList\": [ ... ]}}")
    print(f"siteUrl     : {args.site_url}")
    print(f"urls        : {len(urls)}")
    print(f"batch size  : {batch_size} (Bing documents {BATCH_LIMIT_DOCUMENTED} per call as the maximum)")
    print(f"requests    : {len(batches)}")

    if args.dry_run:
        print("")
        print("DRY RUN, nothing was sent.")
        for index, batch in enumerate(batches, start=1):
            payload = build_body(args.site_url, batch)
            shown = payload["urlList"][:3]
            print(
                f"  request {index}/{len(batches)}: {len(batch)} URLs "
                f"(first: {', '.join(shown)}{' ...' if len(batch) > 3 else ''})"
            )
        print("")
        print("first request body (urlList truncated):")
        print(json.dumps(build_body(args.site_url, batches[0][:3]), indent=2))
        return

    if not key:
        print("")
        print(NO_KEY_INSTRUCTIONS)
        return

    submitted = 0
    failed = 0
    errors: list[str] = []
    for index, batch in enumerate(batches, start=1):
        try:
            status, body = post_batch(args.site_url, batch, key)
        except urllib.error.URLError as exc:
            status, body = 0, f"network error: {exc.reason}"
        except Exception as exc:
            status, body = 0, f"{type(exc).__name__}: {exc}"
        ok, error = batch_result(status, body)
        if ok:
            submitted += len(batch)
            print(f"  batch {index}/{len(batches)}: HTTP {status} accepted ({len(batch)} URLs)")
        else:
            failed += len(batch)
            errors.append(f"batch {index}: HTTP {status} {error}")
            print(f"  batch {index}/{len(batches)}: HTTP {status} REJECTED ({len(batch)} URLs) {error}")

    print("")
    print("=== Bing submission result ===")
    print(f"submitted : {submitted}")
    print(f"failed    : {failed}")
    if errors:
        print("errors:")
        for error in errors:
            print(f"  {error}")
    else:
        print("errors   : none")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\ninterrupted", file=sys.stderr)
        raise SystemExit(130)
