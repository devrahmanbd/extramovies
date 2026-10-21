#!/usr/bin/env python3
"""backlink_rescue.py — turn a backlink export into an owner outreach list.

Reads a Semrush-style "referring domains" export (one row per source domain)
and classifies every URL those domains link to on our site:

  TAXONOMY            /cast/<slug>/, /director/<slug>/, /category/<slug>/ for an
                      entity the site publishes. The legacy router already
                      answers 301 for those, so the link carries authority again.
                      Recovered automatically, no outreach.
  REVIEW_OR_HUB       a page the site serves today (root, review, movie page,
                      static asset). Fine, no outreach.
  DOWNLOAD_OR_PLAYER  a pirate download or player path (/online.php?link=...,
                      other .php endpoints, a download-quality slug). These must
                      never come back. Excluded from outreach.
  DEAD_OTHER          a path that still 404s or 410s. These are the outreach
                      targets: the script looks for the best live replacement on
                      our site (same title, same person, same film) and drafts
                      the ask. When there is no honest replacement the row is
                      flagged as no-replacement instead of inventing one.

Outputs (both under data/legacy/, which is gitignored):

  data/legacy/backlink_rescue.csv           one row per (source domain, target)
      source_domain, source_url, our_dead_target, dead_status, category,
      live_replacement, recommended_action, note

  data/legacy/backlink_outreach_drafts.csv  the outreach target rows
      source_domain, contact_page, our_target_url, email_draft_subject,
      email_draft_body, note

This script never leaves the machine. It reads local files only, makes no
HTTP request of any kind (no import of urllib.request, no sockets), sends no
mail, and touches no third-party site. Stdlib only, no pip installs.

The live-page index is built from the site's own local sources — the seed
corpus, the admin store and the DEMO pack — so "is this page live?" is
answered from the same corpus the pages are built from. An optional
--sitemap points at a local sitemap.xml snapshot when the owner wants to match
against a published sitemap instead.

Usage:
  python3 scripts/seo/backlink_rescue.py
  python3 scripts/seo/backlink_rescue.py \\
      --csv data/legacy/semrush-referring-domains-2026-10-21.csv \\
      --out data/legacy/backlink_rescue.csv \\
      --outreach data/legacy/backlink_outreach_drafts.csv \\
      --site-url https://extramovies.org --site extramovies

Exit codes: 0 ok, 1 input error, 2 usage error.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import unicodedata
from pathlib import Path
from urllib.parse import urlsplit

REPO_ROOT = Path(__file__).resolve().parents[2]

# --------------------------------------------------------------------------
# Classification vocabulary
# --------------------------------------------------------------------------

CAT_TAXONOMY = "TAXONOMY"
CAT_REVIEW_OR_HUB = "REVIEW_OR_HUB"
CAT_DOWNLOAD_OR_PLAYER = "DOWNLOAD_OR_PLAYER"
CAT_DEAD_OTHER = "DEAD_OTHER"

CATEGORY_ORDER = [CAT_TAXONOMY, CAT_REVIEW_OR_HUB, CAT_DOWNLOAD_OR_PLAYER, CAT_DEAD_OTHER]

STATUS_LIVE = "live"
STATUS_301 = "301"
STATUS_404 = "404"
STATUS_410 = "410"
STATUS_UNKNOWN = "unknown"

RESCUE_COLUMNS = [
    "source_domain",
    "source_url",
    "our_dead_target",
    "dead_status",
    "category",
    "live_replacement",
    "recommended_action",
    "note",
]

OUTREACH_COLUMNS = [
    "source_domain",
    "contact_page",
    "our_target_url",
    "email_draft_subject",
    "email_draft_body",
    "note",
]

# The site's taxonomy axes (src/lib/legacy/taxonomy-path.ts).
TAXONOMY_KINDS = ("cast", "director", "category")

# The legacy shell: category prefixes the old WordPress site used. Mirrors
# CATEGORY_RE in src/lib/legacy/router.ts so a path is read the same way the
# router reads it.
CATEGORY_RE = re.compile(
    r"^(?:\d+(?:mb)?-movies|movies|movie|web-series|webseries|tv-shows|tv|series"
    r"|dual-audio-movies|hindi-dubbed-movies|south-movies|punjabi-movies|hindi-movies"
    r"|bollywood-movies|hollywood-movies|adult-movies)$"
)
PAGINATION_RE = re.compile(r"^page/(\d+)$")

# Static assets the legacy archive must never answer (mirrors the router).
ASSET_EXTENSIONS = {
    "txt", "xml", "ico", "svg", "png", "jpg", "jpeg", "webp", "avif", "gif",
    "css", "js", "json", "woff", "woff2", "pdf", "mp4", "webm",
}
ASSET_NAMESPACES = {
    "brand", "uploads", "assets", "images", "img", "media",
    "css", "js", "fonts", "static", "_astro", "vendor", ".well-known",
}

# Download / player markers. A legacy path carrying one of these is a pirate
# download page: it must keep answering 404 or 410, never a page.
DOWNLOAD_TOKENS = {
    "720p", "1080p", "480p", "2160p", "4k", "bluray", "blueray", "bdrip",
    "brrip", "hdrip", "webrip", "webdl", "hdcam", "dvdrip", "dvd", "hd",
    "hq", "cam", "ts", "tc", "mkv", "mp4", "avi", "x264", "x265", "h264",
    "h265", "esubs", "subs", "subtitles", "subtitle", "dualaudio",
    "dual", "dubbed", "english", "hindidubbed", "tamil", "telugu",
    "download", "downloading", "watchonline", "freedownload", "fullmovie",
    "full", "online", "streaming", "rip", "print", "srt",
}

# Words that carry no signal when matching a legacy slug to a live page.
STOPWORDS = {
    "the", "and", "for", "with", "from", "that", "this", "a", "an", "of",
    "to", "in", "on", "at", "is", "it", "by", "or", "as", "vs", "part",
    "movie", "movies", "film", "films", "review", "reviews", "watch",
    "free", "new", "best", "good",
}

# Tokens that must never be used on their own to justify a replacement match.
WEAK_TOKENS = {"movie", "movies", "film", "films", "review", "reviews", "watch", "free"}


def log(message: str) -> None:
    """Loud but non-fatal note on stderr."""
    print(f"backlink_rescue: {message}", file=sys.stderr)


def die(message: str, code: int = 1) -> None:
    print(f"backlink_rescue: {message}", file=sys.stderr)
    raise SystemExit(code)


# --------------------------------------------------------------------------
# Legacy path handling (mirrors src/lib/legacy/router.ts)
# --------------------------------------------------------------------------


def normalize_legacy_path(path: str) -> str:
    """The router's normalization: strip query/fragment, case, category shell."""
    p = path or ""
    p = p.split("?")[0].split("#")[0].lower().strip()
    if p in ("", "/"):
        return ""
    parts = [seg for seg in p.split("/") if seg]
    while parts and (CATEGORY_RE.match(parts[0]) or PAGINATION_RE.match(parts[0])):
        parts.pop(0)
    while parts and parts[-1] in ("feed", "comment", "comments"):
        parts.pop()
    return "/" + "/".join(parts) if parts else ""


