#!/usr/bin/env python3
"""archive_recover.py — legacy piracy-archive URL recovery pipeline.

Purpose (AGENTS.md §5): recover search demand behind the pre-rebrand
extramovies.org WordPress corpus (2016-2025) WITHOUT re-hosting piracy
content. It turns archived URLs into a server-ready redirect map that
sends legacy backlinks to legit TMDB-backed pages:
    resolvable post URL  -> 301 /movies/<tmdbId>  or  /series/<tmdbId>
    player/numeric/etc   -> 410 (dead)

Stages (subcommands):
    collect   Wayback CDX -> data/legacy/cdx.jsonl
    parse     debug one URL -> candidate JSON
    resolve   candidates -> TMDB -> data/legacy/redirect_map.csv + unresolved.csv
    report    quick counts over the map
    selftest  slug-parser unit assertions (no network)

Run with `python3 scripts/legacy/archive_recover.py <cmd> ...` — stdlib
only, no pip installs. TMDB reads env `TMDB_API_KEY` (or pass --tmdb-key;
never hardcode). Outputs land in data/legacy/ (gitignored) unless --out-dir.

Server contract: redirect_map.csv columns
    legacy_path,target_path,tmdb_type,tmdb_id,confidence,title,year
legacy_path is the normalized site path (no host, no scheme). Any path
kind=player/paged/unresolved in unresolved.csv is handled server-side by
pattern rules, not row-by-row.
"""

from __future__ import annotations

import argparse
import csv
import difflib
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

CDX_ENDPOINT = "https://web.archive.org/cdx/search/cdx"
TMDB_SEARCH = "https://api.themoviedb.org/3/search"

DEFAULT_OUT_DIR = "data/legacy"

# WordPress permalink noise: quality marks, languages, piracy boilerplate.
NOISE = {
    "720p", "1080p", "480p", "360p", "hd", "hdts", "hq", "blu", "bd",
    "brrip", "bluray", "blu-ray", "bdrip", "dvdrip", "dvdscr", "web",
    "webrip", "web-dl", "webdl", "hdtv", "camrip", "pdvd", "pdvdrip",
    "hdrip", "ts", "tc", "print", "untouched", "esubs", "esub", "esubs",
    "subs", "sub", "dual", "audio", "dual-audio", "dualaudio", "org",
    "original", "mkv", "x264", "x265", "hevc", "avc", "aac", "5.1",
    "1cd", "2cd", "700mb", "900mb", "1gb", "2gb", "4gb", "300mb",
    "hindi", "english", "tamil", "telugu", "malayalam", "punjabi",
    "marathi", "bengali", "kannada", "urdu", "dubbed", "unrated",
    "uncut", "uncensored", "extended", "proper", "repack", "full",
    "movie", "movies", "film", "download", "downloads", "free",
    "watch", "online", "hdrip",
}

# Age-rating prefixes seen in the corpus (e.g. 18-american-pie-...).
AGE_RATINGS = {"18", "a18", "18plus", "xxx", "adult"}

# Known WordPress taxonomy prefixes (strip before matching). First segment
# must match one of these to be treated as a category shell.
CATEGORY_RE = re.compile(
    r"^(?:\d+(?:mb)?-movies|movies|movie|web-series|webseries|tv-shows|"
    r"tv|series|dual-audio-movies|hindi-dubbed-movies|south-movies|"
    r"punjabi-movies|hindi-movies|bollywood-movies|hollywood-movies|"
    r"adult-movies)$"
)

PAGINATION_RE = re.compile(r"^page/(\d+)$")
NUMERIC_ONLY_RE = re.compile(r"^(\d+)/?$")
YEAR_RE = re.compile(r"^(19|20)\d{2}$")


