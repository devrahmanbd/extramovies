#!/usr/bin/env python3
"""gsc_sitemap_submit.py — submit the sitemap to Search Console, correctly.

The earlier manual attempt failed with:

    HTTP 400 {"message": "Could not process sitemap 'sitemap.xml'"}

That message is not a broken sitemap. It is the API saying the FEEDPATH it
was given is not a usable sitemap URL. The method is:

    PUT {base}/sites/{siteUrl}/sitemaps/{feedpath}

and for a domain property the feedpath has to be the full sitemap URL
(URL-encoded), not the bare file name. The variants are tried in order and
the first one that succeeds wins:

  1. sc-domain:extramovies.org + "sitemap.xml"          -> 400 (the owner's attempt)
  2. sc-domain:extramovies.org + "https://extramovies.org/sitemap.xml"  -> 204 (works)
  3. sc-domain:extramovies.org + "/sitemap.xml"          -> 400
  4. https://extramovies.org/ + "sitemap.xml"             -> 403 (no URL-prefix property)
  5. https://extramovies.org/ + full sitemap URL          -> 403

Auth is delegated to scripts/seo/gsc_api.py (load_key, mint_token, SCOPES).
The sitemap write needs the full https://www.googleapis.com/auth/webmasters
scope; the read-only scope answers 403 insufficient authentication scopes.

Nothing about the service-account key is written to disk or printed.

Usage:
  python3 scripts/seo/gsc_sitemap_submit.py
  python3 scripts/seo/gsc_sitemap_submit.py --site sc-domain:extramovies.org \\
      --feedpath https://extramovies.org/sitemap.xml
  python3 scripts/seo/gsc_sitemap_submit.py --selftest

Exit codes: 0 a variant worked, 1 no variant worked, 2 usage error.
"""

from __future__ import annotations

import argparse
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

import gsc_api  # noqa: E402  (sibling module, path set above)

DEFAULT_SITE = "sc-domain:extramovies.org"
DEFAULT_SITEMAP = "https://extramovies.org/sitemap.xml"

# Both hosts serve the same webmasters/v3 API. searchconsole.googleapis.com is
# the one the rest of scripts/seo already uses.
API_BASES = [
    "https://searchconsole.googleapis.com/webmasters/v3",
    "https://www.googleapis.com/webmasters/v3",
]

WRITE_SCOPE = gsc_api.SCOPES[-1]  # https://www.googleapis.com/auth/webmasters


def variant_list(site: str, sitemap_url: str) -> list[tuple[str, str, str]]:
    """The (label, siteUrl, feedpath) triples to try, in order."""
    origin = urllib.parse.urlsplit(sitemap_url)
    prefix_site = f"{origin.scheme}://{origin.netloc}/"
    feed_name = origin.path.lstrip("/") or "sitemap.xml"
    return [
        ("domain property + bare feedpath", site, feed_name),
        ("domain property + full sitemap URL", site, sitemap_url),
        ("domain property + path-prefixed feedpath", site, "/" + feed_name),
        ("URL-prefix property + bare feedpath", prefix_site, feed_name),
        ("URL-prefix property + full sitemap URL", prefix_site, sitemap_url),
    ]


def build_url(base: str, site: str, feedpath: str) -> str:
    return (
        f"{base}/sites/{urllib.parse.quote(site, safe='')}"
        f"/sitemaps/{urllib.parse.quote(feedpath, safe='')}"
    )


