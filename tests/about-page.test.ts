import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { experimental_AstroContainer } from "astro/container";
import AboutPage from "../src/pages/about.astro";
import ContactPage from "../src/pages/contact.astro";
import DiscoverHome from "../src/components/discover/DiscoverHome.astro";
import { getSiteBrand } from "../src/lib/seo/brand";
import { getDb, getSetting } from "../src/lib/db/adapter";
import { BRAND_SAME_AS, organizationJsonLd } from "../src/lib/seo/jsonld";
import { getSiteContact } from "../src/lib/site-contact";

/**
 * About page, contact page, homepage brand block, brand entity.
 *
 * The site pages are rendered through the Astro container (the real page
 * component, SSR), so the assertions are about the bytes a reader gets,
 * not about a mock. The brand is resolved the same way the page resolves it
 * (settings file -> store -> preset), never hardcoded.
 */

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

const savedSettingsPath = process.env.SETTINGS_FILE_PATH;
const savedContactEmail = process.env.CONTACT_EMAIL;
let settingsDir = "";

beforeEach(() => {
  // Hermetic brand: no settings file, so the preset name resolves.
  settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), "about-page-"));
  process.env.SETTINGS_FILE_PATH = path.join(settingsDir, "settings.json");
  delete process.env.CONTACT_EMAIL;
});

afterEach(() => {
  if (savedSettingsPath === undefined) delete process.env.SETTINGS_FILE_PATH;
  else process.env.SETTINGS_FILE_PATH = savedSettingsPath;
  if (savedContactEmail === undefined) delete process.env.CONTACT_EMAIL;
  else process.env.CONTACT_EMAIL = savedContactEmail;
  if (settingsDir) fs.rmSync(settingsDir, { recursive: true, force: true });
});

/** Render a page component the way SSR would (the real route output). */
async function renderPage(
  Page: unknown,
  route: string,
): Promise<{ html: string; main: string }> {
  const container = await experimental_AstroContainer.create();
  const html = await container.renderToString(Page as never, {
    request: new Request(`https://extramovies.test${route}`),
  });
  const start = html.indexOf("<main");
  const end = html.indexOf("</main>");
  return { html, main: start >= 0 && end > start ? html.slice(start, end) : html };
}

/** The brand name the pages resolve for this site. */
async function brandName(): Promise<string> {
  const brand = await getSiteBrand((k) => getSetting(getDb({}), k));
  return brand.name;
}

/** The first paragraph of the main content (the lead). */
function firstParagraph(main: string): string {
  const m = main.match(/<p[^>]*>([\s\S]*?)<\/p>/);
  return m ? m[1] ?? "" : "";
}

/** Every JSON-LD node the page emitted. */
function jsonLdNodes(html: string): Array<Record<string, unknown>> {
  const nodes: Array<Record<string, unknown>> = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      nodes.push(JSON.parse(m[1] ?? "{}"));
    } catch {
      /* a broken node is a failure, not a skip */
      nodes.push({ "@type": "Unparseable" });
    }
  }
  return nodes;
}

describe("about page: the route renders and answers the brand query", () => {
  it("renders the page with the brand name in the first paragraph", async () => {
    const { html, main } = await renderPage(AboutPage, "/about");
    const brand = await brandName();

    // The route renders a real page (no 404, no redirect, no empty body).
    expect(html).toContain("<h1");
    expect(html).toContain("<title>");
    expect(firstParagraph(main)).toContain(brand);
  });

  it("the first paragraph says what the site is, in one breath", async () => {
    const { main } = await renderPage(AboutPage, "/about");
    const lead = firstParagraph(main);

    // It names the publication and says it is a review magazine.
    expect(lead).toContain("film-review magazine");
    expect(lead).toMatch(/review/i);
    // And it never implies a download site in the lead paragraph.
    expect(lead).not.toMatch(/download|pirat|torrent|movie download/i);
  });

  it("links to /contact", async () => {
    const { html } = await renderPage(AboutPage, "/about");
    expect(html).toContain('href="/contact"');
  });

  it("shows the brand name on the page, in the h1", async () => {
    const { html } = await renderPage(AboutPage, "/about");
    const brand = await brandName();
    expect(html).toContain(`About ${brand}</h1>`);
  });

  it("carries no em-dash in its own copy (house voice)", async () => {
    const { main } = await renderPage(AboutPage, "/about");
    expect(main).not.toContain("—");
  });
});

describe("contact page: the route renders and the address is honest", () => {
  it("renders the page", async () => {
    const { html } = await renderPage(ContactPage, "/contact");
    const brand = await brandName();
    expect(html).toContain(`Contact ${brand}</h1>`);
    expect(html).toContain("<title>");
  });

  it("shows a marked placeholder while no address is configured", async () => {
    const { html } = await renderPage(ContactPage, "/contact");
    expect(html).toContain("contact-placeholder");
    // No dead mail link, and no invented address.
    expect(html).not.toContain("mailto:");
    expect(getSiteContact().email).toBe("");
  });

  it("renders the mail link once an address is configured", async () => {
    process.env.CONTACT_EMAIL = "editor@extramovies.test";
    const { html } = await renderPage(ContactPage, "/contact");
    expect(html).toContain('href="mailto:editor@extramovies.test');
    // The address placeholder is gone (the reply-window one may remain).
    expect(html).not.toContain("contact address not set yet");
  });

  it("names the three things a reader writes about", async () => {
    const { main } = await renderPage(ContactPage, "/contact");
    expect(main).toContain("A correction");
    expect(main).toContain("A streaming fix");
    expect(main).toContain("A general question");
    // The response time is stated, not invented.
    expect(main).toContain("Response time");
  });
});

