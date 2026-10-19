#!/usr/bin/env python3
"""Search Console API helper — local operator tool for extramovies.org.

Grants the operator read access to the automatable GSC surfaces:
sitemaps, Search Analytics, and URL Inspection.

Auth: a Google service-account key (JSON). Path comes from $GSC_SA_KEY, or
the default ~/.config/gsc-sa/extramovies-gsc-reader.json. The key never
leaves this machine: it is only used to sign a short-lived JWT assertion.
No third-party packages required (RS256 signing uses PyJWT when present,
otherwise the openssl binary).

Usage:
  gsc_api.py token-check
  gsc_api.py sites
  gsc_api.py sitemaps --site sc-domain:extramovies.org
  gsc_api.py query --site sc-domain:extramovies.org --dimensions page --rows 50
  gsc_api.py query --site sc-domain:extramovies.org --dimensions query --rows 50 \\
      --start-date 2026-09-19 --end-date 2026-10-19
  gsc_api.py inspect --site sc-domain:extramovies.org --url <url> [--url <url> ...]

Exit codes: 0 ok, 1 API/permission error, 2 usage error.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

WEBMASTERS = "https://www.googleapis.com/auth/webmasters"
SCOPES = [WEBMASTERS + ".readonly", WEBMASTERS]
TOKEN_URI = "https://oauth2.googleapis.com/token"
API = "https://searchconsole.googleapis.com/webmasters/v3"
INSPECT_API = "https://searchconsole.googleapis.com/v1"
KEY_DEFAULT = Path.home() / ".config/gsc-sa" / "extramovies-gsc-reader.json"

_token_cache: dict[str, object] = {}


# --- key + token ------------------------------------------------------------


def key_path() -> Path:
    raw = os.environ.get("GSC_SA_KEY")
    return Path(raw).expanduser() if raw else KEY_DEFAULT


def load_key() -> dict:
    path = key_path()
    if not path.exists():
        die(
            f"service-account key not found: {path}\n"
            "Set $GSC_SA_KEY to the key file, or create the key first."
        )
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        die(f"cannot read key file {path}: {exc}")
    if data.get("type") != "service_account" or "private_key" not in data:
        die(f"{path} is not a usable service-account key (type={data.get('type')!r})")
    return data


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def sign_rs256(header: dict, payload: dict, private_key_pem: str) -> str:
    """Return a signed JWT assertion. PyJWT when installed, else openssl."""
    try:
        import jwt  # type: ignore

        return jwt.encode(
            payload, private_key_pem, algorithm="RS256", headers={"typ": "JWT"}
        )
    except Exception:
        pass
    segments = [
        b64url(json.dumps(header, separators=(",", ":")).encode()),
        b64url(json.dumps(payload, separators=(",", ":")).encode()),
    ]
    signing_input = ".".join(segments).encode()
    # openssl wants the key in a FILE and the payload on stdin.
    with tempfile.NamedTemporaryFile("wb", suffix=".pem", delete=False) as handle:
        handle.write(private_key_pem.encode())
        tmp_key = handle.name
    os.chmod(tmp_key, 0o600)
    try:
        proc = subprocess.run(
            ["openssl", "dgst", "-sha256", "-sign", tmp_key],
            input=signing_input,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        if proc.returncode != 0:
            die("openssl signing failed: " + proc.stderr.decode(errors="replace")[:200])
        signature = proc.stdout
    finally:
        os.unlink(tmp_key)
    segments.append(b64url(signature))
    return ".".join(segments)


def mint_token(key: dict, scope: str) -> tuple[str, int]:
    now = int(time.time())
    header = {"alg": "RS256", "typ": "JWT"}
    payload = {
        "iss": key["client_email"],
        "scope": scope,
        "aud": TOKEN_URI,
        "iat": now,
        "exp": now + 3600,
    }
    assertion = sign_rs256(header, payload, key["private_key"])
    body = urllib.parse.urlencode(
        {"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion}
    ).encode()
    req = urllib.request.Request(
        TOKEN_URI, data=body, headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        die(f"token request failed ({exc.code}): {exc.read().decode(errors='replace')[:200]}")
    except urllib.error.URLError as exc:
        die(f"token request failed (network): {exc.reason}")
    return data["access_token"], now + int(data.get("expires_in", 3600))


def token(scope: str) -> str:
    cached = _token_cache.get(scope)
    if isinstance(cached, tuple) and cached[1] > time.time() + 60:
        return str(cached[0])
    tok, exp = mint_token(load_key(), scope)
    _token_cache[scope] = (tok, exp)
    return tok


# --- http -------------------------------------------------------------------


def api_request(url: str, method: str = "GET", body: dict | None = None) -> dict:
    """Call a GSC endpoint, escalating the scope once if the token is too narrow."""
    last_error = ""
    for scope in SCOPES:
        tok = token(scope)
        data = json.dumps(body).encode() if body is not None else None
        headers = {"Authorization": f"Bearer {tok}"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read().decode()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            payload = exc.read().decode(errors="replace")
            last_error = f"HTTP {exc.code}: {payload[:300]}"
            # A scope problem is worth one retry with the wider scope.
            if exc.code == 403 and "scope" in payload.lower() and scope == SCOPES[0]:
                continue
            break
        except urllib.error.URLError as exc:
            last_error = f"network error: {exc.reason}"
            break
    die(last_error or "unknown API error")


def die(message: str, code: int = 1) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(code)


# --- commands ----------------------------------------------------------------


def cmd_token_check(_args: argparse.Namespace) -> None:
    key = load_key()
    tok, exp = mint_token(key, SCOPES[0])
    print(f"key ok: {key['client_email']}")
    print(f"token minted, expires in {exp - int(time.time())}s, length {len(tok)}")
    try:
        sites = api_request(f"{API}/sites")
    except SystemExit:
        print("sites.list: not authorized yet (expected until the service account is added in GSC)")
        return
    for site in sites.get("siteEntry", []):
        print(f"site: {site.get('siteUrl')}  permission: {site.get('permissionLevel')}")


def cmd_sites(_args: argparse.Namespace) -> None:
    data = api_request(f"{API}/sites")
    rows = data.get("siteEntry", [])
    if not rows:
        print("no sites visible to this credential")
    for site in rows:
        print(f"{site.get('siteUrl')}\t{site.get('permissionLevel')}")


def cmd_sitemaps(args: argparse.Namespace) -> None:
    data = api_request(f"{API}/sitemaps/{urllib.parse.quote(args.site, safe='')}")
    for row in data.get("sitemap", []):
        errors = row.get("errors") or ""
        warnings = row.get("warnings") or ""
        print(
            f"{row.get('path')}\tlastSubmitted={row.get('lastSubmitted')}\t"
            f"isPending={row.get('isPending')}\terrors={errors or '-'}\twarnings={warnings or '-'}"
        )


def cmd_query(args: argparse.Namespace) -> None:
    body: dict = {
        "siteUrl": args.site,
        "dimensions": [args.dimensions],
        "rowLimit": args.rows,
    }
    if args.start_date:
        body["startDate"] = args.start_date
    if args.end_date:
        body["endDate"] = args.end_date
    if args.filter:
        body["dimensionFilterGroups"] = [
            {"filters": [{"dimension": args.filter_dimension, "operator": "contains", "expression": args.filter}]}
        ]
    data = api_request(f"{API}/sites/{urllib.parse.quote(args.site, safe='')}/searchAnalytics/query", "POST", body)
    rows = data.get("rows", [])
    if not rows:
        print("no rows")
    for row in rows:
        keys = " | ".join(str(k) for k in row.get("keys", []))
        print(f"{keys}\tclicks={row.get('clicks')}\timp={row.get('impressions')}\tctr={row.get('ctr')}\tpos={row.get('position')}")


def cmd_inspect(args: argparse.Namespace) -> None:
    for url in args.url:
        body = {
            "siteUrl": args.site,
            "inspectionUrl": url,
            "languageCode": "en-US",
        }
        data = api_request(f"{INSPECT_API}/urlInspection/index:inspect", "POST", body)
        result = data.get("inspectionResult", {})
        index = result.get("indexStatusResult", {})
        verdict = index.get("verdict", "?")
        coverage = index.get("coverageState", "?")
        robots = (index.get("robotsTxtState") or "?")
        canonical = (index.get("googleCanonical") or "-")
        note = " | ".join(
            f"{c.get('issue')}" for c in (index.get("crawledAs") and [] or [])
        )
        print(f"{url}\n  verdict={verdict} coverage={coverage} robots={robots}\n  canonical={canonical}")
        for err in index.get("crawledAs", []) or []:
            print(f"  crawledAs={err.get('responseCode')} {err.get('url')}")
        for issue in (index.get("indexingState"), index.get("lastCrawlTime")):
            if issue:
                print(f"  {issue}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("token-check", help="verify the key and token minting").set_defaults(func=cmd_token_check)
    sub.add_parser("sites", help="list sites this credential can see").set_defaults(func=cmd_sites)

    p = sub.add_parser("sitemaps", help="submitted sitemaps and their errors")
    p.add_argument("--site", required=True)
    p.set_defaults(func=cmd_sitemaps)

    p = sub.add_parser("query", help="Search Analytics query")
    p.add_argument("--site", required=True)
    p.add_argument("--dimensions", default="page", help="page | query | date | country | device")
    p.add_argument("--rows", type=int, default=50)
    p.add_argument("--start-date")
    p.add_argument("--end-date")
    p.add_argument("--filter")
    p.add_argument("--filter-dimension", default="page")
    p.set_defaults(func=cmd_query)

    p = sub.add_parser("inspect", help="URL Inspection for one or more URLs")
    p.add_argument("--site", required=True)
    p.add_argument("--url", action="append", required=True)
    p.set_defaults(func=cmd_inspect)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