def is_asset_exempt(norm: str) -> bool:
    """True for a live site asset (the router passes those through)."""
    parts = [seg for seg in norm.split("/") if seg]
    if not parts:
        return False
    if len(parts) == 1:
        dot = parts[0].rfind(".")
        if dot <= 0:
            return False
        return parts[0][dot + 1:] in ASSET_EXTENSIONS
    return parts[0] in ASSET_NAMESPACES


def taxonomy_shape(path: str) -> tuple[str, str] | None:
    """('/cast', 'slug') for a taxonomy path, else None."""
    parts = [seg for seg in (path or "").strip("/").split("/") if seg]
    if len(parts) != 2:
        return None
    kind, slug = parts[0].lower(), parts[1].lower()
    if kind not in TAXONOMY_KINDS:
        return None
    if not re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", slug):
        return None
    return kind, slug


def slugify_taxonomy(value: str) -> str:
    """The site's taxonomy slug rule (src/lib/seo/taxonomy.ts)."""
    if not isinstance(value, str):
        return ""
    text = unicodedata.normalize("NFKD", value)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("\u2018", "").replace("\u2019", "").replace("\u02bc", "")
    text = text.replace("'", "").replace("`", "")
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def path_tokens(path: str) -> list[str]:
    """Meaningful tokens of a legacy path, download noise removed."""
    norm = normalize_legacy_path(path)
    if not norm:
        return []
    raw = [seg for seg in norm.split("/") if seg]
    tokens: list[str] = []
    for seg in raw:
        for piece in re.split(r"[-_.]+", seg.lower()):
            if not piece:
                continue
            if piece in DOWNLOAD_TOKENS or piece in STOPWORDS:
                continue
            if piece.isdigit():
                continue
            tokens.append(piece)
    return tokens


def looks_like_download(path: str, query: str) -> bool:
    """True for a pirate download or player path."""
    lowered = (path or "").lower()
    if lowered.endswith(".php") or ".php/" in lowered:
        return True
    if "link=" in (query or "").lower():
        return True
    for seg in re.split(r"[-_/]+", lowered):
        if seg in DOWNLOAD_TOKENS:
            return True
    return False


# --------------------------------------------------------------------------
# The live-page index, built from the site's own local corpus
# --------------------------------------------------------------------------


class LiveIndex:
    """What the site publishes right now, derived from local files only."""

    def __init__(self) -> None:
        self.reviews: dict[str, dict] = {}       # slug -> review row
        self.taxonomy: dict[str, dict] = {}      # "kind/slug" -> {label, count}
        self.movie_pages: dict[int, dict] = {}   # tmdb id -> review row
        self.sitemap_urls: set[str] = set()      # extra live URLs from a sitemap
        self.sources: list[str] = []             # provenance, for the log

    def add_review(self, row: dict) -> None:
        slug = (row.get("slug") or "").strip()
        if not slug:
            return
        self.reviews.setdefault(slug, row)
        tmdb = row.get("tmdbId")
        if isinstance(tmdb, int) and tmdb > 0:
            self.movie_pages.setdefault(tmdb, row)
        for name in row.get("cast") or []:
            self._add_taxonomy("cast", name)
        for name in row.get("directors") or []:
            self._add_taxonomy("director", name)
        for name in row.get("genres") or []:
            self._add_taxonomy("category", name)

    def _add_taxonomy(self, kind: str, name: str) -> None:
        label = re.sub(r"\s+", " ", str(name or "")).strip()
        if not label:
            return
        slug = slugify_taxonomy(label)
        if not slug:
            return
        key = f"{kind}/{slug}"
        entry = self.taxonomy.setdefault(key, {"kind": kind, "slug": slug, "label": label, "count": 0})
        entry["count"] += 1

    def has_taxonomy(self, kind: str, slug: str) -> bool:
        if f"{kind}/{slug}" in self.taxonomy:
            return True
        return f"/{kind}/{slug}" in self.sitemap_urls

    def taxonomy_count(self, kind: str, slug: str) -> int:
        entry = self.taxonomy.get(f"{kind}/{slug}")
        return entry["count"] if entry else 0

    def review_slugs(self) -> set[str]:
        return set(self.reviews)


