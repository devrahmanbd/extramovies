import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { experimental_AstroContainer } from "astro/container";
import HomePage from "../src/pages/index.astro";
import DiscoverHome from "../src/components/discover/DiscoverHome.astro";
import { BRAND_ALTERNATE_NAMES, getSiteBrand } from "../src/lib/seo/brand";
import { websiteJsonLd } from "../src/lib/seo/jsonld";

/**
 * Entity signal: the brand name the SERP can read.
 *
 * Two surfaces:
 *   1. the WebSite JSON-LD carries `alternateName` (the other spellings of
 *      this site) INSIDE the one existing node;
 *   2. the discovery homepage carries the brand name in a heading (the h1
 *      stays "Trending this week" — the hero owns it).
 *
 * Everything is asserted against the real render / the real resolver, never
 * against a mock, and the per-site rule is asserted too: the second brand
 * must never inherit this site's domain.
 */

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

/** Every JSON-LD node a page emitted. */
function jsonLdNodes(html: string): Array<Record<string, unknown>> {
  const nodes: Array<Record<string, unknown>> = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      nodes.push(JSON.parse(m[1] ?? "{}"));
    } catch {
      nodes.push({ "@type": "Unparseable" });
    }
  }
  return nodes;
}

/** Render a page the way SSR would (the real route output). */
async function renderPage(Page: unknown, requestOrigin: string): Promise<string> {
  const container = await experimental_AstroContainer.create();
  return container.renderToString(Page as never, {
    request: new Request(`${requestOrigin}/`),
  });
}

let savedSiteUrl: string | undefined;

beforeEach(() => {
  savedSiteUrl = process.env.SITE_URL;
  // TMDB is stubbed: the homepage must render offline and deterministically.
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url: unknown) => {
    if (String(url).includes("api.themoviedb.org")) {
      return {
        ok: true,
        json: async () => ({ results: [], page: 1, total_pages: 0, total_results: 0 }),
      } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  });
});

afterEach(() => {
  if (savedSiteUrl === undefined) delete process.env.SITE_URL;
  else process.env.SITE_URL = savedSiteUrl;
  vi.restoreAllMocks();
});

describe("WebSite JSON-LD: the alternate names ride inside the one node", () => {
  it("the homepage node carries alternateName with the brand and the domain", async () => {
    process.env.SITE_URL = "https://extramovies.org";
    const html = await renderPage(HomePage, "https://extramovies.org");
    const nodes = jsonLdNodes(html);
    const sites = nodes.filter((n) => n["@type"] === "WebSite");

    // Exactly ONE WebSite node — the alternate names go inside it.
    expect(sites).toHaveLength(1);
    expect(sites[0]?.["alternateName"]).toEqual(["extramovies", "extramovies.org"]);
  });

  it("the node keeps its name, its url and its SearchAction", async () => {
    process.env.SITE_URL = "https://extramovies.org";
    const html = await renderPage(HomePage, "https://extramovies.org");
    const site = jsonLdNodes(html).find((n) => n["@type"] === "WebSite");
    expect(site?.["name"]).toBe("Extramovies");
    expect(site?.["url"]).toBe("https://extramovies.org/");
    expect(site?.["potentialAction"]).toMatchObject({
      "@type": "SearchAction",
      "query-input": "required name=search_term_string",
    });
  });

  it("no second WebSite node was added", async () => {
    const html = await renderPage(HomePage, "https://extramovies.org");
    const sites = jsonLdNodes(html).filter((n) => n["@type"] === "WebSite");
    expect(sites).toHaveLength(1);
    // The Organization node is still exactly one, too.
    expect(jsonLdNodes(html).filter((n) => n["@type"] === "Organization")).toHaveLength(1);
  });
});