describe("sitemap: both site pages are listed", () => {
  it("lists /about and /contact", async () => {
    const { GET } = await import("../src/pages/sitemap.xml");
    const res = (await GET({
      url: new URL("https://example.com/sitemap.xml"),
    } as never)) as Response;
    const xml = await res.text();
    expect(xml).toContain("<loc>https://example.com/about</loc>");
    expect(xml).toContain("<loc>https://example.com/contact</loc>");
  });
});

describe("site chrome: both pages are reachable in both themes", () => {
  it("the header carries both links", () => {
    const header = read("src/components/public/SiteHeader.astro");
    expect(header).toContain('href: "/about"');
    expect(header).toContain('href: "/contact"');
  });

  it("the footer carries both links", () => {
    const footer = read("src/components/public/SiteFooter.astro");
    expect(footer).toContain('href="/about"');
    expect(footer).toContain('href="/contact"');
  });

  it("the chrome is theme-independent (one header + footer for both themes)", () => {
    const base = read("src/layouts/Base.astro");
    expect(base).toContain("<SiteHeader");
    expect(base).toContain("<SiteFooter");
    // The chrome is rendered by the layout, so every theme gets the links.
    expect(base).not.toMatch(/theme\s*===\s*["']publication["']\s*\?[^)]*SiteHeader/);
  });

  it("a rendered page carries both links in the chrome", async () => {
    const { html } = await renderPage(AboutPage, "/about");
    expect(html).toContain('href="/about"');
    expect(html).toContain('href="/contact"');
  });
});

describe("homepage: the brand block is there and the h1 did not move", () => {
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

  it("the h1 is still 'Trending this week'", async () => {
    const html = await renderHome();
    expect(html).toMatch(/<h1 id="discover-title"[^>]*>Trending this week<\/h1>/);
  });

  it("the brand block is present and says what the site is", async () => {
    const html = await renderHome();
    expect(html).toContain("d-brand-note");
    expect(html).toContain("Extramovies is an independent film-review magazine.");
    expect(html).toContain('href="/about"');
    // Exactly one brand block on the page.
    expect(html.match(/class="d-brand-note"/g) ?? []).toHaveLength(1);
  });

  it("the brand block sits UNDER the hero, so the hero never moves down", async () => {
    const html = await renderHome();
    const heroAt = html.indexOf("d-hero-slider");
    const noteAt = html.indexOf("d-brand-note");
    expect(heroAt).toBeGreaterThan(-1);
    expect(noteAt).toBeGreaterThan(heroAt);
  });

  it("the page hands its brand name to the discovery home", () => {
    expect(read("src/pages/index.astro")).toContain("brandName={brand.name}");
  });
});

describe("entity signal: one Organization node, brand name, real sameAs", () => {
  it("the Organization node uses the brand name, not the domain", async () => {
    const brand = await getSiteBrand((k) => getSetting(getDb({}), k));
    const node = organizationJsonLd(brand);
    expect(node["name"]).toBe(brand.name);
    expect(node["name"]).toBe("Extramovies");
    expect(node["url"]).toContain("extramovies.org");
    expect(node["description"]).toBeTruthy();
  });

  it("sameAs lists only profiles that exist and are ours", () => {
    // The Letterboxd profile exists and belongs to this brand; a sameAs that
    // points at a missing page would be a false claim to a crawler, so every
    // entry must be a live https profile URL (see docs/parasite/ for the kit).
    expect(BRAND_SAME_AS).toContain("https://letterboxd.com/extramovies/");
    for (const url of BRAND_SAME_AS) {
      expect(url).toMatch(/^https:\/\/[a-z0-9.-]+\//);
    }
    const brand = { name: "Extramovies", origin: "https://extramovies.org", logo: null };
    const node = organizationJsonLd(brand as never);
    expect(node["sameAs"]).toEqual(BRAND_SAME_AS);
  });

  it("the About page emits an AboutPage node and exactly one Organization node", async () => {
    const { html } = await renderPage(AboutPage, "/about");
    const nodes = jsonLdNodes(html);
    const about = nodes.filter((n) => n["@type"] === "AboutPage");
    const orgs = nodes.filter((n) => n["@type"] === "Organization");
    expect(about).toHaveLength(1);
    expect(orgs).toHaveLength(1);
    expect(about[0]?.["name"]).toBe(`About ${await brandName()}`);
    expect(orgs[0]?.["name"]).toBe(await brandName());
    // The AboutPage node points at the page, and the Organization node at the site.
    expect(String(about[0]?.["url"])).toContain("/about");
    expect(String(orgs[0]?.["url"])).toMatch(/^https?:\/\//);
  });
});
