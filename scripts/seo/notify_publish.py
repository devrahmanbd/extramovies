#!/usr/bin/env python3
"""notify_publish.py — tell the search engines a URL just went live.

One command, two channels:

  1. IndexNow -> Bing, Yandex, Seznam.  HTTP 204/200 means "look at these
     URLs now".  This is the only same-day channel we have, and it is the
     one that matters for a film whose demand window is 72 hours.
  2. Search Console sitemap re-submit -> the sanctioned way to tell Google
     the sitemap changed.  No reCAPTCHA, no UI click, no daily quota per
     URL; the service account already has the full webmasters scope.

WHAT THIS IS NOT: a Google index request.  Google has no API for asking it
to crawl an article, and the UI's "Request indexing" is refused for
automated browsers (see docs/seo/gsc-index-worklist-2026-10-22.md).  A
sitemap re-submit puts the new URL in front of Google's normal crawl queue
so it can be picked up on the next pass, typically days, not minutes.

Usage:
  python3 scripts/seo/notify_publish.py --url https://extramovies.org/reviews/x-2026-review
  python3 scripts/seo/notify_publish.py --url a --url b
  python3 scripts/seo/notify_publish.py --all-sitemap-urls
  python3 scripts/seo/notify_publish.py --skip-gsc      # IndexNow only
  python3 scripts/seo/notify_publish.py --skip-indexnow  # sitemap only
  python3 scripts/seo/notify_publish.py --dry           # report, change nothing

Auth: the IndexNow key is public by protocol (public/<key>.txt).  GSC
delegates to scripts/seo/gsc_api.py, which reads the service-account key
from $GSC_SA_KEY or ~/.config/gsc-sa/extramovies-gsc-reader.json.  Nothing
secret is printed or written to disk.

Exit codes: 0 both channels succeeded (or were skipped), 1 a channel failed,
2 usage error.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITEMAP = "https://extramovies.org/sitemap.xml"
SITE_HOST = "extramovies.org"
PROPERTY = "sc-domain:extramovies.org"
REPO = HERE.parent.parent


def repo_indexnow_key() -> str:
    """Key served from public/<key>.txt — public by design, never secret."""
    env = os.environ.get("INDEXNOW_KEY", "").strip()
    if env:
        return env
    txt = sorted(REPO.joinpath("public").glob("*.txt"))
    if txt:
        return txt[0].stem
    raise SystemExit("no IndexNow key file in public/ and no INDEXNOW_KEY set")


def sitemap_urls() -> list[str]:
    body = urllib.request.urlopen(SITEMAP, timeout=30).read().decode("utf-8", "ignore")
    return re.findall(r"<loc>([^<]+)</loc>", body)


def ping_indexnow(urls: list[str], key: str, dry: bool) -> tuple[bool, str]:
    payload = json.dumps(
        {
            "host": SITE_HOST,
            "key": key,
            "keyLocation": f"https://{SITE_HOST}/{key}.txt",
            "urlList": urls,
        }
    ).encode()
    if dry:
        return True, f"dry run: would ping {len(urls)} URLs"
    req = urllib.request.Request(
        "https://api.indexnow.org/indexnow",
        data=payload,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return True, f"HTTP {r.status} for {len(urls)} URLs"
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code} {e.reason}"
    except Exception as e:  # network failure: report, never raise
        return False, f"{type(e).__name__}: {e}"


def resubmit_sitemap(dry: bool) -> tuple[bool, str]:
    if dry:
        return True, "dry run: would re-submit the sitemap to Search Console"
    sys.path.insert(0, str(HERE))
    try:
        import gsc_sitemap_submit  # type: ignore
    except Exception as e:
        return False, f"cannot import gsc_sitemap_submit: {e}"
    argv = ["gsc_sitemap_submit.py", "--site", PROPERTY, "--feedpath", SITEMAP]
    saved = sys.argv
    try:
        sys.argv = argv
        gsc_sitemap_submit.main()  # raises SystemExit(1) if no variant worked
    except SystemExit as e:
        return (e.code in (None, 0)), ("accepted" if e.code in (None, 0) else f"exit {e.code}")
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"
    finally:
        sys.argv = saved
    return True, "accepted"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", action="append", default=[], help="changed URL (repeatable)")
    ap.add_argument("--urls-file", help="file with one URL per line")
    ap.add_argument("--all-sitemap-urls", action="store_true", help="ping every sitemap URL")
    ap.add_argument("--skip-indexnow", action="store_true", help="do not ping IndexNow")
    ap.add_argument("--skip-gsc", action="store_true", help="do not re-submit the sitemap")
    ap.add_argument("--dry", action="store_true", help="report what would happen")
    args = ap.parse_args(argv)

    urls = list(args.url)
    if args.urls_file:
        urls += [
            line.strip()
            for line in Path(args.urls_file).read_text().splitlines()
            if line.strip().startswith("http")
        ]
    if args.all_sitemap_urls:
        urls += sitemap_urls()

    # de-duplicate, keep order
    seen: dict[str, None] = {}
    for u in urls:
        seen.setdefault(u.rstrip("/"), None)
    urls = list(seen)

    if not urls and not args.skip_indexnow:
        ap.error("give --url, --urls-file, --all-sitemap-urls, or --skip-indexnow")

    ok = True
    if not args.skip_indexnow:
        good, detail = ping_indexnow(urls, repo_indexnow_key(), args.dry)
        ok &= good
        print(f"IndexNow   {'OK  ' if good else 'FAIL'}  {detail}")

    if not args.skip_gsc:
        good, detail = resubmit_sitemap(args.dry)
        ok &= good
        print(f"GSC sitemap {'OK  ' if good else 'FAIL'}  {detail}")

    if urls:
        print(f"{len(urls)} URL(s) in the IndexNow batch:")
        for u in urls:
            print(f"  {u}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
