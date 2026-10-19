#!/usr/bin/env python3
"""backlink_rescue.py — classify backlink sources and draft rescue notes.

Purpose (spec B5): pages that still link to a legacy URL are worth chasing.
For every legacy URL found in a GSC "Top linked pages" export, work out where
that URL now redirects (reverse lookup in the legacy redirect map) and check
whether the *linking page* is still alive, so the owner knows who to ask for a
link update.

Inputs (read-only; this script never mutates them):
    --links  gsc.csv            GSC "Top linked pages" export (or a Semrush
                                "referring pages" export). Columns are detected
                                by header name, with a positional fallback.
    --map    redirect_map.csv   archive_recover.py `resolve` output, columns
                                legacy_path,target_path,tmdb_type,tmdb_id,
                                confidence,title,year

Output:
    --out   data/legacy/outreach.csv, columns
                referrer,target_url,source_status,map_status,note
            source_status describes the LINKING PAGE only:
                200        the linking page is live — worth an outreach note
                404        the linking page is gone
                DNS_FAIL   the linking host could not be reached
                SKIP_BOT   the page refused us (403/429/5xx) or could not be
                           checked at all
            map_status describes the REDIRECT MAP lookup, separately:
                ok         the legacy path resolves to a live target
                missing    the legacy path is not in the map
                stale      the map row exists but has no usable target
            An unmapped or stale legacy path is reported through map_status
            (and the note) — it never borrows the SKIP_BOT label, so filtering
            SKIP_BOT still means "the source host blocked us" and nothing else.
            `note` carries the reason plus the legacy path and the referring
            domain, so every row is traceable back to the export.

Usage:
    python3 scripts/seo/backlink_rescue.py --links gsc.csv --map redirect_map.csv \
        --out data/legacy/outreach.csv [--draft]

This script NEVER contacts anyone: it sends one HEAD request per referrer to
classify it, prints a draft note, and writes a CSV. No mail, no posting — the
owner sends the messages by hand.

Stdlib only (csv, argparse, urllib.request, socket) — no pip installs.
Malformed rows are skipped with a loud log line; the run never crashes.
A missing input file still writes the output file (header row only) and
exits 0.
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import socket
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

DEFAULT_OUT = "data/legacy/outreach.csv"
DEFAULT_TIMEOUT = 5.0
USER_AGENT = "Mozilla/5.0 (compatible; BacklinkRescue/1.0)"

# Redirect map contract (archive_recover.py `resolve`).
MAP_COLUMNS = [
    "legacy_path",
    "target_path",
    "tmdb_type",
    "tmdb_id",
    "confidence",
    "title",
    "year",
]
OUT_COLUMNS = ["referrer", "target_url", "source_status", "map_status", "note"]

# A deliberately dead legacy URL — it never becomes a target.
DEAD_TARGET_RE = re.compile(r"^/(410|404)$")

# Header names we can recognise in a GSC / Semrush export.
TARGET_ALIASES = (
    "top linked pages",
    "target url",
    "target page",
    "target",
    "page url",
    "url",
    "destination url",
    "destination",
    "link target",
    "target path",
)
REFERRER_ALIASES = (
    "referring page",
    "referring url",
    "referrer url",
    "referrer page",
    "referrer",
    "source page",
    "source url",
    "linking page",
    "page linking to target url",
    "backlink url",
    "backlink",
    "page",
)

SKIP_LOG_LIMIT = 20


def log(msg: str) -> None:
    """Loud log line on stderr — every skipped row is announced."""
    print(f"backlink_rescue: {msg}", file=sys.stderr)


class SkipLog:
    """Counts skipped rows and prints the first few loudly."""

    def __init__(self, limit: int = SKIP_LOG_LIMIT) -> None:
        self.limit = limit
        self.count = 0

    def __call__(self, msg: str) -> None:
        self.count += 1
        if self.count <= self.limit:
            log(msg)
        elif self.count == self.limit + 1:
            log(f"(further skip messages suppressed after {self.limit} — the count is exact)")


def norm_path(value: str) -> str:
    """Join key for a legacy path: no scheme, no query, no trailing slash, lowercased.

    Mirrors scripts/legacy/rank_demand.py — keep the two in sync.
    """
    raw = (value or "").strip()
    if not raw:
        return ""
    if "://" in raw:
        raw = urllib.parse.urlparse(raw).path
    else:
        raw = raw.split("?", 1)[0].split("#", 1)[0]
    raw = re.sub(r"/{2,}", "/", raw)
    if len(raw) > 1:
        raw = raw.rstrip("/")
    return raw.lower()


def legacy_path_of(value: str) -> str:
    """Path part of a link target (absolute URL or already a path)."""
    raw = (value or "").strip()
    if not raw:
        return ""
    if "://" in raw:
        return urllib.parse.urlparse(raw).path
    return raw.split("?", 1)[0].split("#", 1)[0]


def _norm_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()


def detect_columns(header: list[str]) -> tuple[int | None, int | None, bool]:
    """Find the target and referrer columns. Returns (target, referrer, alias_matched)."""
    norm = [_norm_header(cell) for cell in header]
    target = None
    referrer = None
    for alias in TARGET_ALIASES:
        if alias in norm:
            target = norm.index(alias)
            break
    for alias in REFERRER_ALIASES:
        if alias in norm:
            referrer = norm.index(alias)
            break
    if target is not None and referrer == target:
        referrer = None
    matched = target is not None or referrer is not None
    if target is None and referrer is None:
        # Nothing recognised: an export with two columns has one target and one
        # referrer, whatever the header calls them.
        if len(norm) >= 2:
            return 0, 1, False
        if len(norm) == 1:
            return 0, None, False
        return None, None, False
    if target is None:
        target = next((i for i in range(len(norm)) if i != referrer), 0)
    if referrer is None:
        referrer = next((i for i in range(len(norm)) if i != target), None)
    return target, referrer, matched


def load_map(path: Path) -> tuple[dict[str, dict], int]:
    """Read the redirect map into {join key: entry}. Malformed rows are skipped loudly.

    A repeated legacy path is deduped (the first row wins) and announced, so a
    duplicated map row can never silently replace a good target. A row without
    a usable landing page is kept and marked stale: it is reported through
    `map_status`, never silently mapped somewhere else.
    """
    entries: dict[str, dict] = {}
    skipped = 0
    seen_keys: set[str] = set()
    first = True
    with path.open(newline="", encoding="utf-8") as fh:
        for lineno, raw in enumerate(csv.reader(fh), start=1):
            if not raw or all(not (c or "").strip() for c in raw):
                continue
            if first:
                first = False
                if (raw[0] or "").strip().lower() == "legacy_path":
                    continue  # header row
            if len(raw) != len(MAP_COLUMNS):
                skipped += 1
                log(
                    f"SKIP map row {lineno}: expected {len(MAP_COLUMNS)} fields, got {len(raw)}"
                )
                continue
            rec = dict(zip(MAP_COLUMNS, raw))
            legacy = (rec["legacy_path"] or "").strip()
            target = (rec["target_path"] or "").strip()
            tmdb_id = (rec["tmdb_id"] or "").strip()
            title = (rec["title"] or "").strip()
            year = (rec["year"] or "").strip()
            if not legacy:
                skipped += 1
                log(f"SKIP map row {lineno}: empty legacy_path")
                continue
            key = norm_path(legacy)
            if key in seen_keys:
                skipped += 1
                log(
                    f"SKIP map row {lineno}: duplicate legacy path {key!r}"
                    f" (legacy {legacy}) — deduped, the first row wins"
                )
                continue
            seen_keys.add(key)
            if DEAD_TARGET_RE.match(target):
                # Stale row: the legacy URL is deliberately dead. It is kept and
                # labelled, never silently mapped to another target.
                entries[key] = {
                    "target_path": target,
                    "tmdb_id": tmdb_id,
                    "title": title,
                    "year": year,
                    "stale": True,
                    "stale_reason": f"dead-target:{target}",
                }
                continue
            if not target:
                skipped += 1
                log(
                    f"SKIP map row {lineno}: empty target_path (legacy {legacy})"
                    " — no landing page, labelled stale"
                )
                entries[key] = {
                    "target_path": target,
                    "tmdb_id": tmdb_id,
                    "title": title,
                    "year": year,
                    "stale": True,
                    "stale_reason": "no-landing-page",
                }
                continue
            if not tmdb_id:
                skipped += 1
                log(
                    f"SKIP map row {lineno}: no tmdb_id (legacy {legacy})"
                    " — labelled stale"
                )
                entries[key] = {
                    "target_path": target,
                    "tmdb_id": tmdb_id,
                    "title": title,
                    "year": year,
                    "stale": True,
                    "stale_reason": "no-tmdb-id",
                }
                continue
            if not tmdb_id.isdigit():
                skipped += 1
                log(
                    f"SKIP map row {lineno}: non-numeric tmdb_id {tmdb_id!r}"
                    f" (legacy {legacy}) — labelled stale"
                )
                entries[key] = {
                    "target_path": target,
                    "tmdb_id": tmdb_id,
                    "title": title,
                    "year": year,
                    "stale": True,
                    "stale_reason": "bad-tmdb-id",
                }
                continue
            entries[key] = {
                "target_path": target,
                "tmdb_id": tmdb_id,
                "title": title,
                "year": year,
                "stale": False,
                "stale_reason": "",
            }
    return entries, skipped


def classify_code(code: int) -> tuple[str, str]:
    """HTTP status -> (source_status, detail)."""
    if 200 <= code < 300:
        return "200", f"HTTP {code}"
    if code == 404:
        return "404", "HTTP 404"
    return "SKIP_BOT", f"skipped: HTTP {code}"


def classify_exception(reason) -> tuple[str, str]:
    """Transport error -> (source_status, detail).

    `source_status` stays inside the closed enum, so a transport failure is
    DNS_FAIL — but the note names the exception class, so the operator can
    tell a name-resolution failure from a refused connection or a TLS error.
    """
    if isinstance(reason, socket.gaierror):
        return "DNS_FAIL", f"dns-failure: socket.gaierror: {reason}"
    if isinstance(reason, (socket.timeout, TimeoutError)):
        return "DNS_FAIL", "dns-failure: TimeoutError: timed out"
    if isinstance(reason, OSError):
        return "DNS_FAIL", f"dns-failure: {type(reason).__name__}: {reason}"
    return "SKIP_BOT", f"skipped: {type(reason).__name__}: {reason}"


class HeadRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Keep the method HEAD across redirects (urllib would switch to GET)."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        new = super().redirect_request(req, fp, code, msg, headers, newurl)
        if new is not None and req.get_method() == "HEAD":
            new.method = "HEAD"
        return new


_OPENER = urllib.request.build_opener(HeadRedirectHandler)


def probe(url: str, timeout: float, probe_base: str = "") -> tuple[str, str]:
    """HEAD-check a referrer and classify it. Never downloads a body."""
    target = url
    if probe_base:
        parts = urllib.parse.urlparse(url)
        path = parts.path or "/"
        if parts.query:
            path = f"{path}?{parts.query}"
        target = probe_base.rstrip("/") + path
    if not re.match(r"^https?://", target, re.IGNORECASE):
        return "SKIP_BOT", "skipped: not an http(s) URL"
    request = urllib.request.Request(
        target, method="HEAD", headers={"User-Agent": USER_AGENT, "Accept": "*/*"}
    )
    try:
        with _OPENER.open(request, timeout=timeout) as response:
            code = response.getcode()
    except urllib.error.HTTPError as exc:  # 4xx/5xx are answers, not failures
        code = exc.code
    except urllib.error.URLError as exc:
        return classify_exception(exc.reason)
    except (socket.timeout, TimeoutError):
        return "DNS_FAIL", f"dns-failure: timeout after {timeout:g}s"
    except Exception as exc:  # noqa: BLE001 - never crash the run
        return "SKIP_BOT", f"skipped: {type(exc).__name__}"
    return classify_code(code)


def read_links(path: Path, skip: SkipLog) -> tuple[list[dict], int]:
    """Read the GSC/Semrush export into normalised rows.

    Each row becomes {legacy_path, domain, referrer}. Rows without a usable
    target are skipped loudly.
    """
    rows: list[dict] = []
    skipped = 0
    with path.open(newline="", encoding="utf-8") as fh:
        raw_rows = [row for row in csv.reader(fh)]
    if not raw_rows:
        return rows, skipped

    header: list[str] | None = None
    body = raw_rows
    for index, row in enumerate(raw_rows):
        if not row or all(not (c or "").strip() for c in row):
            continue
        candidate = [_norm_header(cell) for cell in row]
        known = any(
            cell in TARGET_ALIASES or cell in REFERRER_ALIASES for cell in candidate
        )
        if known:
            header = row
            body = raw_rows[index + 1 :]
        else:
            body = raw_rows[index:]
        break

    if header is None:
        target_col, referrer_col = 0, 1
        log(
            "links header not recognised — positional fallback"
            " (column 1 = target, column 2 = referrer)"
        )
    else:
        target_col, referrer_col, matched = detect_columns(header)
        if not matched:
            log(
                "links header not recognised — positional fallback"
                " (column 1 = target, column 2 = referrer)"
            )
        if referrer_col is None:
            log(
                "links header has no referrer column — linking pages cannot be checked"
                " (rows are labelled SKIP_BOT)"
            )

    for lineno, row in enumerate(body, start=1):
        if not row or all(not (c or "").strip() for c in row):
            continue
        if target_col is None or target_col >= len(row):
            skipped += 1
            skip(f"SKIP links row {lineno}: no target column value")
            continue
        target_raw = (row[target_col] or "").strip()
        legacy_path = legacy_path_of(target_raw)
        if not legacy_path:
            skipped += 1
            skip(f"SKIP links row {lineno}: empty target URL")
            continue
        referrer = ""
        if referrer_col is not None and referrer_col < len(row):
            referrer = (row[referrer_col] or "").strip()
        if not referrer:
            skipped += 1
            skip(
                f"SKIP links row {lineno}: no referring page for {legacy_path}"
                " — labelled SKIP_BOT"
            )
        domain = ""
        if referrer:
            netloc = urllib.parse.urlparse(referrer).netloc
            domain = netloc.lower()
        rows.append(
            {
                "legacy_path": legacy_path,
                "key": norm_path(legacy_path),
                "domain": domain,
                "referrer": referrer,
            }
        )
    return rows, skipped


def dedupe(rows: list[dict]) -> tuple[list[dict], int]:
    """One row per unique (legacy path, referrer) pair."""
    seen: set[tuple[str, str]] = set()
    unique: list[dict] = []
    dropped = 0
    for row in rows:
        key = (row["key"], row["referrer"])
        if key in seen:
            dropped += 1
            continue
        seen.add(key)
        unique.append(row)
    return unique, dropped


def build_rows(
    links: list[dict],
    map_entries: dict[str, dict],
    origin: str,
    timeout: float,
    probe_base: str,
) -> list[dict]:
    """Classify every link row into an outreach row.

    `source_status` describes the LINKING PAGE only (200 | 404 | DNS_FAIL |
    SKIP_BOT). The redirect map is reported separately through `map_status`
    (ok | missing | stale) — an unmapped or stale legacy path never borrows
    the SKIP_BOT label, so filtering SKIP_BOT still means "the source host
    blocked us" and nothing else. A row without a usable target keeps an empty
    `target_url`: it is never mapped to a wrong target.
    """
    out: list[dict] = []
    for row in links:
        status, detail = probe(row["referrer"], timeout, probe_base)
        entry = map_entries.get(row["key"])
        if entry is None:
            map_status = "missing"
            map_detail = "no-entry"
            target_url = ""
        elif entry["stale"]:
            map_status = "stale"
            map_detail = entry["stale_reason"]
            target_url = ""
        else:
            map_status = "ok"
            map_detail = ""
            target_url = join_url(origin, entry["target_path"])
        note_parts = [
            f"legacy={row['legacy_path']}",
            f"domain={row['domain'] or '?'}",
            f"map={map_status}",
        ]
        if map_detail:
            note_parts.append(f"map_detail={map_detail}")
        note_parts.append(f"src={detail}")
        note = "; ".join(note_parts)
        if probe_base:
            note += f"; probe-base={probe_base}"
        out.append(
            {
                "referrer": row["referrer"],
                "target_url": target_url,
                "source_status": status,
                "map_status": map_status,
                "note": note,
                "title": entry["title"] if entry else "",
                "year": entry["year"] if entry else "",
            }
        )
    return out


def join_url(origin: str, path: str) -> str:
    """Absolute target URL when an origin is known, otherwise the path."""
    path = path or ""
    if not origin:
        return path
    return origin.rstrip("/") + "/" + path.lstrip("/")


def write_output(out_path: Path, rows: list[dict]) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(OUT_COLUMNS)
        for row in rows:
            writer.writerow(
                [
                    row["referrer"],
                    row["target_url"],
                    row["source_status"],
                    row["map_status"],
                    row["note"],
                ]
            )


def print_drafts(rows: list[dict]) -> int:
    """Print a 3-line outreach note per live source row. Nothing is sent.

    A live source is only actionable when the map resolved a target
    (`map_status == "ok"`); a live source with a missing or stale map row has
    no new URL to offer, so it is reported loudly instead of getting a broken
    draft.
    """
    live = [row for row in rows if row["source_status"] == "200"]
    actionable = [row for row in live if row["map_status"] == "ok"]
    for row in live:
        if row["map_status"] != "ok":
            log(
                f"live source {row['referrer']} has no usable target"
                f" (map={row['map_status']}) — no draft written"
            )
    if not actionable:
        print("backlink_rescue: no live source row with a usable target — no drafts to write")
        return 0
    for index, row in enumerate(actionable, start=1):
        label = f"{row['title']} ({row['year']})" if row["title"] else "our page"
        print(f"[draft {index}/{len(actionable)}] {row['referrer']}")
        print(f"  our page moved to {row['target_url']} — {label}")
        print(
            "  ask the site owner to point the link at the new URL;"
            " the old path is retired"
        )
    return len(actionable)


def selftest() -> int:
    """Offline assertions (no network, no files written)."""
    failures = 0

    def check(label: str, got, want) -> None:
        nonlocal failures
        ok = got == want
        if not ok:
            failures += 1
        print(("PASS " if ok else "FAIL ") + label)
        if not ok:
            print(f"   got: {got!r} want: {want!r}")

    check("norm_path strips scheme+query", norm_path("https://x.test/a/b/?q=1"), "/a/b")
    check("norm_path strips trailing slash", norm_path("/2016/Foo/"), "/2016/foo")
    check("legacy_path_of url", legacy_path_of("https://x.test/a/b/"), "/a/b/")
    check("legacy_path_of path", legacy_path_of("/a/b/?x=1"), "/a/b/")
    check("legacy_path_of empty", legacy_path_of(""), "")

    target, referrer, matched = detect_columns(
        ["Top linked pages", "Target URL", "Referring page"]
    )
    check("gsc header recognised", matched, True)
    check("gsc target column", target, 0)
    check("gsc referrer column", referrer, 2)

    target, referrer, matched = detect_columns(["Top linked pages", "Page"])
    check("gsc short header recognised", matched, True)
    check("gsc short target column", target, 0)
    check("gsc short referrer column", referrer, 1)

    target, referrer, matched = detect_columns(["Column A", "Column B"])
    check("unknown header is positional", (target, referrer, matched), (0, 1, False))

    target, referrer, matched = detect_columns(["Page URL", "Link URL"])
    check("page url is a target alias", (target, referrer, matched), (0, 1, True))

    target, referrer, matched = detect_columns(["Target URL", "Referring page"])
    check("target url column", target, 0)
    check("referring page column", referrer, 1)

    check("classify 200", classify_code(200), ("200", "HTTP 200"))
    check("classify 204", classify_code(204), ("200", "HTTP 204"))
    check("classify 404", classify_code(404), ("404", "HTTP 404"))
    check("classify 403", classify_code(403), ("SKIP_BOT", "skipped: HTTP 403"))
    check("classify 500", classify_code(500), ("SKIP_BOT", "skipped: HTTP 500"))
    dns_status, dns_detail = classify_exception(
        socket.gaierror(-2, "Name or service not known")
    )
    check("classify dns status", dns_status, "DNS_FAIL")
    check("classify dns names the class", "socket.gaierror" in dns_detail, True)
    timeout_status, timeout_detail = classify_exception(TimeoutError())
    check("classify timeout status", timeout_status, "DNS_FAIL")
    check("classify timeout names the class", "TimeoutError" in timeout_detail, True)
    refused_status, refused_detail = classify_exception(
        ConnectionRefusedError(61, "Connection refused")
    )
    check("classify refused status", refused_status, "DNS_FAIL")
    check("classify refused names the class", "ConnectionRefusedError" in refused_detail, True)

    # Fix round 1: a missing or stale map row is reported through map_status and
    # never borrows the SKIP_BOT label.
    check(
        "output columns",
        OUT_COLUMNS,
        ["referrer", "target_url", "source_status", "map_status", "note"],
    )
    probe_calls: list[str] = []

    def fake_probe(url, timeout, probe_base=""):  # noqa: ANN001 - test double
        probe_calls.append(url)
        return "200", "HTTP 200"

    original_probe = probe
    globals()["probe"] = fake_probe
    try:
        rows = build_rows(
            [
                {"legacy_path": "/a/", "key": "/a", "domain": "x.test", "referrer": "https://x.test/a"},
                {"legacy_path": "/b/", "key": "/b", "domain": "y.test", "referrer": "https://y.test/b"},
                {"legacy_path": "/c/", "key": "/c", "domain": "z.test", "referrer": "https://z.test/c"},
            ],
            {
                "/a": {"target_path": "/movies/1", "tmdb_id": "1", "title": "One", "year": "2020", "stale": False, "stale_reason": ""},
                "/b": {"target_path": "/410", "tmdb_id": "", "title": "", "year": "", "stale": True, "stale_reason": "dead-target:/410"},
            },
            "https://site.test",
            5.0,
            "",
        )
    finally:
        globals()["probe"] = original_probe
    check("map ok row status", rows[0]["source_status"], "200")
    check("map ok row map_status", rows[0]["map_status"], "ok")
    check("map ok row target", rows[0]["target_url"], "https://site.test/movies/1")
    check("stale row keeps its source status", rows[1]["source_status"], "200")
    check("stale row map_status", rows[1]["map_status"], "stale")
    check("stale row has no target", rows[1]["target_url"], "")
    check("stale row note names the reason", "map_detail=dead-target:/410" in rows[1]["note"], True)
    check("missing row keeps its source status", rows[2]["source_status"], "200")
    check("missing row map_status", rows[2]["map_status"], "missing")
    check("missing row has no target", rows[2]["target_url"], "")

    # Fix round 1: a repeated legacy path in the map is skipped, not overwritten.
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        map_file = Path(tmp) / "map.csv"
        map_file.write_text(
            "legacy_path,target_path,tmdb_type,tmdb_id,confidence,title,year\n"
            "/a,/movies/1,movie,1,0.9,One,2020\n"
            "/A/,/movies/2,movie,2,0.5,One again,2020\n",
            encoding="utf-8",
        )
        entries, map_skipped = load_map(map_file)
    check("duplicate map row skipped", map_skipped, 1)
    check("duplicate map row keeps the first target", entries["/a"]["target_path"], "/movies/1")

    # A comma-bearing row survives the csv round trip.
    import io

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["https://news.example.com/2016/08/best-movies,of-2020", "https://x.test/a/"]
    )
    parsed = list(csv.reader(io.StringIO(buffer.getvalue())))
    check(
        "comma row round trip",
        parsed[0][0],
        "https://news.example.com/2016/08/best-movies,of-2020",
    )

    check("join_url with origin", join_url("https://x.test", "/movies/1"), "https://x.test/movies/1")
    check("join_url without origin", join_url("", "/movies/1"), "/movies/1")

    print("selftest:", "OK" if failures == 0 else f"{failures} FAILURES")
    return 0 if failures == 0 else 1


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="backlink_rescue.py",
        description="Classify backlink sources and draft (never send) rescue notes.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument(
        "--links",
        dest="links_path",
        default="",
        help="GSC 'Top linked pages' export CSV",
    )
    ap.add_argument(
        "--map",
        dest="map_path",
        default="",
        help="redirect_map.csv (archive_recover.py resolve output)",
    )
    ap.add_argument(
        "--out",
        dest="out_path",
        default=DEFAULT_OUT,
        help=f"output CSV (default {DEFAULT_OUT})",
    )
    ap.add_argument(
        "--draft",
        action="store_true",
        help="print a 3-line outreach note per live-source row (never sends anything)",
    )
    ap.add_argument(
        "--site-url",
        dest="site_url",
        default=os.environ.get("SITE_URL", ""),
        help="origin for the absolute target URL (default: $SITE_URL)",
    )
    ap.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT,
        help=f"HEAD timeout in seconds (default {DEFAULT_TIMEOUT:g})",
    )
    ap.add_argument(
        "--probe-base",
        dest="probe_base",
        default=os.environ.get("BACKLINK_RESCUE_PROBE_BASE", ""),
        help=(
            "offline testing only: HEAD-check <probe-base><referrer path> instead of"
            " the real host"
        ),
    )
    ap.add_argument(
        "--selftest",
        action="store_true",
        help="run offline assertions and exit",
    )
    args = ap.parse_args(argv)
    if args.selftest:
        return selftest()
    if not args.links_path or not args.map_path:
        ap.error("--links and --map are required (or run --selftest)")

    links_path = Path(args.links_path)
    map_path = Path(args.map_path)
    out_path = Path(args.out_path)

    missing = [p for p in (links_path, map_path) if not p.exists()]
    if missing:
        for path in missing:
            log(f"input not found: {path} — nothing to rescue")
        write_output(out_path, [])
        print(f"backlink_rescue: no input — wrote an empty {out_path} (header only)")
        return 0

    if args.probe_base:
        log(
            f"probe-base override active: {args.probe_base} — HEAD checks hit the"
            " override host, not the real referrer"
        )

    skip = SkipLog()
    map_entries, map_skipped = load_map(map_path)
    links, links_skipped = read_links(links_path, skip)
    unique, dropped = dedupe(links)
    rows = build_rows(
        unique, map_entries, args.site_url, args.timeout, args.probe_base
    )
    write_output(out_path, rows)

    counts: dict[str, int] = {}
    map_counts: dict[str, int] = {}
    for row in rows:
        counts[row["source_status"]] = counts.get(row["source_status"], 0) + 1
        map_counts[row["map_status"]] = map_counts.get(row["map_status"], 0) + 1
    source_summary = ", ".join(f"{k}={v}" for k, v in sorted(counts.items())) or "no rows"
    map_summary = ", ".join(f"{k}={v}" for k, v in sorted(map_counts.items())) or "no rows"
    print(
        f"backlink_rescue: {len(rows)} row(s) written"
        f" (source: {source_summary}; map: {map_summary});"
        f" {links_skipped} link row(s) + {map_skipped} map row(s) skipped;"
        f" {dropped} duplicate(s) dropped"
    )
    if args.draft:
        live = print_drafts(rows)
        print(f"backlink_rescue: {live} draft note(s) — print only, nothing was sent")
    print(f"backlink_rescue: wrote {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