def parse_frontmatter(text: str) -> dict:
    """Minimal frontmatter reader: `key: value`, quoted strings, JSON arrays."""
    out: dict = {}
    if not text.startswith("---"):
        return out
    lines = text.splitlines()
    for line in lines[1:]:
        if line.strip() == "---":
            break
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        if value.startswith("["):
            try:
                out[key] = json.loads(value)
            except (ValueError, TypeError):
                out[key] = []
        elif len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            out[key] = value[1:-1]
        else:
            out[key] = value
    return out


def load_seed_reviews(site: str) -> list[dict]:
    """Published reviews from the shipped seed corpus (seeds/<site>/*.md)."""
    seeds_dir = REPO_ROOT / "seeds" / site
    rows: list[dict] = []
    if not seeds_dir.is_dir():
        return rows
    for path in sorted(seeds_dir.glob("*.md")):
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            log(f"seed unreadable, skipped: {path}")
            continue
        meta = parse_frontmatter(text)
        slug = (meta.get("slug") or path.stem).strip()
        cast = meta.get("movie_cast") or []
        genres = meta.get("movie_genres") or []
        director = meta.get("movie_director") or ""
        tmdb = meta.get("tmdb_id")
        rows.append(
            {
                "slug": slug,
                "reviewTitle": meta.get("title") or slug,
                "movieTitle": meta.get("movie_title") or slug,
                "year": meta.get("movie_year"),
                "genres": [str(g) for g in genres if str(g).strip()],
                "directors": [d.strip() for d in str(director).split(",") if d.strip()],
                "cast": [str(c) for c in cast if str(c).strip()],
                "tmdbId": int(tmdb) if str(tmdb or "").isdigit() else None,
                "origin": f"seed:{path.name}",
            }
        )
    return rows


def _scan_ts_value(text: str, i: int):
    """Read one JS/TS literal value at text[i]; returns (value, next_index)."""
    while i < len(text) and text[i] in " \t\r\n":
        i += 1
    if i >= len(text):
        return None, i
    ch = text[i]
    if ch in "\"'":
        quote = ch
        i += 1
        buf = []
        while i < len(text):
            if text[i] == "\\" and i + 1 < len(text):
                buf.append(text[i + 1])
                i += 2
                continue
            if text[i] == quote:
                i += 1
                break
            buf.append(text[i])
            i += 1
        return "".join(buf), i
    if ch == "[":
        items = []
        i += 1
        while i < len(text):
            while i < len(text) and text[i] in " \t\r\n,":
                i += 1
            if i < len(text) and text[i] == "]":
                return items, i + 1
            value, i = _scan_ts_value(text, i)
            items.append(value)
        return items, i
    if ch == "{":
        obj, i = _scan_ts_object(text, i)
        return obj, i
    start = i
    while i < len(text) and text[i] not in ",}\n":
        i += 1
    raw = text[start:i].strip()
    try:
        return int(raw), i
    except ValueError:
        return raw, i


def _scan_ts_object(text: str, i: int):
    """Read a JS object literal at text[i]; returns (dict, next_index)."""
    obj: dict = {}
    i += 1  # skip '{'
    while i < len(text):
        while i < len(text) and text[i] in " \t\r\n,":
            i += 1
        if i >= len(text):
            break
        if text[i] == "}":
            return obj, i + 1
        start = i
        while i < len(text) and (text[i].isalnum() or text[i] in "_$"):
            i += 1
        key = text[start:i]
        while i < len(text) and text[i] in " \t\r\n":
            i += 1
        if i < len(text) and text[i] == ":":
            i += 1
            value, i = _scan_ts_value(text, i)
            if key:
                obj.setdefault(key, value)
        else:
            i += 1
    return obj, i


def load_demo_reviews() -> list[dict]:
    """Published DEMO rows from src/lib/seo/content.ts (the shared pack)."""
    path = REPO_ROOT / "src" / "lib" / "seo" / "content.ts"
    if not path.is_file():
        return []
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return []
    marker = "DEMO_REVIEWS"
    at = text.find(marker)
    if at < 0:
        return []
    # Skip the type annotation (`PublicReview[]`) and find the array literal.
    assign = text.find("=", at)
    bracket = text.find("[", assign if assign > 0 else at)
    if bracket < 0:
        return []
    rows: list[dict] = []
    i = bracket + 1
    while i < len(text):
        while i < len(text) and text[i] in " \t\r\n,":
            i += 1
        if i >= len(text):
            break
        if text[i] == "]":
            break
        if text[i] != "{":
            i += 1
            continue
        obj, i = _scan_ts_object(text, i)
        slug = obj.get("slug")
        if not isinstance(slug, str) or not slug:
            continue
        director = obj.get("director")
        rows.append(
            {
                "slug": slug,
                "reviewTitle": obj.get("reviewTitle") or slug,
                "movieTitle": obj.get("movieTitle") or slug,
                "year": obj.get("year"),
                "genres": [str(g) for g in (obj.get("genres") or []) if str(g).strip()],
                "directors": [d.strip() for d in str(director or "").split(",") if d.strip()],
                "cast": [str(c) for c in (obj.get("cast") or []) if str(c).strip()],
                "tmdbId": obj.get("tmdbId") if isinstance(obj.get("tmdbId"), int) else None,
                "origin": "demo",
            }
        )
    return rows


