#!/usr/bin/env python3
"""gsc_snapshot.py — monthly Search Console snapshot + legacy equity queue.

Turns the Search Console API into one repeatable monthly artifact pair, so the
authority-claim loop (docs/superpowers/specs/2026-10-19-authority-claim-cwv.md,
Part A) runs from a single command instead of five manual exports:

  1. docs/seo/baseline-gsc-<YYYY-MM-DD>.json  (COMMITTED)  — the monthly snapshot
  2. data/legacy/gsc_inspect_queue.csv         (gitignored) — the legacy queue

Auth is delegated to scripts/seo/gsc_api.py (key loading, JWT signing, scope
escalation, api_request). Everything below is stdlib-only logic of our own.

Every `page` row is classified MODERN or LEGACY, in this fixed order:

  1. `^/(movies|series)/[0-9]+$` is MODERN - an unambiguous numeric id on a real
     route (/movies/2016, /series/2000 are tmdb ids, not dates).
  2. A LEGACY rule wins over everything else: a `*.php` file, a legacy
     category prefix (18-movies/, web-series/, 300mb-movies/), `feed/`,
     `page/N/`, a LEADING year segment (/2016/05/12/...,
     /2016/he-said-she-said-1991-720p/), a numeric page, or a non-numeric id
     under /movies/ or /series/. The dated rule matches a leading year
     segment only, so a year inside a slug or a tmdb id is never a date.
  3. The site's own route set (src/pages) is MODERN: /, /reviews, /movies,
     /reviews/<slug>, /series/<id>, and the rest of the live routes.
  4. Anything else is LEGACY with a reason - never silently modern.

The service account (extramovies-gsc-reader@hsc2025.iam.gserviceaccount.com)
is not yet a member of the GSC property, so every live call currently sees an
empty site list. Until it is added, the tool prints the exact UI steps to add
the account, writes NO snapshot (an empty baseline would be a trap for the
next --against) and exits 3 — never a crash, never a green "0" while
collecting nothing.

Usage:
  python3 scripts/seo/gsc_snapshot.py [--site sc-domain:extramovies.org] \\
      [--days 28] [--against <snapshot.json>] [--out <file>] \\
      [--inspect-top N] [--no-inspect] [--selftest]

Exit codes: 0 ok | 1 regression (clicks/impressions down > 20%) | 2 usage error
             | 3 nothing compared (skipped run, property mismatch, window
             mismatch).
"""

from __future__ import annotations

import argparse
import contextlib
import csv
import io
import json
import re
import sys
import tempfile
import threading
import urllib.parse
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

import gsc_api  # noqa: E402  (sibling module, path set above)

REPO_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_SITE = "sc-domain:extramovies.org"
DEFAULT_DAYS = 28
DEFAULT_INSPECT_TOP = 20

# Search Console data is only final ~2 days back; the window ends there.
DATA_LAG_DAYS = 2
# The long page window: what the legacy corpus still earns over a quarter.
LONG_WINDOW_DAYS = 90

QUEUE_MAX_ROWS = 500
MAX_INSPECT_CALLS = 100
LEGACY_TOP_N = 50
REGRESSION_THRESHOLD = 0.20

# Search Analytics row limits (the API caps a single query at 25k rows).
PAGE_ROW_LIMIT = 25000
QUERY_ROW_LIMIT = 5000
DATE_ROW_LIMIT = 500

DEFAULT_API_BASE = "https://searchconsole.googleapis.com/webmasters/v3"
SA_EMAIL = "extramovies-gsc-reader@hsc2025.iam.gserviceaccount.com"
GSC_SETTINGS_URL = "https://search.google.com/search-console/settings"

QUEUE_COLUMNS = [
    "legacy_path",
    "clicks",
    "impressions",
    "ctr",
    "position",
    "action",
]

# --- route knowledge --------------------------------------------------------

# The brief's explicit MODERN list. The repo's own route set (src/pages) is
# unioned on top of these, so a new page is modern the moment it is added.
MODERN_EXACT = {"/", "/reviews", "/movies"}
MODERN_PATTERNS = (
    re.compile(r"^/reviews/[^/]+$"),
    re.compile(r"^/movies/[^/]+$"),
    re.compile(r"^/series/[^/]+$"),
)

# Legacy category prefixes seen in the corpus (18-movies/, 300mb-movies/,
# web-series/, ...). The bare "movies" / "movie" / "tv" / "series" names are
# deliberately NOT here: they collide with the site's own modern routes
# (/movies, /series/<id>), and a non-numeric id under those is caught by the
# numeric-id rule below instead.
LEGACY_CATEGORY_RE = re.compile(r"^\d+(?:mb)?-movies$")
LEGACY_CATEGORY_SEGMENTS = {
    "web-series",
    "webseries",
    "tv-shows",
    "dual-audio-movies",
    "hindi-dubbed-movies",
    "south-movies",
    "punjabi-movies",
    "hindi-movies",
    "bollywood-movies",
    "hollywood-movies",
    "adult-movies",
}
PAGINATION_RE = re.compile(r"^page/(\d+)$")
YEAR_RE = re.compile(r"^(19|20)\d{2}$")
NUMERIC_RE = re.compile(r"^\d+$")

# The live routes are /movies/<tmdbId> and /series/<tmdbId>: the id is a
# number. Anything else under those prefixes is a legacy URL.
ID_ROUTE_RE = re.compile(r"^/(movies|series)/([^/]+)$")
# ASCII digits only (str.isdigit() also accepts unicode digits).
NUMERIC_ID_RE = re.compile(r"^[0-9]+$")

# Routes that exist but must never be indexed (still MODERN, but flagged).
NON_INDEXABLE_NOTES = {
    "api": "api route",
    "admin": "admin route",
    "setup": "setup route",
    "login": "noindex route",
    "signup": "noindex route",
}


def log(message: str) -> None:
    print(message)


def warn(message: str) -> None:
    print(message, file=sys.stderr)


def repo_root() -> Path:
    return REPO_ROOT


def route_set(root: Path | None = None) -> list[tuple[re.Pattern, str]]:
    """The site's own route set, derived from src/pages (fail-soft).

    Returns (pattern, note) pairs. `note` is non-empty for routes that exist
    but are not indexable (api/admin/setup/login/signup) so an indexed API URL
    is visible in the snapshot instead of hiding as a modern page.
    """
    root = root or repo_root()
    pages = root / "src" / "pages"
    found: list[tuple[re.Pattern, str]] = []
    if pages.is_dir():
        for path in sorted(pages.rglob("*")):
            if not path.is_file():
                continue
            rel = path.relative_to(pages).as_posix()
            rel = re.sub(r"\.(astro|tsx?|jsx?|mdx?)$", "", rel)
            parts = [p for p in rel.split("/") if p]
            if not parts:
                continue
            if parts[-1] == "index":
                parts = parts[:-1]
            segments = []
            for part in parts:
                if re.fullmatch(r"\[\.\.\.[^\]]+\]", part):
                    segments.append(".+")
                elif part.startswith("[") and part.endswith("]"):
                    segments.append("[^/]+")
                else:
                    segments.append(re.escape(part))
            pattern = "^/" + "/".join(segments) + "$"
            note = NON_INDEXABLE_NOTES.get(parts[0].lower(), "") if parts else ""
            found.append((re.compile(pattern), note))
    return found


def is_legacy_category(segment: str) -> bool:
    """True for a legacy WordPress category segment (18-movies, web-series...)."""
    value = segment.lower()
    return bool(LEGACY_CATEGORY_RE.match(value)) or value in LEGACY_CATEGORY_SEGMENTS