def norm_text(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", s.lower()).strip()


def slug_candidates(slug: str) -> dict:
    """Slug -> {kind, title_tokens, year, query_candidates}.

    Rightmost 4-digit 19xx/20xx token is the year; tokens left of it are
    the title after dropping NOISE tokens and age-rating prefix.
    """
    raw = urllib.parse.unquote(slug).strip("/")
    raw = raw.split("?")[0]
    parts = [p for p in raw.split("/") if p]
    kind = "post"

    # player / php endpoints
    if any(p.endswith(".php") for p in parts):
        return {"kind": "player", "candidates": []}

    # pagination shells -> normalize to the listing root
    while parts and (CATEGORY_RE.match(parts[0]) or PAGINATION_RE.match(parts[0])):
        parts.pop(0)

    # WordPress feed/comment trailing segments
    while parts and parts[-1] in ("feed", "comment", "comments"):
        parts.pop()

    if not parts:
        return {"kind": "empty", "candidates": []}

    # numeric-only page (WordPress ?p= style)
    m = NUMERIC_ONLY_RE.match(parts[-1])
    if len(parts) == 1 and m:
        return {"kind": "paged", "candidates": ["/__MOVIES__/"]}

    slug = parts[-1]

    # everything after the rightmost year token must be noise; find year
    tokens = slug.split("-")
    year = None
    year_idx = None
    for i in range(len(tokens) - 1, -1, -1):
        if YEAR_RE.match(tokens[i]):
            # year must be followed only by NOISE tokens to count
            tail = tokens[i + 1:]
            if all(t in NOISE or t in AGE_RATINGS for t in tail):
                year = tokens[i]
                year_idx = i
                break

    title_tokens = tokens[:year_idx] if year_idx is not None else tokens
    title_tokens = [t for t in title_tokens if t and t not in NOISE]

    candidates: list[str] = []
    if title_tokens:
        q = " ".join(title_tokens).strip()
        if q:
            candidates.append(q)
        # secondary: drop leading age-rating tokens
        if title_tokens and title_tokens[0] in AGE_RATINGS:
            q2 = " ".join(title_tokens[1:]).strip()
            if q2:
                candidates.append(q2)

    if not candidates or not year:
        return {"kind": "post", "candidates": [], "title": title_tokens, "year": year}

    scoring_title = title_tokens[1:] if title_tokens and title_tokens[0] in AGE_RATINGS else title_tokens
    return {
        "kind": "post",
        "candidates": candidates,
        "title": scoring_title,
        "year": int(year),
    }


# ---------------------------------------------------------------- collect
def collect(args: argparse.Namespace) -> int:
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / "cdx.jsonl"

    seen: set[str] = set()
    if out_file.exists():
        with out_file.open(encoding="utf-8") as fh:
            for line in fh:
                try:
                    seen.add(json.loads(line)["original"])
                except Exception:
                    pass
    print(f"collect: {len(seen)} rows cached from previous runs")

    years = list(range(args.start_year, args.end_year + 1))
    total_new = 0
    with out_file.open("a", encoding="utf-8") as out:
        for year in years:
            params = {
                "url": args.site,
                "matchType": "domain",
                "fl": "original,statuscode,lasttimestamp",
                "filter": "statuscode:200",
                "collapse": "urlkey",
                "limit": str(args.page_size),
                "from": f"{year}",
                "to": f"{year}",
            }
            url = CDX_ENDPOINT + "?" + urllib.parse.urlencode(params)
            for attempt in range(3):
                try:
                    req = urllib.request.Request(url, headers={"User-Agent": "archive-recover/1"})
                    body = urllib.request.urlopen(req, timeout=90).read().decode("utf-8", "replace")
                    break
                except Exception as exc:  # noqa: BLE001
                    print(f"collect: CDX {year} attempt {attempt + 1} failed: {exc}", file=sys.stderr)
                    time.sleep(5 * (attempt + 1))
            else:
                continue
            rows = [ln.split(" ", 2) for ln in body.splitlines() if ln.strip()]
            new = 0
            for cols in rows:
                if len(cols) != 3:
                    continue
                original, _status, ts = cols
                if original in seen:
                    continue
                seen.add(original)
                out.write(json.dumps({"original": original, "year": year, "ts": ts}) + "\n")
                new += 1
            total_new += new
            print(f"collect: year {year}: +{new}")
    print(f"collect: done, total new rows {total_new}; file {out_file}")
    return 0


# ---------------------------------------------------------------- resolve
def tmdb_search(q: str, year: int, kind: str, key: str) -> list[dict]:
    tmdb_search.auth_alerted = getattr(tmdb_search, "auth_alerted", {})
    path = "movie" if kind == "movie" else "tv"
    params = {"query": q, "include_adult": "false"}
    headers = {"User-Agent": "archive-recover/1"}
    if key.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {key}"  # v4 read token
    else:
        params["api_key"] = key  # v3 api_key
    if year:
        if kind == "movie":
            params["year"] = str(year)
        else:
            params["first_air_date_year"] = str(year)
    url = f"{TMDB_SEARCH}/{path}?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=headers)
    for attempt in range(4):
        try:
            data = json.loads(urllib.request.urlopen(req, timeout=30).read().decode("utf-8"))
            return data.get("results") or []
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                time.sleep(10)
                continue
            if exc.code >= 500:
                time.sleep(5 * (attempt + 1))
                continue
            if not tmdb_search.auth_alerted.get(exc.code):
                tmdb_search.auth_alerted[exc.code] = True
                print(f"tmdb: HTTP {exc.code} — check TMDB_API_KEY ({exc.reason})", file=sys.stderr)
            return []
        except Exception:  # noqa: BLE001
            time.sleep(3)
    return []


def score(result: dict, title_tokens: list[str], year: int | None, kind: str) -> float:
    titles = []
    for f in ("title", "name", "original_title", "original_name"):
        if result.get(f):
            titles.append(norm_text(result[f]))
    joined = " ".join(title_tokens)
    ratio = max((difflib.SequenceMatcher(None, joined, t).ratio() for t in titles), default=0.0)
    exact = any(norm_text(t) == joined for t in titles)
    r_year = result.get("release_date") or result.get("first_air_date") or ""
    r_year_n = int(r_year[:4]) if re.match(r"^\d{4}", r_year) else None
    year_ok = (r_year_n is None) or (year is None) or abs(r_year_n - year) <= 1
    score = ratio
    if exact:
        score += 0.25
    if year_ok:
        score += 0.2
    else:
        score -= 0.3
    if result.get("popularity", 0) > 5:
        score += 0.05
    return score


CACHE_LOCK = threading.Lock()


def resolve_one(item: dict, key: str, cache: dict) -> dict:
    path = urllib.parse.urlparse(item["original"]).path
    norm_path = path.lower()
    info = slug_candidates(norm_path)

    if info["kind"] == "player":
        return {**item, "kind": "player", "target": "/410"}
    if info["kind"] == "paged":
        return {**item, "kind": "paged", "target": "/movies/"}
    if info["kind"] == "empty":
        # legacy domain root is today's homepage — leave untouched
        return {**item, "kind": "empty", "target": "/"}

    cands = info.get("candidates") or []
    if not cands:
        return {**item, "kind": "post", "target": "/410", "reason": "no-title"}

    ck = f"{cands[0]}|{info.get('year')}"
    if ck in cache:
        return {**item, **cache[ck]}

    best = None
    for kind in ("movie", "tv"):
        for q in cands:
            results = tmdb_search(q, info.get("year"), kind, key)
            for r in results[:5]:
                s = score(r, info.get("title") or [], info.get("year"), kind)
                if s >= 0.75 and (best is None or s > best["confidence"]):
                    tmdb_id = r.get("id")
                    title = r.get("title") or r.get("name")
                    best = {
                        "kind": kind,
                        "target": f"/{'movies' if kind == 'movie' else 'series'}/{tmdb_id}",
                        "tmdb_id": tmdb_id,
                        "tmdb_title": title,
                        "confidence": round(s, 3),
                    }
            if best and best["confidence"] >= 1.0:
                break
    if best is None:
        best = {"kind": "post", "target": "/410", "reason": "unresolved", "confidence": 0}

    with CACHE_LOCK:
        cache[ck] = best
    return {**item, **best}


def resolve(args: argparse.Namespace) -> int:
    key = args.tmdb_key or os.environ.get("TMDB_API_KEY", "")
    if not key:
        print("resolve: TMDB_API_KEY missing (env or --tmdb-key)", file=sys.stderr)
        return 1

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    cdx_file = out_dir / "cdx.jsonl"
    if not cdx_file.exists():
        print("resolve: no cdx.jsonl — run collect first", file=sys.stderr)
        return 1
    items = [json.loads(l) for l in cdx_file.read_text(encoding="utf-8").splitlines() if l.strip()]
    items = items[: args.limit] if args.limit else items

    cache_file = out_dir / "tmdb_cache.json"
    if args.reset_cache and cache_file.exists():
        cache_file.unlink()
        print("resolve: cache reset (--reset-cache)")
    cache: dict = json.loads(cache_file.read_text(encoding="utf-8")) if cache_file.exists() else {}

    resolved: list[dict] = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futs = {pool.submit(resolve_one, it, key, cache): it for it in items}
        for i, fut in enumerate(as_completed(futs), 1):
            resolved.append(fut.result())
            if i % 50 == 0:
                with CACHE_LOCK:
                    snapshot = dict(cache)
                cache_file.write_text(json.dumps(snapshot, indent=0), encoding="utf-8")
                print(f"resolve: {i}/{len(items)}")

    with CACHE_LOCK:
        snapshot = dict(cache)
    cache_file.write_text(json.dumps(snapshot, indent=0), encoding="utf-8")

    map_path = out_dir / "redirect_map.csv"
    unresolved_path = out_dir / "unresolved.csv"
    resolved.sort(key=lambda r: -(r.get("confidence") or 0))
    with map_path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["legacy_path", "target_path", "tmdb_type", "tmdb_id", "confidence", "title", "year"])
        for r in resolved:
            if r.get("tmdb_id"):
                w.writerow([
                    urllib.parse.urlparse(r["original"]).path,
                    r["target"], r["kind"], r["tmdb_id"],
                    r.get("confidence"), r.get("tmdb_title", ""), r.get("year", ""),
                ])
    with unresolved_path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["legacy_url", "reason"])
        for r in resolved:
            if not r.get("tmdb_id"):
                w.writerow([r["original"], r.get("reason", r.get("kind"))])
    (out_dir / "resolved.jsonl").write_text(
        "\n".join(json.dumps(r) for r in resolved), encoding="utf-8"
    )
    print(f"resolve: done. map={map_path} unresolved={unresolved_path}")
    return 0