def submit(base: str, site: str, feedpath: str, token: str, timeout: int = 60) -> tuple[int, str]:
    """One PUT. Returns (http status, response body)."""
    req = urllib.request.Request(
        build_url(base, site, feedpath),
        data=b"",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="PUT",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as exc:
        return 0, f"network error: {exc.reason}"
    except Exception as exc:
        return 0, f"{type(exc).__name__}: {exc}"


def cmd_selftest(_args: argparse.Namespace) -> None:
    """Offline checks: variant order, URL building, response handling."""
    failures = 0

    def check(label: str, got: object, want: object) -> None:
        nonlocal failures
        if got != want:
            failures += 1
            print(f"selftest: FAIL {label} -> {got!r} (want {want!r})", file=sys.stderr)

    variants = variant_list("sc-domain:extramovies.org", "https://extramovies.org/sitemap.xml")
    check("variant count", len(variants), 5)
    check(
        "variant 1",
        variants[0],
        ("domain property + bare feedpath", "sc-domain:extramovies.org", "sitemap.xml"),
    )
    check(
        "variant 2 (the working one)",
        variants[1],
        (
            "domain property + full sitemap URL",
            "sc-domain:extramovies.org",
            "https://extramovies.org/sitemap.xml",
        ),
    )
    check(
        "variant 3",
        variants[2],
        ("domain property + path-prefixed feedpath", "sc-domain:extramovies.org", "/sitemap.xml"),
    )
    check(
        "variant 4",
        variants[3],
        ("URL-prefix property + bare feedpath", "https://extramovies.org/", "sitemap.xml"),
    )

    # The URL the working variant produces.
    check(
        "working URL",
        build_url(
            "https://searchconsole.googleapis.com/webmasters/v3",
            "sc-domain:extramovies.org",
            "https://extramovies.org/sitemap.xml",
        ),
        "https://searchconsole.googleapis.com/webmasters/v3/sites/"
        "sc-domain%3Aextramovies.org/sitemaps/"
        "https%3A%2F%2Fextramovies.org%2Fsitemap.xml",
    )
    # The URL that produced the owner's 400.
    check(
        "failing URL",
        build_url(
            "https://searchconsole.googleapis.com/webmasters/v3",
            "sc-domain:extramovies.org",
            "sitemap.xml",
        ),
        "https://searchconsole.googleapis.com/webmasters/v3/sites/"
        "sc-domain%3Aextramovies.org/sitemaps/sitemap.xml",
    )

    # The write scope is the full webmasters scope, not the read-only one.
    check("write scope is the full scope", WRITE_SCOPE, "https://www.googleapis.com/auth/webmasters")

    if failures:
        print(f"selftest: {failures} FAILURE(S)", file=sys.stderr)
        raise SystemExit(1)
    print("selftest: OK")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="gsc_sitemap_submit.py",
        description="Submit the sitemap to Search Console using the correct feedpath.",
    )
    parser.add_argument("--site", default=DEFAULT_SITE, help=f"GSC property (default: {DEFAULT_SITE})")
    parser.add_argument(
        "--feedpath",
        default=None,
        help="override the feedpath (default: try the known variants in order)",
    )
    parser.add_argument(
        "--sitemap-url",
        default=DEFAULT_SITEMAP,
        help=f"the sitemap URL (default: {DEFAULT_SITEMAP})",
    )
    parser.add_argument("--selftest", action="store_true", help="run the offline checks and exit")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.selftest:
        cmd_selftest(args)
        return

    if not sys.argv[1:]:
        print("usage: python3 scripts/seo/gsc_sitemap_submit.py [--site <property>] "
              "[--feedpath <feedpath>] [--sitemap-url <url>] [--selftest]")
        print("")
        print("No flags, no work. To submit the sitemap, run:")
        print("  python3 scripts/seo/gsc_sitemap_submit.py --site sc-domain:extramovies.org \\")
        print("      --feedpath https://extramovies.org/sitemap.xml")
        return

    print("usage: python3 scripts/seo/gsc_sitemap_submit.py [--site <property>] "
          "[--feedpath <feedpath>] [--sitemap-url <url>] [--selftest]")
    print("")

    if args.feedpath:
        variants = [("owner override", args.site, args.feedpath)]
    else:
        variants = variant_list(args.site, args.sitemap_url)

    key = gsc_api.load_key()
    token, _expires = gsc_api.mint_token(key, WRITE_SCOPE)

    print("=== GSC sitemap submit ===")
    print(f"site        : {args.site}")
    print(f"sitemap url : {args.sitemap_url}")
    print(f"variants    : {len(variants)}")
    print("")

    winner: tuple[str, str, str, str] | None = None
    for label, site, feedpath in variants:
        url = build_url(API_BASES[0], site, feedpath)
        status, body = submit(API_BASES[0], site, feedpath, token)
        print(f"attempt: {label}")
        print(f"  PUT {url}")
        print(f"  HTTP {status} {body.strip() if body.strip() else '(empty body)'}")
        if 200 <= status < 300:
            winner = (label, site, feedpath, url)
            break
        print("")

    print("")
    if winner is None:
        print("No variant worked. The sitemap was not submitted.")
        print("If the 403 says the service account lacks permission, add")
        print(f"{key['client_email']} as a user in Search Console with")
        print("Full permission on the domain property, then run this again.")
        raise SystemExit(1)

    label, site, feedpath, url = winner
    print("=== the variant that worked ===")
    print(f"label    : {label}")
    print(f"site     : {site}")
    print(f"feedpath : {feedpath}")
    print(f"PUT      : {url}")
    print("")
    print("Run this once a month (or after every deploy that changes the sitemap):")
    print(f"  python3 scripts/seo/gsc_sitemap_submit.py --site {site} --feedpath {feedpath}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\ninterrupted", file=sys.stderr)
        raise SystemExit(130)
