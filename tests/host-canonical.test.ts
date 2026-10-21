import { describe, it, expect, vi } from "vitest";
import {
  apexHost,
  canonicalHostUrl,
  canonicalHostRedirect,
  requestHost,
  resolveRequest,
} from "../src/lib/http/canonical-host";

/**
 * Host canonicalisation — the duplicate-host fix (live bug, 2026-10-21).
 *
 * https://www.extramovies.org/ answered 200 with the full site, so the
 * domain had two live hosts and the www copy was a duplicate-host signal
 * (the same class as the http -> https duplicate the panel answers with a
 * 301). The rule is host-level and brand-agnostic: strip a leading www.
 * from whatever host the request came in on.
 *
 * The panel proxy terminates TLS, so the protocol is not trusted: the host
 * comes from the Host header.
 */

/** A request as the proxy delivers it: the Host header carries the host. */
function proxiedRequest(host: string, path = "/", init: RequestInit = {}): Request {
  return new Request(`http://127.0.0.1:3100${path}`, {
    ...init,
    headers: { host, ...(init.headers as Record<string, string>) },
  });
}

describe("apexHost", () => {
  it("strips a leading www. from a real domain", () => {
    expect(apexHost("www.extramovies.org")).toBe("extramovies.org");
    expect(apexHost("www.cinemavilla.in")).toBe("cinemavilla.in");
    expect(apexHost("WWW.Extramovies.ORG")).toBe("extramovies.org");
    expect(apexHost("www.extramovies.org:8443")).toBe("extramovies.org:8443");
  });
  it("leaves a host without www. alone", () => {
    expect(apexHost("extramovies.org")).toBeNull();
    expect(apexHost("cinemavilla.in")).toBeNull();
    expect(apexHost("localhost")).toBeNull();
    expect(apexHost("localhost:4321")).toBeNull();
    expect(apexHost("127.0.0.1:3100")).toBeNull();
  });
  it("does not mistake a lookalike host for a www host", () => {
    expect(apexHost("www2.extramovies.org")).toBeNull();
    expect(apexHost("wwwextramovies.org")).toBeNull();
    expect(apexHost("mywww.extramovies.org")).toBeNull();
    expect(apexHost("")).toBeNull();
    // "www.localhost" is not a domain — dev stays untouched.
    expect(apexHost("www.localhost")).toBeNull();
  });
});

describe("requestHost", () => {
  it("reads the Host header the client sent", () => {
    const req = proxiedRequest("www.extramovies.org", "/about");
    expect(requestHost(req, new URL("http://127.0.0.1:3100/about"))).toBe("www.extramovies.org");
  });
  it("falls back to the request URL when there is no Host header", () => {
    const req = new Request("http://extramovies.org/about");
    expect(requestHost(req, new URL("http://extramovies.org/about"))).toBe("extramovies.org");
  });
});

describe("canonicalHostUrl", () => {
  it("drops www. and keeps the path and the query", () => {
    const url = new URL("http://127.0.0.1:3100/reviews/dune-part-two?ref=newsletter&utm=x");
    expect(canonicalHostUrl(proxiedRequest("www.extramovies.org", "/reviews/dune-part-two?ref=newsletter&utm=x"), url)).toBe(
      "https://extramovies.org/reviews/dune-part-two?ref=newsletter&utm=x",
    );
  });
  it("answers over https (the proxy hides the real protocol)", () => {
    const url = new URL("http://www.cinemavilla.in/about");
    expect(canonicalHostUrl(proxiedRequest("www.cinemavilla.in", "/about"), url)).toBe(
      "https://cinemavilla.in/about",
    );
  });
  it("leaves an apex host alone", () => {
    const url = new URL("http://extramovies.org/about");
    expect(canonicalHostUrl(proxiedRequest("extramovies.org", "/about"), url)).toBeNull();
  });
});

describe("canonicalHostRedirect", () => {
  it("301s a www host to the same path and query on the apex host", () => {
    const url = new URL("http://127.0.0.1:3100/about?ref=x");
    const res = canonicalHostRedirect(proxiedRequest("www.extramovies.org", "/about?ref=x"), url);
    expect(res?.status).toBe(301);
    expect(res?.headers.get("Location")).toBe("https://extramovies.org/about?ref=x");
  });
  it("301s a HEAD request too (the crawler case)", () => {
    const url = new URL("http://127.0.0.1:3100/");
    const res = canonicalHostRedirect(
      proxiedRequest("www.extramovies.org", "/", { method: "HEAD" }),
      url,
    );
    expect(res?.status).toBe(301);
    expect(res?.headers.get("Location")).toBe("https://extramovies.org/");
  });
  it("308s a state-changing method so the body survives the hop", () => {
    const url = new URL("http://127.0.0.1:3100/api/auth/login");
    const res = canonicalHostRedirect(
      proxiedRequest("www.extramovies.org", "/api/auth/login", { method: "POST" }),
      url,
    );
    expect(res?.status).toBe(308);
    expect(res?.headers.get("Location")).toBe("https://extramovies.org/api/auth/login");
  });
  it("does not redirect an apex host", () => {
    const url = new URL("http://127.0.0.1:3100/about");
    expect(canonicalHostRedirect(proxiedRequest("extramovies.org", "/about"), url)).toBeNull();
  });
  it("does not redirect a lookalike host", () => {
    const url = new URL("http://127.0.0.1:3100/about");
    expect(canonicalHostRedirect(proxiedRequest("www2.extramovies.org", "/about"), url)).toBeNull();
  });
  it("canonicalises each brand on its own domain", () => {
    const url = new URL("http://127.0.0.1:3200/movies/123");
    const res = canonicalHostRedirect(proxiedRequest("www.cinemavilla.in", "/movies/123"), url);
    expect(res?.headers.get("Location")).toBe("https://cinemavilla.in/movies/123");
  });
});

describe("resolveRequest (the middleware pipeline)", () => {
  it("answers the host before the legacy path (a www host never 410s)", () => {
    const url = new URL("http://127.0.0.1:3100/9xplay.php");
    const legacy = vi.fn(() => new Response(null, { status: 410 }));
    const res = resolveRequest(proxiedRequest("www.extramovies.org", "/9xplay.php"), url, legacy);
    expect(res?.status).toBe(301);
    expect(res?.headers.get("Location")).toBe("https://extramovies.org/9xplay.php");
    expect(legacy).not.toHaveBeenCalled();
  });
  it("falls through to the legacy check on an apex host", () => {
    const url = new URL("http://127.0.0.1:3100/9xplay.php");
    const res = resolveRequest(
      proxiedRequest("extramovies.org", "/9xplay.php"),
      url,
      () => new Response(null, { status: 410 }),
    );
    expect(res?.status).toBe(410);
  });
  it("continues to the route when neither answers", () => {
    const url = new URL("http://127.0.0.1:3100/about");
    expect(resolveRequest(proxiedRequest("extramovies.org", "/about"), url, () => null)).toBeNull();
  });
});