def load_store_reviews(site: str) -> list[dict]:
    """Published rows of the local admin store (data/reviews.json)."""
    path = REPO_ROOT / "data" / "reviews.json"
    if not path.is_file():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        log(f"store unreadable, ignored: {exc}")
        return []
    rows = raw if isinstance(raw, list) else raw.get("reviews", [])
    out: list[dict] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        if str(row.get("status", "")).lower() != "published":
            continue
        sites = row.get("sites")
        if isinstance(sites, list) and sites and site not in sites:
            continue
        movie = row.get("movie") or {}
        if not isinstance(movie, dict):
            movie = {}
        tmdb = row.get("tmdbId")
        out.append(
            {
                "slug": (row.get("slug") or "").strip(),
                "reviewTitle": row.get("title") or row.get("slug") or "",
                "movieTitle": movie.get("title") or row.get("title") or "",
                "year": movie.get("year"),
                "genres": [str(g) for g in (movie.get("genres") or []) if str(g).strip()],
                "directors": [d.strip() for d in str(movie.get("director") or "").split(",") if d.strip()],
                "cast": [str(c) for c in (movie.get("cast") or []) if str(c).strip()],
                "tmdbId": int(tmdb) if isinstance(tmdb, int) else None,
                "origin": "store",
            }
        )
    return out


def load_sitemap_urls(path: Path) -> set[str]:
    """URL paths of a local sitemap.xml snapshot."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        log(f"sitemap unreadable, ignored: {exc}")
        return set()
    urls: set[str] = set()
    for match in re.finditer(r"<loc>\s*([^<\s]+)\s*</loc>", text):
        loc = match.group(1).strip()
        parts = urlsplit(loc)
        if parts.path:
            urls.add(parts.path.rstrip("/") or "/")
    return urls


def build_live_index(site: str, sitemap: Path | None) -> LiveIndex:
    """The live-page index: store rows win over seeds, seeds over DEMO."""
    index = LiveIndex()
    merged: dict[str, dict] = {}
    for row in load_demo_reviews():
        merged[row["slug"]] = row
    for row in load_seed_reviews(site):
        merged[row["slug"]] = row
    for row in load_store_reviews(site):
        merged[row["slug"]] = row
    for slug in sorted(merged):
        index.add_review(merged[slug])
    if sitemap is not None:
        index.sitemap_urls = load_sitemap_urls(sitemap)
    index.sources = [
        f"{len(load_demo_reviews())} demo rows",
        f"{len(load_seed_reviews(site))} seed rows",
        f"{len(load_store_reviews(site))} store rows",
    ]
    return index


# --------------------------------------------------------------------------
# The export
# --------------------------------------------------------------------------

EXPORT_COLUMNS = {"domain", "links_to_us", "target_url", "legacy_target", "note"}


def note_fields(note: str) -> dict:
    """Split the export's note field into its key=value parts."""
    out: dict[str, str] = {}
    for chunk in (note or "").split("; "):
        if "=" not in chunk:
            continue
        key, _, value = chunk.partition("=")
        key = key.strip()
        if key not in out:
            out[key] = value.strip()
    return out


def export_targets(row: dict) -> list[str]:
    """Every URL of our site the row links to (primary target + also= list)."""
    targets = [row.get("target_url", "").strip()]
    also = note_fields(row.get("note", "")).get("also", "")
    if also:
        targets += [part.strip() for part in also.split(" | ") if part.strip()]
    seen: list[str] = []
    for target in targets:
        if target and target not in seen:
            seen.append(target)
    return seen


def export_sources(row: dict) -> list[str]:
    """The linking pages on the source site (the src= list)."""
    src = note_fields(row.get("note", "")).get("src", "")
    if not src:
        return []
    seen: list[str] = []
    for part in (p.strip() for p in src.split(" | ")):
        if part and part not in seen:
            seen.append(part)
    return seen


def read_export(path: Path) -> list[dict]:
    """Read the referring-domain export; malformed rows are skipped loudly."""
    if not path.is_file():
        die(f"input not found: {path}")
    rows: list[dict] = []
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            die(f"input has no header row: {path}")
        missing = EXPORT_COLUMNS - set(reader.fieldnames)
        if missing:
            die(f"input is missing column(s): {', '.join(sorted(missing))}")
        for number, raw in enumerate(reader, start=2):
            domain = (raw.get("domain") or "").strip()
            if not domain:
                log(f"row {number}: no domain, skipped")
                continue
            try:
                links = int(str(raw.get("links_to_us") or "0").strip() or 0)
            except ValueError:
                log(f"row {number}: links_to_us is not a number, counted as 0")
                links = 0
            rows.append(
                {
                    "domain": domain,
                    "links": links,
                    "target_url": (raw.get("target_url") or "").strip(),
                    "legacy": (raw.get("legacy_target") or "").strip().lower(),
                    "note": raw.get("note") or "",
                }
            )
    return rows


# --------------------------------------------------------------------------
# Classification
# --------------------------------------------------------------------------


class Verdict:
    __slots__ = ("category", "status", "replacement", "action", "note")

    def __init__(self, category: str, status: str, replacement: str = "", action: str = "", note: str = ""):
        self.category = category
        self.status = status
        self.replacement = replacement
        self.action = action
        self.note = note


def our_hosts(site_url: str) -> tuple[str, str]:
    """(apex host, www host) for the brand's canonical URL."""
    parts = urlsplit(site_url if "//" in site_url else f"//{site_url}")
    host = (parts.hostname or "").lower()
    apex = host[4:] if host.startswith("www.") else host
    return apex, f"www.{apex}"


def absolute(site_url: str, path: str) -> str:
    """Absolute URL for a site-relative path."""
    base = site_url.rstrip("/")
    if not path or path == "/":
        return base + "/"
    return base + "/" + path.lstrip("/")