def legacy_reason(path: str) -> str:
    """Why a path is legacy, or "" when no legacy rule matches it.

    These rules take precedence over the modern route set: a legacy shape
    stays legacy even when it sits under a modern prefix (/movies/9xplay.php,
    /reviews/18-movies/x). The dated rule matches a LEADING year segment
    only - that is how the legacy corpus is shaped (/2016/05/12/...,
    /2016/he-said-she-said-1991-720p/) - so a later year segment (a year
    inside a slug, a year inside a tmdb id) is never mistaken for a date.
    """
    parts = [p for p in path.split("/") if p]
    if not parts:
        return ""
    lowered = [p.lower() for p in parts]
    if any(p.endswith(".php") for p in lowered):
        return "php-endpoint"
    if any(is_legacy_category(p) for p in lowered):
        return "category-prefix"
    for index in range(len(lowered) - 1):
        if PAGINATION_RE.match(f"{lowered[index]}/{lowered[index + 1]}"):
            return "pagination"
    if lowered[0] in ("feed", "comment", "comments") or lowered[-1] in (
        "feed",
        "comment",
        "comments",
    ):
        return "feed"
    id_match = ID_ROUTE_RE.match(path)
    if id_match and not NUMERIC_ID_RE.match(id_match.group(2)):
        return "non-numeric-id"
    if YEAR_RE.match(parts[0]):
        return "dated-path"
    if len(parts) == 1 and NUMERIC_RE.match(parts[0]):
        return "numeric-page"
    return ""


def normalize_path(raw: str) -> str:
    """Path (+ query) of a page key, without scheme/host."""
    value = (raw or "").strip()
    if "://" in value:
        parsed = urllib.parse.urlparse(value)
        value = parsed.path or "/"
        if parsed.query:
            value = f"{value}?{parsed.query}"
    if not value.startswith("/"):
        value = "/" + value
    return value


def classify_path(raw: str, routes: list[tuple[re.Pattern, str]]) -> tuple[str, str]:
    """Return (classification, reason) for one page key.

    The order is fixed:

    1. ``^/(movies|series)/[0-9]+$`` is MODERN - an unambiguous numeric id on a
       real route (/movies/2016, /series/2000 are tmdb ids, not dates).
    2. A LEGACY rule wins over everything else: a ``.php`` file, a category
       prefix, ``feed/``, ``page/N/``, a leading year segment, or a
       non-numeric id under /movies/ or /series/.
    3. The site's own route set (/, /reviews, /movies, /reviews/<slug>, ...)
       is MODERN.
    4. Anything else is LEGACY with a reason - never silently modern.
    """
    clean = normalize_path(raw).split("#", 1)[0].split("?", 1)[0]
    if not clean:
        clean = "/"
    if len(clean) > 1:
        clean = clean.rstrip("/")

    # 1. an unambiguous numeric id on a real route
    id_match = ID_ROUTE_RE.match(clean)
    if id_match and NUMERIC_ID_RE.match(id_match.group(2)):
        return "modern", ""

    # 2. legacy shapes win over the modern route set
    reason = legacy_reason(clean)
    if reason:
        return "legacy", reason

    # 3. the site's own route set
    for pattern, note in routes:
        if pattern.match(clean):
            return "modern", note
    if clean in MODERN_EXACT:
        return "modern", ""
    for pattern in MODERN_PATTERNS:
        if pattern.match(clean):
            return "modern", ""

    # 4. unknown -> legacy, never silently modern
    return "legacy", "not-in-route-set"


# --- api layer --------------------------------------------------------------


def _quote(value: str) -> str:
    return urllib.parse.quote(value, safe="")


def site_origin(site: str) -> str:
    """The public origin of a property (inspection URLs are absolute)."""
    value = (site or "").strip()
    if value.startswith("sc-domain:"):
        return "https://" + value[len("sc-domain:") :].strip("/")
    match = re.match(r"^(https?://[^/]+)", value)
    if match:
        return match.group(1)
    return "https://" + value.strip("/")


def property_host(site: str) -> str:
    """Comparable HOST for a property ('sc-domain:' / scheme / www / path off).

    Used only to find the property in the visible site list: the operator may
    type either form. It is NOT the identity used to compare two snapshots.
    """
    value = (site or "").strip().lower()
    if value.startswith("sc-domain:"):
        value = value[len("sc-domain:") :]
    value = re.sub(r"^https?://", "", value)
    value = value.split("/")[0]
    if value.startswith("www."):
        value = value[4:]
    return value


def property_identity(site: str) -> str:
    """Strict identity of a GSC property.

    A domain property and a URL-prefix property are DIFFERENT properties, even
    on the same host: sc-domain:extramovies.org and https://extramovies.org/
    must never be compared against each other.
    """
    value = (site or "").strip().lower()
    if value.startswith("sc-domain:"):
        return "domain:" + value[len("sc-domain:") :].strip("/")
    if "://" in value:
        parsed = urllib.parse.urlparse(value)
        path = parsed.path.rstrip("/")
        return f"prefix:{parsed.scheme}://{parsed.netloc}{path}"
    return "domain:" + value.strip("/")


def site_label(site: str) -> str:
    """A human label for a property (used in messages)."""
    value = (site or "").strip()
    if value.startswith("sc-domain:"):
        return value[len("sc-domain:") :].strip("/")
    match = re.match(r"^https?://([^/]+)", value)
    if match:
        return match.group(1)
    return value.strip("/")


def list_sites() -> list[dict]:
    data = gsc_api.api_request(f"{gsc_api.API}/sites")
    if not isinstance(data, dict):
        return []
    return list(data.get("siteEntry") or [])


def resolve_property(site: str) -> tuple[str | None, list[dict]]:
    """Resolve the requested property against the visible site list.

    Returns (visible_site_url, entries). `visible_site_url` is None when the
    credential cannot see the property (the current real state).
    """
    entries = list_sites()
    target = property_host(site)
    for entry in entries:
        url = str(entry.get("siteUrl") or "")
        if property_host(url) == target:
            return url, entries
    return None, entries


def fetch_sitemaps(site: str) -> list[dict]:
    # The list lives under the site resource; /webmasters/v3/sitemaps/{site}
    # 404s for a domain property.
    data = gsc_api.api_request(f"{gsc_api.API}/sites/{_quote(site)}/sitemaps")
    rows = []
    for row in (data or {}).get("sitemap") or []:
        rows.append(
            {
                "path": row.get("path") or "",
                "lastSubmitted": row.get("lastSubmitted") or "",
                "isPending": bool(row.get("isPending")),
                "errors": row.get("errors") or "",
                "warnings": row.get("warnings") or "",
            }
        )
    rows.sort(key=lambda row: row["path"])
    return rows


def _metrics(row: dict) -> dict:
    def num(key: str) -> float:
        try:
            return float(row.get(key) or 0)
        except (TypeError, ValueError):
            return 0.0

    return {
        "clicks": int(num("clicks")),
        "impressions": int(num("impressions")),
        "ctr": round(num("ctr"), 6),
        "position": round(num("position"), 2),
    }


def search_analytics(
    site: str, dimensions: list[str], start: str, end: str, row_limit: int
) -> list[dict]:
    body = {
        "siteUrl": site,
        "dimensions": list(dimensions),
        "startDate": start,
        "endDate": end,
        "rowLimit": row_limit,
    }
    data = gsc_api.api_request(
        f"{gsc_api.API}/sites/{_quote(site)}/searchAnalytics/query", "POST", body
    )
    return list((data or {}).get("rows") or [])


