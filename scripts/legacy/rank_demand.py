#!/usr/bin/env python3
"""rank_demand.py — demand-ranked hub queue from the legacy redirect map.

Purpose (AGENTS.md §5, spec B4): the owner works down a queue of TMDB hubs
and writes the missing reviews. The queue is ranked by *archived demand* —
how often the Wayback capture of the legacy corpus shows a given path — joined
onto the redirect map that says where that path now lands.

Inputs (read-only; this script never mutates them):
    redirect_map.csv   archive_recover.py `resolve` output, columns
        legacy_path,target_path,tmdb_type,tmdb_id,confidence,title,year
    cdx.jsonl          archive_recover.py `collect` output: one JSON object per
        line with Wayback CDX fields ("original" holds the archived URL)

Output:
    data/legacy/demand_top.csv, columns
        tmdb_id,tmdb_type,legacy_hits,mapped_count,confidence,title,year,queue
    sorted by legacy_hits desc; `queue` is the 1-based work order (1 = most
    archived demand). `confidence` is the best confidence among the joined
    map rows, `title`/`year` come from that same row.

Usage:
    python3 scripts/legacy/rank_demand.py --map redirect_map.csv --cdx cdx.jsonl \
        --out data/legacy/demand_top.csv

Stdlib only (csv, json, argparse, urllib.parse, pathlib) — no network calls, no
pip installs. Malformed rows are skipped with a loud log line; the run never
crashes. A missing input file yields an empty output file and exit code 0.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import urllib.parse
from pathlib import Path

DEFAULT_OUT = "data/legacy/demand_top.csv"

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
OUT_COLUMNS = [
    "tmdb_id",
    "tmdb_type",
    "legacy_hits",
    "mapped_count",
    "confidence",
    "title",
    "year",
    "queue",
]

# A deliberately dead legacy URL — it never becomes a hub.
DEAD_TARGET_RE = re.compile(r"^/(410|404)$")

# How many skip messages are printed before the rest are summarised.
SKIP_LOG_LIMIT = 20


def log(msg: str) -> None:
    """Loud log line on stderr — every skipped row is announced."""
    print(f"rank_demand: {msg}", file=sys.stderr)


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

    The map stores a path ("/2016/foo/"), the CDX stores a full URL
    ("https://site/2016/foo/?x=1"); both must land on the same key.
    Mirrors scripts/seo/backlink_rescue.py — keep the two in sync.
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


def parse_map_rows(rows) -> tuple[list[dict], int]:
    """Parse redirect-map rows. Returns (rows, skipped).

    Malformed rows are skipped loudly, never fatal.
    """
    parsed: list[dict] = []
    skipped = 0
    first = True
    for lineno, raw in enumerate(rows, start=1):
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
        tmdb_type = (rec["tmdb_type"] or "").strip().lower()
        tmdb_id = (rec["tmdb_id"] or "").strip()
        title = (rec["title"] or "").strip()
        year = (rec["year"] or "").strip()

        if not legacy:
            skipped += 1
            log(f"SKIP map row {lineno}: empty legacy_path")
            continue
        if DEAD_TARGET_RE.match(target):
            skipped += 1
            log(
                f"SKIP map row {lineno}: dead target {target} (legacy {legacy})"
                " — not a hub, falls out of the queue"
            )
            continue
        if not tmdb_id:
            skipped += 1
            log(
                f"SKIP map row {lineno}: no tmdb_id (legacy {legacy})"
                " — not a hub, falls out of the queue"
            )
            continue
        if not tmdb_id.isdigit():
            skipped += 1
            log(
                f"SKIP map row {lineno}: non-numeric tmdb_id {tmdb_id!r} (legacy {legacy})"
            )
            continue
        conf_raw = (rec["confidence"] or "").strip()
        if conf_raw == "":
            confidence = 0.0
        else:
            try:
                confidence = float(conf_raw)
            except ValueError:
                skipped += 1
                log(
                    f"SKIP map row {lineno}: non-numeric confidence {conf_raw!r}"
                    f" (legacy {legacy})"
                )
                continue
        parsed.append(
            {
                "legacy_path": legacy,
                "key": norm_path(legacy),
                "target_path": target,
                "tmdb_type": tmdb_type,
                "tmdb_id": tmdb_id,
                "confidence": confidence,
                "title": title,
                "year": year,
            }
        )
    return parsed, skipped


def load_map(path: Path) -> tuple[list[dict], int]:
    with path.open(newline="", encoding="utf-8") as fh:
        return parse_map_rows(csv.reader(fh))


def parse_cdx_lines(lines) -> tuple[dict[str, int], int]:
    """Aggregate CDX records into hit counts per legacy path.

    Every record counts as one hit; a numeric `count` field (some CDX exports
    carry it) is used as the weight when present.
    """
    hits: dict[str, int] = {}
    skipped = 0
    for lineno, line in enumerate(lines, start=1):
        if not line or not line.strip():
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError as exc:
            skipped += 1
            log(f"SKIP cdx line {lineno}: bad JSON ({exc.msg})")
            continue
        if not isinstance(rec, dict):
            skipped += 1
            log(
                f"SKIP cdx line {lineno}: expected a JSON object, got {type(rec).__name__}"
            )
            continue
        url = ""
        for field in ("original", "url", "URL"):
            value = rec.get(field)
            if isinstance(value, str) and value.strip():
                url = value.strip()
                break
        if not url:
            skipped += 1
            log(f"SKIP cdx line {lineno}: no 'original' URL field")
            continue
        parts = urllib.parse.urlparse(url)
        if parts.scheme and parts.scheme not in ("http", "https"):
            skipped += 1
            log(f"SKIP cdx line {lineno}: not an http(s) URL: {url!r}")
            continue
        if not parts.path:
            skipped += 1
            log(f"SKIP cdx line {lineno}: URL has no path: {url!r}")
            continue
        key = norm_path(parts.path)
        if not key:
            skipped += 1
            log(f"SKIP cdx line {lineno}: URL path normalises to empty: {url!r}")
            continue
        weight = 1
        raw_count = rec.get("count")
        if (
            isinstance(raw_count, (int, float))
            and not isinstance(raw_count, bool)
            and raw_count > 0
        ):
            weight = int(raw_count)
        hits[key] = hits.get(key, 0) + weight
    return hits, skipped


def load_cdx(path: Path) -> tuple[dict[str, int], int]:
    with path.open(encoding="utf-8") as fh:
        return parse_cdx_lines(fh)


def build_queue(
    map_rows: list[dict], hits: dict[str, int], skip: SkipLog | None = None
) -> tuple[list[dict], int, int, int]:
    """Join map rows onto archived demand and rank the targets.

    Returns (queue, no_demand_rows, orphan_paths, orphan_hits).
    """
    groups: dict[tuple[str, str], dict] = {}
    no_demand = 0
    for row in map_rows:
        n = hits.get(row["key"], 0)
        if n <= 0:
            no_demand += 1
            if skip is not None:
                skip(
                    f"SKIP map row for {row['legacy_path']}: no archived demand"
                    " — falls out of the queue"
                )
            continue
        gkey = (row["tmdb_type"], row["tmdb_id"])
        group = groups.get(gkey)
        if group is None:
            group = groups[gkey] = {
                "tmdb_id": row["tmdb_id"],
                "tmdb_type": row["tmdb_type"],
                "legacy_hits": 0,
                "mapped_count": 0,
                "confidence": 0.0,
                "title": "",
                "year": "",
            }
        group["legacy_hits"] += n
        group["mapped_count"] += 1
        if row["confidence"] > group["confidence"] or (
            row["confidence"] == group["confidence"] and not group["title"]
        ):
            group["confidence"] = row["confidence"]
            group["title"] = row["title"]
            group["year"] = row["year"]

    queue = sorted(
        groups.values(),
        key=lambda g: (-g["legacy_hits"], g["tmdb_type"], int(g["tmdb_id"])),
    )
    for position, group in enumerate(queue, start=1):
        group["queue"] = position

    mapped_keys = {row["key"] for row in map_rows}
    orphan_paths = sum(1 for key in hits if key not in mapped_keys)
    orphan_hits = sum(n for key, n in hits.items() if key not in mapped_keys)
    return queue, no_demand, orphan_paths, orphan_hits


def write_output(out_path: Path, queue: list[dict]) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(OUT_COLUMNS)
        for group in queue:
            writer.writerow(
                [
                    group["tmdb_id"],
                    group["tmdb_type"],
                    group["legacy_hits"],
                    group["mapped_count"],
                    round(group["confidence"], 3),
                    group["title"],
                    group["year"],
                    group["queue"],
                ]
            )


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
    check("norm_path keeps root", norm_path("/"), "/")
    check("norm_path of empty", norm_path(""), "")

    rows, skipped = parse_map_rows(
        [
            ["legacy_path", "target_path", "tmdb_type", "tmdb_id", "confidence", "title", "year"],
            ["/a", "/movies/1", "movie", "1", "0.9", "T, with comma", "2020"],
            ["/b", "/movies/2", "movie", "2", "0.8", "Two", "2021"],
            ["/c", "/movies/3", "movie", "not-a-number", "0.8", "Three", "2021"],
            ["/d"],
        ]
    )
    check("map rows kept", len(rows), 2)
    check("map rows skipped", skipped, 2)
    check("comma title survives", rows[0]["title"], "T, with comma")

    hits, cdx_skipped = parse_cdx_lines(
        [
            '{"original": "https://x.test/a/", "statuscode": "200"}',
            '{"original": "https://x.test/a/", "statuscode": "200"}',
            '{"original": "https://x.test/b"}',
            "not json",
        ]
    )
    check("cdx hits aggregated", hits.get("/a"), 2)
    check("cdx hits second path", hits.get("/b"), 1)
    check("cdx bad line skipped", cdx_skipped, 1)

    queue, no_demand, orphan_paths, orphan_hits = build_queue(rows, hits)
    check("queue length", len(queue), 2)
    check("queue sorted by hits", [g["legacy_hits"] for g in queue], [2, 1])
    check("queue numbers", [g["queue"] for g in queue], [1, 2])
    check("no-demand rows", no_demand, 0)
    check("orphan paths", orphan_paths, 0)
    check("orphan hits", orphan_hits, 0)

    queue2, no_demand2, _, _ = build_queue(rows, {"/a": 3})
    check("no-demand row counted", no_demand2, 1)
    check("queue keeps demanded target", len(queue2), 1)

    print("selftest:", "OK" if failures == 0 else f"{failures} FAILURES")
    return 0 if failures == 0 else 1


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="rank_demand.py",
        description="Rank legacy hubs by archived demand (join cdx.jsonl onto redirect_map.csv).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument(
        "--map",
        dest="map_path",
        default="",
        help="redirect_map.csv (archive_recover.py resolve output)",
    )
    ap.add_argument(
        "--cdx",
        dest="cdx_path",
        default="",
        help="cdx.jsonl (archive_recover.py collect output, one JSON object per line)",
    )
    ap.add_argument(
        "--out",
        dest="out_path",
        default=DEFAULT_OUT,
        help=f"output CSV (default {DEFAULT_OUT})",
    )
    ap.add_argument(
        "--selftest",
        action="store_true",
        help="run offline assertions and exit",
    )
    args = ap.parse_args(argv)
    if args.selftest:
        return selftest()
    if not args.map_path or not args.cdx_path:
        ap.error("--map and --cdx are required (or run --selftest)")

    map_path = Path(args.map_path)
    cdx_path = Path(args.cdx_path)
    out_path = Path(args.out_path)

    missing = [p for p in (map_path, cdx_path) if not p.exists()]
    if missing:
        for path in missing:
            log(f"input not found: {path} — nothing to rank")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text("", encoding="utf-8")
        print(f"rank_demand: no input — wrote empty {out_path}")
        return 0

    map_rows, map_skipped = load_map(map_path)
    hits, cdx_skipped = load_cdx(cdx_path)
    skip = SkipLog()
    queue, no_demand, orphan_paths, orphan_hits = build_queue(map_rows, hits, skip)

    write_output(out_path, queue)

    joined_paths = sum(g["mapped_count"] for g in queue)
    print(
        f"rank_demand: {len(queue)} target(s) queued from {joined_paths} mapped path(s);"
        f" {map_skipped} map row(s) + {cdx_skipped} cdx line(s) skipped;"
        f" {no_demand} map row(s) without demand"
    )
    if orphan_paths:
        print(
            f"rank_demand: {orphan_paths} archived path(s) ({orphan_hits} hit(s)) have no map"
            " entry — demand left on the table, never mapped to a wrong target"
        )
    for group in queue[:10]:
        title = group["title"] or "?"
        year = group["year"] or "?"
        print(
            f"  {group['queue']:>3}. {group['tmdb_type']}/{group['tmdb_id']}"
            f" hits={group['legacy_hits']} paths={group['mapped_count']}"
            f" conf={round(group['confidence'], 3)} {title} ({year})"
        )
    if len(queue) > 10:
        print(f"  ... {len(queue) - 10} more in {out_path}")
    print(f"rank_demand: wrote {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