def find_replacement(
    path: str,
    index: LiveIndex,
    site_url: str,
    redirect_map: dict[str, str],
) -> tuple[str, str]:
    """Best live replacement for a dead path: (url, reason). Empty when none."""
    norm = normalize_legacy_path(path)
    if norm in redirect_map:
        target = redirect_map[norm]
        return absolute(site_url, target), "the owner's redirect table maps this path"

    tokens = [t for t in path_tokens(path) if t not in WEAK_TOKENS]
    if not tokens:
        return "", ""
    best: tuple[int, int, str, str] = (0, 0, "", "")  # score, count, url, reason
    for slug in sorted(index.review_slugs()):
        review = index.reviews[slug]
        title_tokens = set(path_tokens("/" + slug))
        title_tokens |= set(path_tokens("/" + re.sub(r"[^a-z0-9]+", "-", str(review.get("movieTitle", "")).lower())))
        hits = [t for t in tokens if t in title_tokens]
        if not hits:
            continue
        strong = [t for t in hits if t not in WEAK_TOKENS]
        if not strong:
            continue
        score = len(strong)
        url = absolute(site_url, f"/reviews/{slug}")
        if score > best[0] or (score == best[0] and best[0] and url < best[2]):
            best = (score, 1, url, f"same title as our review '{review.get('reviewTitle') or slug}'")
    for tmdb in sorted(index.movie_pages):
        review = index.movie_pages[tmdb]
        title_tokens = set(path_tokens("/" + re.sub(r"[^a-z0-9]+", "-", str(review.get("movieTitle", "")).lower())))
        hits = [t for t in tokens if t in title_tokens and t not in WEAK_TOKENS]
        if not hits:
            continue
        score = len(hits)
        url = absolute(site_url, f"/movies/{tmdb}")
        if score > best[0]:
            best = (score, 1, url, f"same film as our review '{review.get('reviewTitle') or slug}'")
    for key in sorted(index.taxonomy):
        entry = index.taxonomy[key]
        label_tokens = set(path_tokens("/" + slugify_taxonomy(entry["label"])))
        hits = [t for t in tokens if t in label_tokens and t not in WEAK_TOKENS]
        if not hits:
            continue
        score = len(hits)
        url = absolute(site_url, f"/{entry['kind']}/{entry['slug']}")
        if score > best[0]:
            best = (score, 1, url, f"same person/genre as our {entry['kind']} page '{entry['label']}'")
    if best[0] <= 0:
        return "", ""
    return best[2], best[3]


def classify(
    target_url: str,
    index: LiveIndex,
    site_url: str,
    redirect_map: dict[str, str],
    unresolved: set[str],
) -> Verdict:
    """Classify one URL of our site a source domain links to."""
    parts = urlsplit(target_url)
    host = (parts.hostname or "").lower()
    path = parts.path or "/"
    query = parts.query or ""
    apex, www = our_hosts(site_url)

    if host and apex and host not in (apex, www):
        # Not a link to our site. Reported apart, never queued for outreach.
        return Verdict("", STATUS_UNKNOWN, "", "", f"the target is on another host ({host})")

    scheme = (parts.scheme or "https").lower()
    host_note = ""
    if host in (www,) or scheme == "http":
        host_note = "the canonical host is https://%s/ (the site answers 301)" % apex

    norm = normalize_legacy_path(path)
    if not norm:
        # Site root. Live, but the http / www copies answer 301 first.
        if host_note:
            return Verdict(CAT_REVIEW_OR_HUB, STATUS_301, absolute(site_url, "/"), "no action: the link reaches our home page through the canonical redirect", host_note)
        return Verdict(CAT_REVIEW_OR_HUB, STATUS_LIVE, absolute(site_url, "/"), "no action: the link points at our live home page", "")

    if is_asset_exempt(norm):
        return Verdict(CAT_REVIEW_OR_HUB, STATUS_LIVE, absolute(site_url, norm), "no action: the link points at a live static file on our site", "")

    shape = taxonomy_shape(norm)
    if shape:
        kind, slug = shape
        if index.has_taxonomy(kind, slug):
            count = index.taxonomy_count(kind, slug)
            url = absolute(site_url, f"/{kind}/{slug}")
            note = f"the legacy router answers 301 to this live {kind} page ({count} review(s) behind it)"
            if count and count < 2:
                note += "; the page exists but is noindex, follow"
            return Verdict(CAT_TAXONOMY, STATUS_301, url, "no outreach: the 301 already carries this link's authority to the live page", note)
        label = slug.replace("-", " ")
        if kind == "category":
            action = (
                f"leave dead on purpose: our category axis is genres only; publish a review filed "
                f"under '{label}' only if we honestly review such a film; no outreach yet"
            )
            note = (
                f"the site publishes no category page for '{label}'; a dubbing or audio-track "
                f"facet is not a genre we hold, so the path stays dead"
            )
        else:
            action = (
                f"content first: publish a review that names '{label}' and the router will 301 "
                f"this path automatically; no outreach yet"
            )
            note = f"the site publishes no {kind} page for '{label}', so the path stays dead"
        return Verdict(
            CAT_DEAD_OTHER,
            STATUS_410 if norm in unresolved else STATUS_404,
            "",
            action,
            note,
        )

    if looks_like_download(path, query):
        return Verdict(
            CAT_DOWNLOAD_OR_PLAYER,
            STATUS_410 if norm in unresolved else STATUS_404,
            "",
            "do not resurrect: never serve this path and never link to it; excluded from outreach",
            "pirate download or player path",
        )

    if norm in redirect_map:
        target = redirect_map[norm]
        return Verdict(CAT_DEAD_OTHER, STATUS_301, absolute(site_url, target), "ask the webmaster to update the link to the mapped page", "the owner's redirect table maps this path")

    # A review, movie or hub page the site serves today.
    if norm in index.review_slugs() or norm.startswith("/reviews/"):
        slug = norm[len("/reviews/"):] if norm.startswith("/reviews/") else norm
        if slug in index.review_slugs():
            return Verdict(CAT_REVIEW_OR_HUB, STATUS_LIVE, absolute(site_url, f"/reviews/{slug}"), "no action: the link points at a live review on our site", "")
    movie = re.match(r"^/(?:movies|series)/(\d+)$", norm)
    if movie and int(movie.group(1)) in index.movie_pages:
        return Verdict(CAT_REVIEW_OR_HUB, STATUS_LIVE, absolute(site_url, norm), "no action: the link points at a live movie page on our site", "")
    if norm in ("/about", "/contact", "/reviews", "/movies", "/search", "/llms.txt", "/rss.xml"):
        return Verdict(CAT_REVIEW_OR_HUB, STATUS_LIVE, absolute(site_url, norm), "no action: the link points at a live page on our site", "")

    replacement, reason = find_replacement(path, index, site_url, redirect_map)
    if replacement:
        return Verdict(
            CAT_DEAD_OTHER,
            STATUS_301 if norm in redirect_map else (STATUS_410 if norm in unresolved else STATUS_404),
            replacement,
            "ask the webmaster to update the link to the live page we publish for this",
            reason,
        )
    return Verdict(
        CAT_DEAD_OTHER,
        STATUS_410 if norm in unresolved else STATUS_404,
        "",
        "no live replacement: we publish no page for this target; content first, no outreach yet",
        "nothing on our site matches this path (no same title, person or film)",
    )


