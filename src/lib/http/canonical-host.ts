/**
 * Host canonicalisation — the duplicate-host fix (2026-10-21).
 *
 * A brand's domain is the canonical host. A `www.` copy of it is a SECOND
 * live host for the same site: both answer 200 with the full page, which
 * splits the site's signals (two live copies of one page instead of one
 * live copy and one redirect) — the same class of problem as the http ->
 * https duplicate the panel already answers with a 301.
 *
 * The rule is host-level and brand-agnostic: strip a leading `www.` from
 * whatever host the request came in on. It is NOT a hardcoded domain, so
 * both brands (extramovies.org and cinemavilla.in) get it without
 * configuration, and a host that carries no `www.` is never redirected.
 *
 * The panel proxy terminates TLS, so `request.protocol` is http even when
 * the client speaks https: the host comes from the Host header (falling
 * back to the URL Astro built), never from the protocol.
 *
 * No dependencies, no I/O: pure functions over the request, so the rule is
 * testable without a server and fails soft by construction.
 */

/**
 * The host the request came in on.
 *
 * The Host header wins: behind the panel proxy it is the host the client
 * asked for, while Astro's request URL is rebuilt from the socket. The URL
 * is the fallback for a request without a Host header (HTTP/1.0, tests).
 */
export function requestHost(request: Request, url: URL): string {
  let header = "";
  try {
    header = request?.headers?.get?.("host") ?? "";
  } catch {
    header = "";
  }
  const host = String(header).trim();
  if (host) return host;
  return String(url?.host ?? "").trim();
}

/**
 * The apex host of a `www.` host, or null when there is nothing to strip.
 *
 * Only a real domain is canonicalised: the apex must be dot-separated
 * labels (optionally with a port), so `www.localhost` and a bare `www.` are
 * left alone. A host that does not start with `www.` (or starts with
 * something else, like `www2.`) is left alone too.
 */
export function apexHost(host: string): string | null {
  const raw = String(host ?? "").trim().toLowerCase();
  if (!raw.startsWith("www.")) return null;
  const apex = raw.slice(4);
  if (!apex) return null;
  if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?$/.test(apex)) return null;
  return apex;
}

/**
 * The canonical URL for a request that arrived on a `www.` host, or null
 * when the host needs no canonicalisation.
 *
 * The path and the query string are preserved verbatim; the scheme is
 * https because the public site is served over https and the proxy hides
 * the real protocol from the app.
 */
export function canonicalHostUrl(request: Request, url: URL): string | null {
  const apex = apexHost(requestHost(request, url));
  if (!apex) return null;
  const path = url?.pathname || "/";
  return `https://${apex}${path}${url.search ?? ""}`;
}

/**
 * The redirect response for a `www.` host, or null to carry on.
 *
 * GET/HEAD answer 301 — the duplicate-host case a crawler sees. Other
 * methods answer 308 so the method and the body survive the hop: a 301
 * would turn a POST into a GET and break a form post on the duplicate
 * host.
 */
export function canonicalHostRedirect(request: Request, url: URL): Response | null {
  const target = canonicalHostUrl(request, url);
  if (!target) return null;
  const method = String(request?.method ?? "GET").toUpperCase();
  const status = method === "GET" || method === "HEAD" ? 301 : 308;
  return new Response(null, { status, headers: { Location: target } });
}

/**
 * The request pipeline the middleware runs.
 *
 * Host first: a `www.` copy of the brand's domain is a duplicate host and
 * the answer is a redirect whatever the path is. Then the legacy archive
 * answers path-level (301 mapped, 410 gone). Returns null when the
 * request must continue to the route.
 */
export function resolveRequest(
  request: Request,
  url: URL,
  legacyCheck: (pathname: string) => Response | null,
): Response | null {
  const canonical = canonicalHostRedirect(request, url);
  if (canonical) return canonical;
  return legacyCheck(url.pathname);
}