# ---------------------------------------------------------------- report
def report(args: argparse.Namespace) -> int:
    out_dir = Path(args.out_dir)
    map_path = out_dir / "redirect_map.csv"
    unresolved_path = out_dir / "unresolved.csv"
    if map_path.exists():
        rows = list(csv.DictReader(map_path.open(encoding="utf-8")))
        print(f"redirect_map: {len(rows)} rows")
        for t in ("movie", "tv"):
            n = sum(1 for r in rows if r["tmdb_type"] == t)
            print(f"  {t}: {n}")
        hi = sum(1 for r in rows if float(r["confidence"] or 0) >= 1.0)
        print(f"  exact-title matches: {hi}")
    if unresolved_path.exists():
        n = sum(1 for _ in unresolved_path.open(encoding="utf-8")) - 1
        print(f"unresolved: {max(n, 0)} rows")
    return 0


# ---------------------------------------------------------------- misc
def parse_debug(args: argparse.Namespace) -> int:
    print(json.dumps(slug_candidates(args.url), indent=2, default=str))
    return 0


def selftest() -> int:
    cases = [
        ("10-cloverfield-lane-2016-720p-hindi-brrip-dual-audio-full-movie-download",
         "10 cloverfield lane", 2016),
        ("2012-2009-720p-brrip-dual-audio-english-hindi-full-movie-download",
         "2012", 2009),
        ("9-2009-720p-bluray-x264-full-movie-download", "9", 2009),
        ("18-american-pie-1999-720p-hindi-dubbed-full-movie-download",
         "american pie", 1999),
        ("12-rounds-2009-unrated-720p-bluray-x264-hindi-dual-audio-full-movie-download",
         "12 rounds", 2009),
        ("2-fast-2-furious-2003-1080p-bluray-x265-dual-audio-full-movie-download",
         "2 fast 2 furious", 2003),
        ("300-movies/300-2006-720p-bluray-full-movie-download", "300", 2006),
        ("18-movies/18-the-evil-dead-1981-hindi-dubbed-480p-full-movie-download",
         "the evil dead", 1981),
        ("the-dark-knight-rises-2012-hindi-dubbed-brrip-720p-full-movie-download",
         "the dark knight rises", 2012),
    ]
    fails = 0
    for slug, want_title, want_year in cases:
        got = slug_candidates(slug)
        title = " ".join(got.get("title") or [])
        if got.get("candidates") is None:
            pass
        ok = title == want_title and got.get("year") == want_year
        print(("PASS " if ok else "FAIL ") + slug[:70])
        if not ok:
            print("   got:", json.dumps(got, default=str))
            fails += 1
    specials = [
        ("9xplay.php?url=abc", "player"),
        ("1059", "paged"),
        ("18-movies/feed/", "empty"),
    ]
    for slug, kind in specials:
        got = slug_candidates(slug)
        ok = got["kind"] == kind
        print(("PASS " if ok else "FAIL ") + slug[:70])
        if not ok:
            print("   got:", json.dumps(got, default=str))
            fails += 1
    print("selftest:", "OK" if fails == 0 else f"{fails} FAILURES")
    return 0 if fails == 0 else 1


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="archive_recover.py", description=__doc__)
    ap.add_argument("--out-dir", default=DEFAULT_OUT_DIR)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("collect", help="Wayback CDX -> cdx.jsonl")
    p.add_argument("--site", default="extramovies.org")
    p.add_argument("--start-year", type=int, default=2016)
    p.add_argument("--end-year", type=int, default=2026)
    p.add_argument("--page-size", type=int, default=50000)
    p.set_defaults(fn=collect)

    p = sub.add_parser("parse", help="debug one slug")
    p.add_argument("url")
    p.set_defaults(fn=parse_debug)

    p = sub.add_parser("resolve", help="cdx.jsonl -> redirect map")
    p.add_argument("--tmdb-key", default=os.environ.get("TMDB_API_KEY", ""))
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--workers", type=int, default=4)
    p.add_argument("--reset-cache", action="store_true", dest="reset_cache",
                   help="drop tmdb_cache.json first (invalidates poisoned results)")
    p.set_defaults(fn=resolve)

    p = sub.add_parser("report", help="counts over the redirect map")
    p.set_defaults(fn=report)

    sub.add_parser("selftest", help="parser assertions (no network)")
    ap.set_defaults(fn=None)

    args = ap.parse_args(argv)
    if args.cmd == "selftest":
        return selftest()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