# --------------------------------------------------------------------------
# Local legacy tables (the owner's redirect map and the archive's gone list)
# --------------------------------------------------------------------------


def read_legacy_tables() -> tuple[dict[str, str], set[str]]:
    """(redirect map, unresolved paths) from data/legacy/ when present."""
    redirect_map: dict[str, str] = {}
    unresolved: set[str] = set()
    map_path = REPO_ROOT / "data" / "legacy" / "redirect_map.csv"
    unres_path = REPO_ROOT / "data" / "legacy" / "unresolved.csv"
    if map_path.is_file():
        try:
            with map_path.open(newline="", encoding="utf-8") as handle:
                for row in csv.reader(handle):
                    if len(row) < 2 or row[0] == "legacy_path":
                        continue
                    target = row[1].strip()
                    norm = normalize_legacy_path(row[0])
                    if not norm:
                        continue
                    if target == "/410":
                        unresolved.add(norm)
                    elif target and target != "/":
                        redirect_map[norm] = target
        except OSError as exc:
            log(f"redirect map unreadable, ignored: {exc}")
    if unres_path.is_file():
        try:
            with unres_path.open(newline="", encoding="utf-8") as handle:
                for row in csv.reader(handle):
                    if len(row) < 2 or row[0] == "legacy_url":
                        continue
                    norm = normalize_legacy_path(row[0])
                    if norm:
                        unresolved.add(norm)
        except OSError as exc:
            log(f"unresolved list unreadable, ignored: {exc}")
    return redirect_map, unresolved


# --------------------------------------------------------------------------
# Outreach copy
# --------------------------------------------------------------------------


def domain_signal(domain: str, sources: list[str]) -> str:
    """A short read on whether the domain is worth a message."""
    blob = (" ".join(sources) + " " + domain).lower()
    markers = ("download", "720p", "1080p", "bluray", "hdrip", "webrip", "dual-audio",
               "esubs", "dubbed", "hdcam", "dvdrip", "mkv")
    for marker in markers:
        if marker in blob:
            return "low: the linking pages are pirate download pages (expect no reply)"
    return "possible"


def draft_email(
    site_name: str,
    site_url: str,
    old_url: str,
    new_url: str,
    replacement_reason: str,
) -> tuple[str, str]:
    """(subject, body) for one outreach row. Honest, short, our links only."""
    if new_url:
        subject = f"Link update on {site_name}: {old_url}"
        body = (
            f"Hi,\n"
            f"\n"
            f"We run {site_name}, an independent film-review magazine. The page you linked to "
            f"has moved on our site. It is the same content, only the address changed:\n"
            f"\n"
            f"old: {old_url}\n"
            f"new: {new_url}\n"
            f"\n"
            f"Could you update the link? It takes a moment and it keeps the reference working.\n"
            f"\n"
            f"Thanks,\n"
            f"{site_name}\n"
            f"{site_url}/about"
        )
        return subject, body
    subject = f"An outdated link to {site_name}"
    body = (
        f"Hi,\n"
        f"\n"
        f"We run {site_name}, an independent film-review magazine. A link on your site points to "
        f"{old_url}, a page we no longer publish. We do not have a page that replaces it, so we "
        f"would rather tell you than leave you guessing.\n"
        f"\n"
        f"If you would like to keep a link to us, our reviews live at {site_url}/reviews/ and our "
        f"home page is {site_url}/. If the link is in the way, please feel free to remove it.\n"
        f"\n"
        f"Thanks,\n"
        f"{site_name}\n"
        f"{site_url}/about"
    )
    return subject, body


# --------------------------------------------------------------------------
# Output
# --------------------------------------------------------------------------