describe("the alternate names are per site, never a hardcoded domain", () => {
  it("the resolver derives them from the brand's own name and origin", () => {
    expect(
      BRAND_ALTERNATE_NAMES({ name: "Extramovies", origin: "https://extramovies.org" }),
    ).toEqual(["extramovies", "extramovies.org"]);
  });

  it("a dev port is not part of the name", () => {
    expect(
      BRAND_ALTERNATE_NAMES({ name: "Extramovies", origin: "http://localhost:4321" }),
    ).toEqual(["extramovies", "localhost"]);
  });

  it("another brand on another host resolves to its own aliases", () => {
    // The second brand lives on another domain: it must never inherit ours.
    expect(
      BRAND_ALTERNATE_NAMES({ name: "Cinemavilla", origin: "https://cinemavilla.in" }),
    ).toEqual(["cinemavilla", "cinemavilla.in"]);
  });

  it("the page follows the host it is served on", async () => {
    delete process.env.SITE_URL;
    const html = await renderPage(HomePage, "https://cinemavilla.in");
    const site = jsonLdNodes(html).find((n) => n["@type"] === "WebSite");
    const alternate = site?.["alternateName"] as string[];
    expect(alternate).toContain("cinemavilla.in");
    expect(alternate).not.toContain("extramovies.org");
  });

  it("the dashboard can pin the list per site", async () => {
    const brand = await getSiteBrand(
      async (k) => (k === "site.alternate_name" ? "extramovies, extramovies.org, The Long Take" : null),
      { BRAND_PRESET: "noir-cinema" },
    );
    const node = websiteJsonLd({ ...brand, origin: "https://extramovies.org" });
    expect(node["alternateName"]).toEqual([
      "extramovies",
      "extramovies.org",
      "The Long Take",
    ]);
  });
});

describe("the discovery homepage: the brand name is a heading", () => {
  const heroTile = {
    tmdbId: 550,
    title: "Dune: Part Two",
    year: 2024,
    posterUrl: null,
    rating: 8.5,
    backdropUrl: "https://image.tmdb.org/t/p/w1280/hero.jpg",
    overview: null,
  };

  async function renderHome(): Promise<string> {
    const container = await experimental_AstroContainer.create();
    return container.renderToString(DiscoverHome as never, {
      props: {
        trending: [heroTile],
        popular: [],
        nowPlaying: [],
        upcoming: [],
        free: [],
        stream: [],
        rent: [],
        tmdbGenres: [],
        localGenres: [],
        localLatest: [],
        brandName: "Extramovies",
        thisWeek: [],
        topRated: [],
        featured: null,
        hasTmdbKey: true,
        heroFirstUrl: heroTile.backdropUrl,
        now: new Date("2026-10-21T00:00:00.000Z"),
      },
    });
  }

  it("the brand name sits in a heading element", async () => {
    const html = await renderHome();
    expect(html).toMatch(
      /<h2 class="d-brand-note-name"[^>]*>\s*<a href="\/about"[^>]*>Extramovies<\/a>\s*<\/h2>/,
    );
  });

  it("the h1 is still 'Trending this week'", async () => {
    const html = await renderHome();
    expect(html).toMatch(/<h1 id="discover-title"[^>]*>Trending this week<\/h1>/);
  });

  it("the brand heading comes AFTER the hero, so the hero never moves down", async () => {
    const html = await renderHome();
    const heroAt = html.indexOf("d-hero-slider");
    const headingAt = html.indexOf("d-brand-note-name");
    expect(heroAt).toBeGreaterThan(-1);
    expect(headingAt).toBeGreaterThan(heroAt);
  });

  it("the /about link is present", async () => {
    const html = await renderHome();
    expect(html).toContain('href="/about"');
  });

  it("the descriptive sentence is the body text under the heading", async () => {
    const html = await renderHome();
    const headingAt = html.indexOf("d-brand-note-name");
    const sentenceAt = html.indexOf("Extramovies is an independent film-review magazine.");
    expect(sentenceAt).toBeGreaterThan(-1);
    expect(sentenceAt).toBeGreaterThan(headingAt);
    // It is a paragraph, not another heading.
    expect(html).toMatch(/<p class="d-brand-note-text"[^>]*>[\s\S]*?film-review magazine\./);
  });

  it("the brand block is a quiet strip, not a promo banner", async () => {
    const html = await renderHome();
    // The heading reads as the brand name, never shouted in caps.
    expect(html).not.toContain("EXTRAMOVIES");
    // The shared stylesheet carries no all-caps and no motion for the block.
    const css = read("src/styles/global.css");
    const block = css.slice(
      css.indexOf(".d-brand-note {"),
      css.indexOf(".contact-placeholder"),
    );
    expect(block).not.toMatch(/text-transform:\s*uppercase/i);
    expect(block).not.toMatch(/animation/i);
  });
});