def page_rows(
    site: str, routes: list[tuple[re.Pattern, str]], start: str, end: str, row_limit: int
) -> list[dict]:
    """Page-dimension rows, classified and sorted by impressions desc."""
    origin = site_origin(site)
    rows = []
    for raw in search_analytics(site, ["page"], start, end, row_limit):
        keys = raw.get("keys") or []
        path = normalize_path(str(keys[0]) if keys else "/")
        metrics = _metrics(raw)
        classification, reason = classify_path(path, routes)
        row = {"path": path, "url": origin + path}
        row.update(metrics)
        row["classification"] = classification
        row["reason"] = reason
        rows.append(row)
    rows.sort(key=lambda row: (-row["impressions"], row["path"]))
    return rows


def query_rows(site: str, start: str, end: str, row_limit: int) -> list[dict]:
    rows = []
    for raw in search_analytics(site, ["query"], start, end, row_limit):
        keys = raw.get("keys") or []
        row = {"query": str(keys[0]) if keys else ""}
        row.update(_metrics(raw))
        rows.append(row)
    rows.sort(key=lambda row: (-row["impressions"], row["query"]))
    return rows


def date_rows(site: str, start: str, end: str, row_limit: int) -> list[dict]:
    rows = []
    for raw in search_analytics(site, ["date"], start, end, row_limit):
        keys = raw.get("keys") or []
        row = {"date": str(keys[0]) if keys else ""}
        row.update(_metrics(raw))
        rows.append(row)
    rows.sort(key=lambda row: row["date"])
    return rows


def inspect_url(site: str, url: str) -> dict:
    """urlInspection.index.inspect for one absolute URL."""
    body = {"siteUrl": site, "inspectionUrl": url, "languageCode": "en-US"}
    data = gsc_api.api_request(
        f"{gsc_api.INSPECT_API}/urlInspection/index:inspect", "POST", body
    )
    index = ((data or {}).get("inspectionResult") or {}).get("indexStatusResult") or {}
    crawled = list(index.get("crawledAs") or [])
    chain = " -> ".join(
        f"{c.get('responseCode', '?')} {c.get('url', '')}".strip() for c in crawled
    )
    coverage = str(index.get("coverageState") or "")
    return {
        "url": url,
        "verdict": str(index.get("verdict") or ""),
        "coverageState": coverage,
        "googleCanonical": str(index.get("googleCanonical") or ""),
        "userCanonical": str(index.get("userCanonical") or ""),
        "robotsTxtState": str(index.get("robotsTxtState") or ""),
        "lastCrawlTime": str(index.get("lastCrawlTime") or ""),
        "crawledAs": crawled,
        "chain": chain or "200 (direct)",
        "soft404": bool(re.search(r"not found|soft\s*404", coverage, re.I)),
    }


# --- capture ----------------------------------------------------------------


def window(days: int, today: date) -> tuple[str, str]:
    """(startDate, endDate) for a window of `days` final days."""
    end = today - timedelta(days=DATA_LAG_DAYS)
    start = end - timedelta(days=days - 1)
    return start.isoformat(), end.isoformat()


def skipped_snapshot(site: str, days: int, reason: str) -> dict:
    """A snapshot that records WHY there is no data (never a crash)."""
    return {
        "status": "skipped",
        "reason": reason,
        "date": date.today().isoformat(),
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "site": site,
        "days": days,
        "sitemaps": [],
        "totals": {"clicks": 0, "impressions": 0},
        "pages": [],
        "queries": [],
        "byDate": [],
        "legacy": {"count": 0, "top": []},
        "pagesLongWindow": [],
        "queue": {"rows": 0, "dropped": 0, "capped": False, "path": ""},
        "inspect": {"requested": 0, "inspected": 0, "cap": MAX_INSPECT_CALLS, "results": []},
    }


def legacy_universe(
    pages: list[dict], pages_long: list[dict]
) -> dict[str, dict]:
    """Legacy paths seen in either window, keyed by path.

    A path present in the primary window keeps the primary window's metrics;
    a path only seen in the long window keeps the long window's metrics (it is
    still earning traffic over the quarter, so it still belongs in the queue).
    """
    universe: dict[str, dict] = {}
    for row in pages:
        if row.get("classification") == "legacy":
            universe[row["path"]] = row
    for row in pages_long:
        if row.get("classification") == "legacy" and row["path"] not in universe:
            universe[row["path"]] = row
    return universe


def build_queue(universe: dict[str, dict]) -> list[dict]:
    """Queue rows, ordered by impressions desc (path asc breaks ties)."""
    rows = sorted(
        universe.values(), key=lambda row: (-row["impressions"], row["path"])
    )
    queue = []
    for row in rows:
        queue.append(
            {
                "legacy_path": row["path"],
                "clicks": row["clicks"],
                "impressions": row["impressions"],
                "ctr": row["ctr"],
                "position": row["position"],
                "action": "validate-fix" if row["impressions"] > 0 else "monitor",
            }
        )
    return queue


def capture(
    site: str,
    days: int,
    routes: list[tuple[re.Pattern, str]],
    today: date | None = None,
) -> tuple[dict, str | None]:
    """Capture one snapshot.

    Returns (snapshot, skip_reason). skip_reason is None on success.
    """
    today = today or date.today()
    start, end = window(days, today)

    sitemaps = fetch_sitemaps(site)
    pages = page_rows(site, routes, start, end, PAGE_ROW_LIMIT)
    queries = query_rows(site, start, end, QUERY_ROW_LIMIT)
    by_date = date_rows(site, start, end, DATE_ROW_LIMIT)

    pages_long: list[dict] = []
    if days < LONG_WINDOW_DAYS:
        long_start, long_end = window(LONG_WINDOW_DAYS, today)
        pages_long = page_rows(site, routes, long_start, long_end, PAGE_ROW_LIMIT)

    universe = legacy_universe(pages, pages_long)

    totals = {
        "clicks": sum(row["clicks"] for row in pages),
        "impressions": sum(row["impressions"] for row in pages),
    }

    legacy_rows = sorted(
        universe.values(), key=lambda row: (-row["impressions"], row["path"])
    )
    legacy = {
        "count": len(legacy_rows),
        "top": [
            {
                "path": row["path"],
                "clicks": row["clicks"],
                "impressions": row["impressions"],
            }
            for row in legacy_rows[:LEGACY_TOP_N]
        ],
    }

    snapshot = {
        "status": "ok",
        "reason": "",
        "date": today.isoformat(),
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "site": site,
        "days": days,
        "sitemaps": sitemaps,
        "totals": totals,
        "pages": pages,
        "queries": queries,
        "byDate": by_date,
        "legacy": legacy,
        "pagesLongWindow": pages_long,
        "queue": {"rows": 0, "dropped": 0, "capped": False, "path": ""},
        "inspect": {"requested": 0, "inspected": 0, "cap": MAX_INSPECT_CALLS, "results": []},
    }
    return snapshot, None