def write_csv(path: Path, columns: list[str], rows: list[dict]) -> None:
    """Write a CSV with a fixed column order (deterministic, byte-stable)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow({col: row.get(col, "") for col in columns})


def build_rows(
    export: list[dict],
    index: LiveIndex,
    site_url: str,
    site_name: str,
    redirect_map: dict[str, str],
    unresolved: set[str],
) -> tuple[list[dict], list[dict]]:
    """The rescue rows and the outreach rows."""
    rescue: list[dict] = []
    outreach: list[dict] = []
    for row in export:
        domain = row["domain"]
        sources = export_sources(row)
        source_url = " | ".join(sources) if sources else ""
        fields = note_fields(row["note"])
        kinds = fields.get("legacyTargets", "")
        kinds = kinds.split(" ", 1)[1].strip("()") if " " in kinds else ""
        for target in export_targets(row):
            verdict = classify(target, index, site_url, redirect_map, unresolved)
            if not verdict.category:
                log(f"{domain}: skipped a target that is not on our site: {target}")
                continue
            note_parts = [
                f"{row['links']} link(s) from this domain",
            ]
            if kinds:
                note_parts.append(f"export kinds: {kinds}")
            if fields.get("first"):
                note_parts.append(f"first seen {fields['first']}, last seen {fields.get('last', '?')}")
            if fields.get("LOST"):
                note_parts.append("export marks the link as lost")
            if verdict.note:
                note_parts.append(verdict.note)
            note = "; ".join(note_parts)

            rescue.append(
                {
                    "source_domain": domain,
                    "source_url": source_url,
                    "our_dead_target": target,
                    "dead_status": verdict.status,
                    "category": verdict.category,
                    "live_replacement": verdict.replacement,
                    "recommended_action": verdict.action,
                    "note": note,
                }
            )

            if verdict.category != CAT_DEAD_OTHER:
                continue
            signal = domain_signal(domain, sources)
            subject, body = draft_email(site_name, site_url, target, verdict.replacement, verdict.note)
            if verdict.replacement:
                action = "ACTION: send - a live page replaces this target"
            else:
                action = "ACTION: skip - no replacement on our site; content first"
            outreach.append(
                {
                    "source_domain": domain,
                    "contact_page": "",
                    "our_target_url": target,
                    "email_draft_subject": subject,
                    "email_draft_body": body,
                    "note": f"{action}; {signal}; {verdict.note}",
                }
            )
    return rescue, outreach


def sort_rows(rows: list[dict]) -> list[dict]:
    """Stable order: category, then domain, then target."""
    def key(row: dict):
        cat = row.get("category", "")
        order = CATEGORY_ORDER.index(cat) if cat in CATEGORY_ORDER else len(CATEGORY_ORDER)
        return (order, row.get("source_domain", ""), row.get("our_dead_target", ""), row.get("source_url", ""))

    return sorted(rows, key=key)


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def cmd_selftest(_args: argparse.Namespace) -> None:
    """Offline checks of the classifier (no files, no network)."""
    index = LiveIndex()
    index.add_review(
        {
            "slug": "joker",
            "reviewTitle": "Joker Is Craft in Search of a Reason",
            "movieTitle": "Joker",
            "genres": ["Crime", "Thriller", "Drama"],
            "directors": ["Todd Phillips"],
            "cast": ["Robert De Niro", "Joaquin Phoenix"],
            "tmdbId": 475557,
        }
    )
    redirect_map: dict[str, str] = {}
    unresolved: set[str] = set()
    cases = [
        ("https://extramovies.org/", CAT_REVIEW_OR_HUB, STATUS_LIVE),
        ("http://extramovies.org/", CAT_REVIEW_OR_HUB, STATUS_301),
        ("https://www.extramovies.org/", CAT_REVIEW_OR_HUB, STATUS_301),
        ("https://extramovies.org/robots.txt", CAT_REVIEW_OR_HUB, STATUS_LIVE),
        ("https://extramovies.org/cast/robert-de-niro/", CAT_TAXONOMY, STATUS_301),
        ("https://extramovies.org/cast/nobody-here/", CAT_DEAD_OTHER, STATUS_404),
        ("https://extramovies.org/online.php?link=abc", CAT_DOWNLOAD_OR_PLAYER, STATUS_404),
        ("https://extramovies.org/9xplay.php", CAT_DOWNLOAD_OR_PLAYER, STATUS_404),
        ("https://extramovies.org/18-movies/dhruva-2016-hindi-dubbed-720p-hdrip/", CAT_DOWNLOAD_OR_PLAYER, STATUS_404),
    ]
    failures = 0
    for url, want_cat, want_status in cases:
        got = classify(url, index, "https://extramovies.org", redirect_map, unresolved)
        if got.category != want_cat or got.status != want_status:
            failures += 1
            print(
                f"selftest: FAIL {url} -> {got.category}/{got.status} (want {want_cat}/{want_status})",
                file=sys.stderr,
            )
    # Replacement matching: a dead legacy slug finds the live page with the
    # same title; an entity we never review gets no invented replacement.
    replacements = [
        ("/joker-review/", "https://extramovies.org/reviews/joker"),
        ("/18-movies/joker-review/", "https://extramovies.org/reviews/joker"),
        ("/deadpool-2016-review/", ""),
    ]
    for path, want in replacements:
        got, _ = find_replacement(path, index, "https://extramovies.org", redirect_map)
        if got != want:
            failures += 1
            print(f"selftest: FAIL replacement {path} -> {got!r} (want {want!r})", file=sys.stderr)
    if failures:
        raise SystemExit(1)
    print("selftest: OK")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="backlink_rescue.py",
        description="Classify a backlink export into live / recovered / dead targets and draft outreach.",
    )
    parser.add_argument(
        "--csv",
        default=str(REPO_ROOT / "data" / "legacy" / "semrush-referring-domains-2026-10-21.csv"),
        help="referring-domain export (CSV)",
    )
    parser.add_argument(
        "--out",
        default=str(REPO_ROOT / "data" / "legacy" / "backlink_rescue.csv"),
        help="rescue CSV output",
    )
    parser.add_argument(
        "--outreach",
        default=str(REPO_ROOT / "data" / "legacy" / "backlink_outreach_drafts.csv"),
        help="outreach drafts CSV output",
    )
    parser.add_argument(
        "--site-url",
        default=os.environ.get("SITE_URL") or "https://extramovies.org",
        help="canonical site URL (default: SITE_URL or https://extramovies.org)",
    )
    parser.add_argument(
        "--site",
        default=os.environ.get("SITE_ID") or "extramovies",
        help="site namespace for the seed corpus (default: SITE_ID or extramovies)",
    )
    parser.add_argument(
        "--site-name",
        default=None,
        help="brand name used in the email drafts (default: derived from the host)",
    )
    parser.add_argument(
        "--sitemap",
        default=None,
        help="optional local sitemap.xml snapshot to match against",
    )
    parser.add_argument("--selftest", action="store_true", help="run the offline classifier checks and exit")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.selftest:
        cmd_selftest(args)
        return

    site_url = args.site_url.rstrip("/")
    site_name = args.site_name or site_url.split("//")[-1].split(".")[0].capitalize()
    csv_path = Path(args.csv)
    out_path = Path(args.out)
    outreach_path = Path(args.outreach)
    sitemap_path = Path(args.sitemap) if args.sitemap else None
    if sitemap_path is not None and not sitemap_path.is_file():
        die(f"sitemap not found: {sitemap_path}")

    export = read_export(csv_path)
    if not export:
        log("the export has no usable rows")

    index = build_live_index(args.site, sitemap_path)
    redirect_map, unresolved = read_legacy_tables()

    rescue, outreach = build_rows(export, index, site_url, site_name, redirect_map, unresolved)
    rescue = sort_rows(rescue)
    outreach.sort(key=lambda r: (r["source_domain"], r["our_target_url"]))

    write_csv(out_path, RESCUE_COLUMNS, rescue)
    write_csv(outreach_path, OUTREACH_COLUMNS, outreach)

    # Summary for the owner (printed only, never written into the CSVs).
    #
    # Link accounting: the export gives a link total per source domain, not
    # per target URL. Every link number below is therefore the total of the
    # DISTINCT domains behind a bucket (a domain is counted once per bucket),
    # and a domain that links to more than one kind of target is reported in
    # more than one bucket.
    by_category: dict[str, dict] = {}
    for row in rescue:
        entry = by_category.setdefault(
            row["category"], {"rows": 0, "domains": set(), "targets": set(), "links": 0}
        )
        entry["rows"] += 1
        entry["domains"].add(row["source_domain"])
        entry["targets"].add(row["our_dead_target"])
    domain_links = {row["domain"]: row["links"] for row in export}
    for entry in by_category.values():
        entry["links"] = sum(domain_links.get(d, 0) for d in entry["domains"])

    per_domain: dict[str, list[dict]] = {}
    for row in rescue:
        per_domain.setdefault(row["source_domain"], []).append(row)

    recovered_domains: list[str] = []
    dead_domains: list[str] = []
    download_domains: list[str] = []
    live_domains: list[str] = []
    taxonomy_domains: list[str] = []
    canonical_domains: list[str] = []
    for domain, rows in per_domain.items():
        has_dead = any(r["category"] == CAT_DEAD_OTHER for r in rows)
        has_download = any(r["category"] == CAT_DOWNLOAD_OR_PLAYER for r in rows)
        has_301 = any(r["dead_status"] == STATUS_301 for r in rows)
        has_taxonomy_301 = any(r["category"] == CAT_TAXONOMY for r in rows)
        if has_dead:
            dead_domains.append(domain)
        elif has_download:
            download_domains.append(domain)
        elif has_taxonomy_301:
            taxonomy_domains.append(domain)
        elif has_301:
            canonical_domains.append(domain)
        else:
            live_domains.append(domain)
        if has_301 and not has_dead and not has_download:
            recovered_domains.append(domain)

    def links_of(domains: list[str]) -> int:
        return sum(domain_links.get(d, 0) for d in domains)

    taxonomy_rows = [r for r in rescue if r["category"] == CAT_TAXONOMY]
    print(f"backlink_rescue: {len(export)} source domain(s), {sum(r['links'] for r in export)} link(s) in {csv_path.name}")
    print(f"backlink_rescue: live corpus = {', '.join(index.sources)}")
    for category in CATEGORY_ORDER:
        entry = by_category.get(category)
        if not entry:
            continue
        print(
            f"backlink_rescue: {category}: {entry['rows']} row(s), {len(entry['domains'])} domain(s), "
            f"{len(entry['targets'])} target(s), {entry['links']} link(s)"
        )
    print(
        f"backlink_rescue: recovered automatically by the taxonomy 301: {len(taxonomy_rows)} row(s), "
        f"{len(taxonomy_domains)} domain(s), {links_of(taxonomy_domains)} link(s)"
    )
    print(
        f"backlink_rescue: recovered automatically by the canonical-host 301 (http/www to the apex): "
        f"{len(canonical_domains)} domain(s), {links_of(canonical_domains)} link(s)"
    )
    print(
        f"backlink_rescue: domains fully live or recovered by a 301: {len(recovered_domains) + len(live_domains)} "
        f"({links_of(live_domains) + links_of(recovered_domains)} link(s))"
    )
    print(
        f"backlink_rescue: domain split: live {len(live_domains)} ({links_of(live_domains)} link(s)), "
        f"canonical-301 {len(canonical_domains)} ({links_of(canonical_domains)}), "
        f"taxonomy-301 {len(taxonomy_domains)} ({links_of(taxonomy_domains)}), "
        f"dead {len(dead_domains)} ({links_of(dead_domains)}), "
        f"player {len(download_domains)} ({links_of(download_domains)})"
    )
    print(
        f"backlink_rescue: domains with a dead target (outreach queue): {len(dead_domains)} "
        f"({links_of(dead_domains)} link(s))"
    )
    print(
        f"backlink_rescue: domains linking to pirate player paths (never resurrect): {len(download_domains)} "
        f"({links_of(download_domains)} link(s))"
    )
    print(f"backlink_rescue: {len(outreach)} outreach row(s) in {outreach_path}")
    print(f"backlink_rescue: wrote {out_path}")
    print("backlink_rescue: nothing was sent, and no request left this machine")


if __name__ == "__main__":
    main()