def run_inspections(
    site: str, snapshot: dict, inspect_top: int
) -> tuple[int, list[dict], int]:
    """Inspect the top N legacy paths of the queue.

    Returns (inspected, results, cap).
    """
    cap = min(inspect_top, MAX_INSPECT_CALLS)
    results: list[dict] = []
    if cap <= 0:
        return 0, results, MAX_INSPECT_CALLS
    universe = legacy_universe(snapshot.get("pages") or [], snapshot.get("pagesLongWindow") or [])
    queue = build_queue(universe)
    for row in queue[:cap]:
        url = site_origin(site) + row["legacy_path"]
        try:
            results.append(inspect_url(site, url))
        except SystemExit as exc:
            warn(f"gsc_snapshot: inspection failed for {url}: {exc}")
            results.append({"url": url, "error": str(exc)})
    return len(results), results, MAX_INSPECT_CALLS


def write_snapshot(path: Path, snapshot: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(snapshot, indent=2, sort_keys=False) + "\n", encoding="utf-8"
    )


def write_queue(path: Path, queue: list[dict]) -> tuple[int, int]:
    """Write the queue CSV. Returns (rows written, rows dropped)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    kept = queue[:QUEUE_MAX_ROWS]
    dropped = len(queue) - len(kept)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(QUEUE_COLUMNS)
        for row in kept:
            writer.writerow([row[column] for column in QUEUE_COLUMNS])
    return len(kept), dropped


# --- diff -------------------------------------------------------------------


def _delta(before: int, after: int) -> str:
    change = after - before
    if change > 0:
        return f"+{change}"
    return str(change)


def _drop_pct(before: int, after: int) -> float:
    if before <= 0:
        return 0.0
    return (before - after) / before


def diff_snapshots(baseline: dict, current: dict) -> dict:
    """Compare two snapshots.

    Returns {"lines": [...], "regressed": bool, "summary": str,
             "mismatch": bool}. `regressed` is True when total clicks or total
    impressions dropped by more than REGRESSION_THRESHOLD. `mismatch` is True
    when the two snapshots are not like-for-like (different property identity,
    different window length, or a side with no data) — then nothing is
    compared at all, so a 90-day baseline can never fire a false regression
    against a 28-day run.
    """
    lines: list[str] = []

    if baseline.get("status") != "ok" or current.get("status") != "ok":
        lines.append(
            "  note: one side has no data (status="
            f"{baseline.get('status', '?')} vs {current.get('status', '?')})"
            " - nothing compared"
        )
        return {
            "lines": lines,
            "regressed": False,
            "summary": "nothing to compare (one side has no data)",
            "mismatch": True,
        }

    base_identity = property_identity(str(baseline.get("site") or ""))
    cur_identity = property_identity(str(current.get("site") or ""))
    if base_identity != cur_identity:
        lines.append(
            f"  property mismatch: baseline {baseline.get('site')}"
            f" [{base_identity}] vs current {current.get('site')}"
            f" [{cur_identity}] - nothing compared"
        )
        return {
            "lines": lines,
            "regressed": False,
            "summary": "property mismatch",
            "mismatch": True,
        }

    if baseline.get("days") != current.get("days"):
        lines.append(
            f"  window mismatch: baseline {baseline.get('days')}d vs current"
            f" {current.get('days')}d - nothing compared"
        )
        return {
            "lines": lines,
            "regressed": False,
            "summary": "window mismatch",
            "mismatch": True,
        }

    base_totals = baseline.get("totals") or {}
    cur_totals = current.get("totals") or {}
    base_clicks = int(base_totals.get("clicks") or 0)
    base_impressions = int(base_totals.get("impressions") or 0)
    cur_clicks = int(cur_totals.get("clicks") or 0)
    cur_impressions = int(cur_totals.get("impressions") or 0)

    clicks_drop = _drop_pct(base_clicks, cur_clicks)
    impressions_drop = _drop_pct(base_impressions, cur_impressions)

    lines.append(
        f"  totals: clicks {base_clicks} -> {cur_clicks}"
        f" ({_delta(base_clicks, cur_clicks)}, -{clicks_drop * 100:.1f}%)"
        f"   impressions {base_impressions} -> {cur_impressions}"
        f" ({_delta(base_impressions, cur_impressions)}, -{impressions_drop * 100:.1f}%)"
    )

    base_pages = {row["path"]: row for row in (baseline.get("pages") or [])}
    cur_pages = {row["path"]: row for row in (current.get("pages") or [])}
    lines.append(f"  pages ({len(cur_pages)} in this run):")
    for path in sorted(cur_pages, key=lambda p: (-cur_pages[p]["impressions"], p)):
        row = cur_pages[path]
        before = base_pages.get(path)
        if before is None:
            lines.append(
                f"    {path}  clicks +{row['clicks']}  impressions +{row['impressions']}  (new)"
            )
            continue
        lines.append(
            f"    {path}  clicks {before['clicks']} -> {row['clicks']}"
            f" ({_delta(before['clicks'], row['clicks'])})"
            f"  impressions {before['impressions']} -> {row['impressions']}"
            f" ({_delta(before['impressions'], row['impressions'])})"
        )
    for path in sorted(set(base_pages) - set(cur_pages)):
        before = base_pages[path]
        lines.append(
            f"    {path}  clicks {before['clicks']} -> 0"
            f" ({_delta(before['clicks'], 0)})"
            f"  impressions {before['impressions']} -> 0"
            f" ({_delta(before['impressions'], 0)})  (gone)"
        )

    base_queries = {row["query"]: row for row in (baseline.get("queries") or [])}
    cur_queries = {row["query"]: row for row in (current.get("queries") or [])}
    lines.append(f"  queries ({len(cur_queries)} in this run):")
    for key in sorted(cur_queries, key=lambda q: (-cur_queries[q]["impressions"], q)):
        row = cur_queries[key]
        before = base_queries.get(key)
        if before is None:
            lines.append(
                f"    {key}  clicks +{row['clicks']}  impressions +{row['impressions']}  (new)"
            )
            continue
        lines.append(
            f"    {key}  clicks {before['clicks']} -> {row['clicks']}"
            f" ({_delta(before['clicks'], row['clicks'])})"
            f"  impressions {before['impressions']} -> {row['impressions']}"
            f" ({_delta(before['impressions'], row['impressions'])})"
        )

    base_map = legacy_universe(baseline.get("pages") or [], baseline.get("pagesLongWindow") or [])
    cur_map = legacy_universe(current.get("pages") or [], current.get("pagesLongWindow") or [])
    new_paths = sorted(set(cur_map) - set(base_map))
    gone_paths = sorted(set(base_map) - set(cur_map))
    lines.append(f"  legacy paths: {len(new_paths)} new, {len(gone_paths)} disappeared")
    for path in new_paths[:50]:
        row = cur_map[path]
        lines.append(
            f"    NEW  {path}  clicks {row['clicks']}  impressions {row['impressions']}"
        )
    if len(new_paths) > 50:
        lines.append(f"    ... {len(new_paths) - 50} more new legacy path(s)")
    for path in gone_paths[:50]:
        row = base_map[path]
        lines.append(
            f"    DISAPPEARED {path}  was clicks {row['clicks']}"
            f"  impressions {row['impressions']}"
        )
    if len(gone_paths) > 50:
        lines.append(f"    ... {len(gone_paths) - 50} more disappeared legacy path(s)")

    regressed = clicks_drop > REGRESSION_THRESHOLD or impressions_drop > REGRESSION_THRESHOLD
    if regressed:
        parts = []
        if clicks_drop > REGRESSION_THRESHOLD:
            parts.append(f"clicks -{clicks_drop * 100:.1f}%")
        if impressions_drop > REGRESSION_THRESHOLD:
            parts.append(f"impressions -{impressions_drop * 100:.1f}%")
        summary = "REGRESSION (" + ", ".join(parts) + f", threshold -{REGRESSION_THRESHOLD * 100:.0f}%)"
    elif clicks_drop < 0 or impressions_drop < 0:
        summary = "improved"
    else:
        summary = "no change"
    return {
        "lines": lines,
        "regressed": regressed,
        "summary": summary,
        "mismatch": False,
    }


# --- output paths ------------------------------------------------------------


def default_snapshot_path(today: date | None = None) -> Path:
    today = today or date.today()
    return repo_root() / "docs" / "seo" / f"baseline-gsc-{today.isoformat()}.json"


def default_queue_path() -> Path:
    return repo_root() / "data" / "legacy" / "gsc_inspect_queue.csv"


def is_default_api_base() -> bool:
    return str(gsc_api.API).rstrip("/") == DEFAULT_API_BASE


def docs_seo_dir() -> Path:
    return repo_root() / "docs" / "seo"


def is_inside_docs_seo(path: Path) -> bool:
    """True when a path lives in the committed baseline directory."""
    try:
        path.resolve().relative_to(docs_seo_dir().resolve())
        return True
    except (ValueError, OSError):
        return False


def snapshot_out_allowed(path: Path, snapshot: dict) -> bool:
    """A snapshot with no data may never be written into docs/seo/.

    The committed baseline directory holds real captures only: an empty
    "skipped" file there would become the next --against target and could fake
    a regression.
    """
    if snapshot.get("status") == "ok":
        return True
    return not is_inside_docs_seo(path)


# --- the "not a member" path ------------------------------------------------


def print_not_a_member(site: str, entries: list[dict]) -> None:
    visible = ", ".join(str(entry.get("siteUrl")) for entry in entries) or "(none)"
    label = site_label(site)
    log("")
    log("service account not a member of the property")
    log("  the credential authenticates, but the GSC property exposes no sites to it")
    log(f"  target property : {site}")
    log(f"  visible sites   : {visible}")
    log("")
    log("  add the service account once, by hand:")
    log(f"    1. open {GSC_SETTINGS_URL}")
    log(f"    2. pick the property ({label}) -> Users and permissions")
    log(f"    3. 'Add user' -> paste {SA_EMAIL}")
    log("    4. permission: Full")
    log("    5. Save")
    log("")
    log("  then re-run:")
    log(f"    python3 scripts/seo/gsc_snapshot.py --site {site}")
    log("")


# --- cli --------------------------------------------------------------------


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="gsc_snapshot.py",
        description="Monthly Search Console snapshot + legacy equity queue.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--site", default=DEFAULT_SITE, help="GSC property (default %(default)s)")
    parser.add_argument(
        "--days", type=int, default=DEFAULT_DAYS, help="window in days (default %(default)s)"
    )
    parser.add_argument("--against", default="", help="previous snapshot to diff against")
    parser.add_argument("--out", default="", help="snapshot path (default docs/seo/baseline-gsc-<date>.json)")
    parser.add_argument(
        "--inspect-top",
        dest="inspect_top",
        type=int,
        default=DEFAULT_INSPECT_TOP,
        help=f"how many top legacy paths to inspect (default %(default)s, hard cap {MAX_INSPECT_CALLS})",
    )
    parser.add_argument("--no-inspect", action="store_true", help="skip URL inspection")
    parser.add_argument("--selftest", action="store_true", help="run the offline self-test and exit")
    args = parser.parse_args(argv)
    if args.days < 1:
        parser.error("--days must be >= 1")
    if args.inspect_top < 0:
        parser.error("--inspect-top must be >= 0")
    return args


def main(argv: list[str] | None = None, queue_path: Path | None = None) -> int:
    args = parse_args(argv)
    if args.selftest:
        return selftest()

    site = args.site
    today = date.today()
    out_path = Path(args.out).expanduser() if args.out else default_snapshot_path(today)
    queue_path = queue_path or default_queue_path()

    # A stub/offline API base must never pollute the committed baseline.
    if not is_default_api_base() and out_path == default_snapshot_path(today):
        warn(
            f"gsc_snapshot: refusing to write the default snapshot path {out_path}"
            f" while the API base is {gsc_api.API} (not {DEFAULT_API_BASE})."
            " Use --out <file>."
        )
        return 2

    routes = route_set()

    # A skipped run collects nothing: it must never write a file (an empty
    # "skipped" baseline would be the next --against target and could fake a
    # regression), and it must never look green. Exit 3 = nothing compared.
    try:
        visible, entries = resolve_property(site)
    except SystemExit as exc:
        warn(f"gsc_snapshot: cannot read the property list ({exc})")
        print_not_a_member(site, [])
        log("gsc_snapshot: nothing captured - no snapshot written")
        return 3

    if visible is None:
        print_not_a_member(site, entries)
        log("gsc_snapshot: nothing captured - no snapshot written")
        if queue_path.exists():
            warn(
                f"gsc_snapshot: {queue_path} is from an earlier run and is now"
                " stale - this run captured nothing"
            )
        return 3

    site = visible
    try:
        snapshot, _ = capture(site, args.days, routes, today)
    except SystemExit as exc:
        warn(f"gsc_snapshot: the API call failed ({exc})")
        log("gsc_snapshot: nothing captured - no snapshot written")
        return 3

    universe = legacy_universe(
        snapshot.get("pages") or [], snapshot.get("pagesLongWindow") or []
    )
    queue = build_queue(universe)

    inspect_top = 0 if args.no_inspect else args.inspect_top
    inspected, inspect_results, cap = run_inspections(site, snapshot, inspect_top)
    snapshot["inspect"] = {
        "requested": inspect_top,
        "inspected": inspected,
        "cap": cap,
        "results": inspect_results,
    }

    rows_written, dropped = write_queue(queue_path, queue)
    snapshot["queue"] = {
        "rows": rows_written,
        "dropped": dropped,
        "capped": dropped > 0,
        "path": str(queue_path),
    }

    if not snapshot_out_allowed(out_path, snapshot):
        warn(
            f"gsc_snapshot: refusing to write a snapshot with no data into"
            f" {out_path} - the committed baseline directory holds real"
            " captures only"
        )
        return 3

    write_snapshot(out_path, snapshot)

    totals = snapshot["totals"]
    log("")
    log(f"GSC snapshot - {site} ({args.days}d window)")
    log(
        f"  totals: {totals['clicks']} clicks, {totals['impressions']} impressions"
        f" over {len(snapshot['pages'])} page row(s)"
    )
    log(
        f"  sitemaps: {len(snapshot['sitemaps'])}  queries: {len(snapshot['queries'])}"
        f"  dates: {len(snapshot['byDate'])}"
    )
    log(
        f"  legacy: {snapshot['legacy']['count']} path(s); queue {rows_written} row(s) ->"
        f" {queue_path}"
    )
    if dropped:
        log(f"  queue capped at {QUEUE_MAX_ROWS} row(s): {dropped} legacy path(s) dropped")
    if inspect_top > cap:
        log(f"  inspection capped at {cap} call(s) (--inspect-top {inspect_top})")
    log(f"  inspected {inspected} legacy path(s)")
    log(f"gsc_snapshot: wrote {out_path}")

    if not args.against:
        return 0

    try:
        baseline = json.loads(Path(args.against).expanduser().read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        warn(f"gsc_snapshot: cannot read --against snapshot {args.against}: {exc}")
        return 2

    diff = diff_snapshots(baseline, snapshot)
    log("")
    log(f"GSC diff vs {args.against}")
    for line in diff["lines"]:
        log(line)
    log(f"Result: {diff['summary']}")
    if diff["mismatch"]:
        return 3
    if diff["regressed"]:
        return 1
    return 0


# --- offline self-test ------------------------------------------------------

STUB_SITES = [
    {"siteUrl": "sc-domain:extramovies.org", "permissionLevel": "FULL"},
]

STUB_SITEMAPS = [
    {
        "path": "https://extramovies.org/sitemap.xml",
        "lastSubmitted": "2026-10-01T10:00:00Z",
        "isPending": False,
        "errors": "",
        "warnings": "",
    }
]

# (keys, clicks, impressions, ctr, position)
STUB_PAGES = [
    (["/"], 120, 3000, 0.04, 8.2),
    (["/reviews/dune-part-two"], 60, 1500, 0.04, 12.4),
    (["/reviews"], 40, 900, 0.0444, 15.1),
    (["/movies/693134"], 25, 600, 0.0417, 9.9),
    (
        ["/18-movies/18-the-evil-dead-1981-hindi-dubbed-480p-full-movie-download"],
        30,
        800,
        0.0375,
        22.7,
    ),
    (["/9xplay.php?url=abc"], 12, 400, 0.03, 31.4),
    (["/300mb-movies/dune-part-two-hd"], 5, 200, 0.025, 28.9),
    (["/movies"], 5, 100, 0.05, 11.2),
    (["/feed/"], 0, 0, 0.0, 44.0),
]

STUB_PAGES_LONG = [
    (
        ["/18-movies/18-the-evil-dead-1981-hindi-dubbed-480p-full-movie-download"],
        90,
        2000,
        0.045,
        21.0,
    ),
    (["/web-series/some-show"], 20, 300, 0.0667, 26.5),
    (["/reviews/dune-part-two"], 70, 1800, 0.0389, 12.0),
]

STUB_QUERIES = [
    (["dune part two"], 50, 1200, 0.0417, 11.2),
    (["movie reviews"], 40, 900, 0.0444, 15.1),
    (["the evil dead"], 30, 800, 0.0375, 22.7),
]

STUB_DATES = [
    (["2026-10-15"], 30, 700, 0.0428, 12.0),
    (["2026-10-16"], 25, 600, 0.0417, 13.0),
    (["2026-10-17"], 22, 500, 0.044, 13.5),
]


def _stub_rows(entries) -> list[dict]:
    rows = []
    for keys, clicks, impressions, ctr, position in entries:
        rows.append(
            {
                "keys": list(keys),
                "clicks": clicks,
                "impressions": impressions,
                "ctr": ctr,
                "position": position,
            }
        )
    return rows


def _stub_query(body: dict) -> dict:
    dimensions = body.get("dimensions") or []
    start = body.get("startDate")
    end = body.get("endDate")
    span = 0
    if start and end:
        span = (date.fromisoformat(end) - date.fromisoformat(start)).days + 1
    if dimensions == ["page"]:
        rows = STUB_PAGES_LONG if span >= LONG_WINDOW_DAYS else STUB_PAGES
    elif dimensions == ["query"]:
        rows = STUB_QUERIES
    elif dimensions == ["date"]:
        rows = STUB_DATES
    else:
        rows = []
    return {"rows": _stub_rows(rows), "responseAggregationType": "auto"}


def _stub_inspect(body: dict) -> dict:
    url = str(body.get("inspectionUrl") or "")
    coverage = "Submitted and indexed"
    verdict = "PASS"
    if "9xplay" in url:
        coverage = "Not found"
        verdict = "NEUTRAL"
    return {
        "inspectionResult": {
            "indexStatusResult": {
                "verdict": verdict,
                "coverageState": coverage,
                "robotsTxtState": "ROBOTS_TXT_STATE_ALLOWED",
                "indexingState": "INDEXING_STATE_ALLOWED",
                "lastCrawlTime": "2026-10-18T04:12:00Z",
                "googleCanonical": "https://extramovies.org/movies/693134",
                "userCanonical": url,
                "crawledAs": [{"url": url, "responseCode": "301"}],
            }
        }
    }


class _StubHandler(BaseHTTPRequestHandler):
    server_version = "GscStub/1.0"

    def log_message(self, *args) -> None:  # keep the selftest output clean
        return

    def _send(self, payload: dict, status: int = 200) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:  # noqa: N802 (http.server API)
        path = urllib.parse.unquote(urllib.parse.urlparse(self.path).path)
        if path == "/webmasters/v3/sites":
            self._send({"siteEntry": STUB_SITES})
            return
        if path.startswith("/webmasters/v3/sitemaps/"):
            self._send({"sitemap": STUB_SITEMAPS})
            return
        self._send({"error": "not found", "path": path}, 404)

    def do_POST(self) -> None:  # noqa: N802 (http.server API)
        path = urllib.parse.unquote(urllib.parse.urlparse(self.path).path)
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            body = {}
        if path.endswith("/searchAnalytics/query"):
            self._send(_stub_query(body))
            return
        if path == "/v1/urlInspection/index:inspect":
            self._send(_stub_inspect(body))
            return
        self._send({"error": "not found", "path": path}, 404)


@contextlib.contextmanager
def stub_server():
    """Run the stub HTTP server on a random localhost port."""
    server = ThreadingHTTPServer(("127.0.0.1", 0), _StubHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()


@contextlib.contextmanager
def patched_api(origin: str):
    """Point gsc_api at the stub (no key, no token, no network)."""
    saved = (gsc_api.API, gsc_api.INSPECT_API, gsc_api.token)
    gsc_api.API = f"{origin}/webmasters/v3"
    gsc_api.INSPECT_API = f"{origin}/v1"
    gsc_api.token = lambda scope: "stub-token"
    try:
        yield
    finally:
        gsc_api.API, gsc_api.INSPECT_API, gsc_api.token = saved


def selftest() -> int:
    """Offline assertions: no network, no key, nothing written to the repo."""
    failures: list[str] = []

    def check(label: str, got, want) -> None:
        if got == want:
            print(f"PASS {label}")
        else:
            failures.append(label)
            print(f"FAIL {label}\n   got: {got!r}\n  want: {want!r}")

    routes = route_set()
    check("route set found the site's own pages", len(routes) > 5, True)

    check("classify / is modern", classify_path("/", routes)[0], "modern")
    check("classify /reviews/<slug> is modern", classify_path("/reviews/dune-part-two", routes)[0], "modern")
    check("classify /movies/<id> is modern", classify_path("/movies/693134", routes)[0], "modern")
    check("classify /movies/<numeric id> is modern", classify_path("/movies/12345", routes)[0], "modern")
    check("classify /series/<id> is modern", classify_path("/series/1399", routes)[0], "modern")
    check("classify /reviews is modern", classify_path("/reviews", routes)[0], "modern")
    check("classify 18-movies/ is legacy", classify_path("/18-movies/18-the-evil-dead-1981", routes)[0], "legacy")
    check("classify 18-movies/ reason", classify_path("/18-movies/18-the-evil-dead-1981", routes)[1], "category-prefix")
    check("classify /9xplay.php is legacy", classify_path("/9xplay.php?url=abc", routes)[0], "legacy")
    check("classify /9xplay.php reason", classify_path("/9xplay.php?url=abc", routes)[1], "php-endpoint")
    check("classify /feed/ is legacy", classify_path("/feed/", routes)[1], "feed")
    check("classify /page/2/ is legacy", classify_path("/page/2/", routes)[1], "pagination")
    check("classify /2016/foo is legacy", classify_path("/2016/foo", routes)[1], "dated-path")
    check("classify /random/unknown is legacy", classify_path("/random/unknown", routes)[0], "legacy")

    # --- fix round 1: legacy rules win over the modern route set -----------
    check(
        "classify /movies/9xplay.php is legacy",
        classify_path("/movies/9xplay.php", routes)[0],
        "legacy",
    )
    check(
        "classify /movies/9xplay.php reason",
        classify_path("/movies/9xplay.php", routes)[1],
        "php-endpoint",
    )
    check(
        "classify /reviews/x.php is legacy",
        classify_path("/reviews/x.php", routes)[0],
        "legacy",
    )
    check(
        "classify /reviews/18-movies/x is legacy",
        classify_path("/reviews/18-movies/x", routes)[1],
        "category-prefix",
    )
    check(
        "classify /movies/page/2 is legacy",
        classify_path("/movies/page/2", routes)[1],
        "pagination",
    )
    check(
        "classify /reviews/feed is legacy",
        classify_path("/reviews/feed", routes)[1],
        "feed",
    )
    check(
        "classify /movies/2016/x is legacy",
        classify_path("/movies/2016/x", routes)[0],
        "legacy",
    )
    check(
        "classify /movies/2016/x is not a dated path",
        classify_path("/movies/2016/x", routes)[1],
        "not-in-route-set",
    )
    check(
        "classify /movies/<non-numeric> is legacy",
        classify_path("/movies/dune-part-two", routes)[0],
        "legacy",
    )
    check(
        "classify /movies/<non-numeric> reason",
        classify_path("/movies/dune-part-two", routes)[1],
        "non-numeric-id",
    )
    check(
        "classify /series/<non-numeric> is legacy",
        classify_path("/series/some-show", routes)[0],
        "legacy",
    )
    check(
        "classify /movies/<numeric> is modern",
        classify_path("/movies/12345", routes)[0],
        "modern",
    )
    check(
        "classify /reviews/<slug> is modern",
        classify_path("/reviews/dune-part-two", routes)[0],
        "modern",
    )

    # --- fix round 2: a numeric tmdb id is never a dated path --------------
    check(
        "classify /movies/2016 is modern",
        classify_path("/movies/2016", routes)[0],
        "modern",
    )
    check(
        "classify /series/2000 is modern",
        classify_path("/series/2000", routes)[0],
        "modern",
    )
    check(
        "classify /movies/2016 is not legacy",
        classify_path("/movies/2016", routes)[1],
        "",
    )
    check(
        "classify /2016/05/12/some-movie is legacy",
        classify_path("/2016/05/12/some-movie/", routes)[0],
        "legacy",
    )
    check(
        "classify /2016/05/12/some-movie reason",
        classify_path("/2016/05/12/some-movie/", routes)[1],
        "dated-path",
    )
    check(
        "classify /2016/he-said-she-said-1991-720p is legacy",
        classify_path("/2016/he-said-she-said-1991-720p/", routes)[0],
        "legacy",
    )
    check(
        "classify /2016/he-said-she-said-1991-720p reason",
        classify_path("/2016/he-said-she-said-1991-720p/", routes)[1],
        "dated-path",
    )
    check(
        "classify /reviews/my-review-slug is modern",
        classify_path("/reviews/my-review-slug", routes)[0],
        "modern",
    )
    check(
        "classify /18-movies/anything is legacy",
        classify_path("/18-movies/anything/", routes)[0],
        "legacy",
    )
    check(
        "classify /18-movies/anything reason",
        classify_path("/18-movies/anything/", routes)[1],
        "category-prefix",
    )
    check(
        "a year inside a slug is not a dated path",
        classify_path("/reviews/he-said-she-said-1991", routes)[0],
        "modern",
    )

    # --- fix round 1: property identity ------------------------------------
    check(
        "domain and url-prefix properties are different",
        property_identity("sc-domain:extramovies.org")
        == property_identity("https://extramovies.org/"),
        False,
    )
    check(
        "same domain property keeps its identity",
        property_identity("sc-domain:extramovies.org")
        == property_identity("sc-domain:extramovies.org"),
        True,
    )
    check(
        "url-prefix paths are different properties",
        property_identity("https://extramovies.org/")
        == property_identity("https://extramovies.org/blog"),
        False,
    )
    check(
        "property label drops the property type",
        site_label("sc-domain:extramovies.org"),
        "extramovies.org",
    )

    with stub_server() as origin:
        with patched_api(origin):
            snapshot, skip = capture(
                "sc-domain:extramovies.org", 28, routes, today=date(2026, 10, 20)
            )
            check("capture is not skipped", skip, None)
            check(
                "snapshot has the documented keys",
                sorted(
                    key
                    for key in (
                        "date",
                        "site",
                        "days",
                        "sitemaps",
                        "totals",
                        "pages",
                        "queries",
                        "byDate",
                        "legacy",
                    )
                    if key in snapshot
                ),
                sorted(
                    [
                        "date",
                        "site",
                        "days",
                        "sitemaps",
                        "totals",
                        "pages",
                        "queries",
                        "byDate",
                        "legacy",
                    ]
                ),
            )
            check("snapshot status is ok", snapshot.get("status"), "ok")
            check("snapshot site", snapshot["site"], "sc-domain:extramovies.org")
            check("snapshot days", snapshot["days"], 28)
            check("snapshot date", snapshot["date"], "2026-10-20")
            check("totals clicks", snapshot["totals"]["clicks"], 297)
            check("totals impressions", snapshot["totals"]["impressions"], 7500)
            check("sitemaps recorded", len(snapshot["sitemaps"]), 1)
            check("sitemaps keep the fields", sorted(snapshot["sitemaps"][0]),
                  ["errors", "isPending", "lastSubmitted", "path", "warnings"])
            check("queries recorded", len(snapshot["queries"]), 3)
            check("byDate recorded", len(snapshot["byDate"]), 3)
            check("long window captured", len(snapshot["pagesLongWindow"]), 3)

            by_path = {row["path"]: row for row in snapshot["pages"]}
            check("18-movies is legacy in the snapshot", by_path["/18-movies/18-the-evil-dead-1981-hindi-dubbed-480p-full-movie-download"]["classification"], "legacy")
            check("9xplay is legacy in the snapshot", by_path["/9xplay.php?url=abc"]["classification"], "legacy")
            check("review slug is modern in the snapshot", by_path["/reviews/dune-part-two"]["classification"], "modern")
            check("movie id is modern in the snapshot", by_path["/movies/693134"]["classification"], "modern")
            check("legacy count", snapshot["legacy"]["count"], 5)

            universe = legacy_universe(snapshot["pages"], snapshot["pagesLongWindow"])
            queue = build_queue(universe)
            check(
                "queue is ordered by impressions desc",
                [row["legacy_path"] for row in queue],
                [
                    "/18-movies/18-the-evil-dead-1981-hindi-dubbed-480p-full-movie-download",
                    "/9xplay.php?url=abc",
                    "/web-series/some-show",
                    "/300mb-movies/dune-part-two-hd",
                    "/feed/",
                ],
            )
            check(
                "queue actions",
                [row["action"] for row in queue],
                ["validate-fix", "validate-fix", "validate-fix", "validate-fix", "monitor"],
            )
            check("queue columns", QUEUE_COLUMNS,
                  ["legacy_path", "clicks", "impressions", "ctr", "position", "action"])

            # --- artefacts, written to a temp dir (never into the repo) ------
            with tempfile.TemporaryDirectory() as tmp:
                tmp_path = Path(tmp)
                queue_file = tmp_path / "gsc_inspect_queue.csv"
                written, dropped = write_queue(queue_file, queue)
                check("queue rows written", written, 5)
                check("queue rows dropped", dropped, 0)
                lines = queue_file.read_text(encoding="utf-8").splitlines()
                check("queue header", lines[0], "legacy_path,clicks,impressions,ctr,position,action")
                check("queue first row", lines[1].split(",")[0],
                      "/18-movies/18-the-evil-dead-1981-hindi-dubbed-480p-full-movie-download")
                check("queue last row", lines[-1].split(",")[0], "/feed/")
                check("queue last row is a monitor", lines[-1].split(",")[-1], "monitor")

                capped = build_queue(
                    {f"/legacy-{i}": {"path": f"/legacy-{i}", "clicks": 0, "impressions": 0,
                                      "ctr": 0.0, "position": 0.0, "classification": "legacy",
                                      "reason": "not-in-route-set", "url": ""}
                     for i in range(QUEUE_MAX_ROWS + 25)}
                )
                written2, dropped2 = write_queue(queue_file, capped)
                check("queue capped at 500 rows", written2, QUEUE_MAX_ROWS)
                check("queue reports the dropped rows", dropped2, 25)

                # --- inspection --------------------------------------------
                inspected, results, cap = run_inspections(
                    "sc-domain:extramovies.org", snapshot, 3
                )
                check("inspected the top N legacy paths", inspected, 3)
                check("inspection cap reported", cap, MAX_INSPECT_CALLS)
                check("inspection verdict recorded", results[0]["verdict"], "PASS")
                check("inspection coverage recorded", results[0]["coverageState"], "Submitted and indexed")
                check("inspection canonical recorded", results[0]["googleCanonical"],
                      "https://extramovies.org/movies/693134")
                soft = [r for r in results if "9xplay" in r["url"]]
                check("soft-404 detected", bool(soft and soft[0]["soft404"]), True)

                # --- --against regression gate ------------------------------
                current_file = tmp_path / "current.json"
                write_snapshot(current_file, snapshot)
                base = json.loads(current_file.read_text(encoding="utf-8"))

                dropped_base = json.loads(json.dumps(base))
                # A baseline twice as big means this run dropped ~50%.
                dropped_base["totals"] = {
                    "clicks": base["totals"]["clicks"] * 2,
                    "impressions": base["totals"]["impressions"] * 2,
                }
                dropped_file = tmp_path / "dropped.json"
                write_snapshot(dropped_file, dropped_base)

                same_file = tmp_path / "same.json"
                write_snapshot(same_file, base)

                out_file = tmp_path / "out.json"
                selftest_queue = tmp_path / "selftest_queue.csv"

                def run_cli(*cli_args: str) -> int:
                    """Run the CLI quietly (the selftest asserts on exit codes)."""
                    with contextlib.redirect_stdout(io.StringIO()):
                        return main(list(cli_args), queue_path=selftest_queue)

                code = run_cli(
                    "--site", "sc-domain:extramovies.org",
                    "--days", "28",
                    "--out", str(out_file),
                    "--against", str(dropped_file),
                    "--no-inspect",
                )
                check("regression exits 1", code, 1)

                code = run_cli(
                    "--site", "sc-domain:extramovies.org",
                    "--days", "28",
                    "--out", str(out_file),
                    "--against", str(same_file),
                    "--no-inspect",
                )
                check("no regression exits 0", code, 0)

                # A baseline from another property is never compared.
                other_base = json.loads(json.dumps(base))
                other_base["site"] = "sc-domain:other.test"
                other_file = tmp_path / "other.json"
                write_snapshot(other_file, other_base)
                code = run_cli(
                    "--site", "sc-domain:extramovies.org",
                    "--days", "28",
                    "--out", str(out_file),
                    "--against", str(other_file),
                    "--no-inspect",
                )
                check("property mismatch exits 3", code, 3)

                # A domain property and a url-prefix property are not like-for-like.
                prefix_base = json.loads(json.dumps(base))
                prefix_base["site"] = "https://extramovies.org/"
                prefix_file = tmp_path / "prefix.json"
                write_snapshot(prefix_file, prefix_base)
                code = run_cli(
                    "--site", "sc-domain:extramovies.org",
                    "--days", "28",
                    "--out", str(out_file),
                    "--against", str(prefix_file),
                    "--no-inspect",
                )
                check("domain vs url-prefix exits 3", code, 3)

                # A different window length is not like-for-like either: a
                # 90-day baseline must never fire a regression against a
                # 28-day run.
                window_base = json.loads(json.dumps(base))
                window_base["days"] = 90
                window_base["totals"] = {
                    "clicks": base["totals"]["clicks"] * 4,
                    "impressions": base["totals"]["impressions"] * 4,
                }
                window_file = tmp_path / "window.json"
                write_snapshot(window_file, window_base)
                code = run_cli(
                    "--site", "sc-domain:extramovies.org",
                    "--days", "28",
                    "--out", str(out_file),
                    "--against", str(window_file),
                    "--no-inspect",
                )
                check("window mismatch exits 3", code, 3)

                # The diff calls removed legacy paths DISAPPEARED.
                diff_result = diff_snapshots(
                    base,
                    {
                        **base,
                        "pages": [row for row in base["pages"] if row["path"] != "/feed/"],
                    },
                )
                diff_text = "\n".join(diff_result["lines"])
                check(
                    "diff labels removed legacy paths DISAPPEARED",
                    "DISAPPEARED /feed/" in diff_text,
                    True,
                )
                check(
                    "diff no longer says GONE",
                    "GONE" in diff_text,
                    False,
                )

                # --- the "not a member" path --------------------------------
                skipped_file = tmp_path / "skipped.json"
                docs_seo_before = sorted(p.name for p in docs_seo_dir().glob("*"))
                buffer = io.StringIO()
                with contextlib.redirect_stdout(buffer):
                    code = main([
                        "--site", "sc-domain:not-a-member.test",
                        "--out", str(skipped_file),
                    ])
                output = buffer.getvalue()
                check("not a member exits 3", code, 3)
                check(
                    "not a member says so",
                    "service account not a member of the property" in output,
                    True,
                )
                check(
                    "not a member shows the UI path",
                    GSC_SETTINGS_URL in output and SA_EMAIL in output,
                    True,
                )
                check(
                    "not a member names the requested site",
                    "sc-domain:not-a-member.test" in output,
                    True,
                )
                check(
                    "not a member writes no snapshot",
                    skipped_file.exists(),
                    False,
                )
                check(
                    "not a member writes nothing into docs/seo",
                    sorted(p.name for p in docs_seo_dir().glob("*")),
                    docs_seo_before,
                )
                check(
                    "a snapshot with no data may not be written into docs/seo",
                    snapshot_out_allowed(
                        docs_seo_dir() / "baseline-gsc-2026-10-20.json",
                        skipped_snapshot("sc-domain:x", 28, "no data"),
                    ),
                    False,
                )
                check(
                    "a real snapshot may be written into docs/seo",
                    snapshot_out_allowed(
                        docs_seo_dir() / "baseline-gsc-2026-10-20.json", base
                    ),
                    True,
                )

    if failures:
        print(f"selftest: {len(failures)} FAILURE(S): {failures}")
        return 1
    print("SELFTEST OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
