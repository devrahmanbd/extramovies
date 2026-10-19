import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  heroImagePreload,
  heroImageSize,
  heroImageVariant,
  heroPreloadLinkAttrs,
} from '../src/lib/seo/hero-image';
import { withFontDisplaySwap } from '../src/lib/seo/fonts';

/**
 * Hero LCP/CLS (CWV task 2).
 *
 * The hero artwork is the LCP element on both public home faces:
 *   - publication home  -> `img.glam-cover-bg` (src/pages/index.astro)
 *   - magazine home     -> the cover-story figure (MagazineHome.astro)
 *
 * Two fixes ship here:
 *   1. intrinsic width/height on the hero <img>, so the browser reserves the
 *      box before the bytes land (CLS);
 *   2. a `<link rel="preload" as="image">` in the head for the same URL (LCP).
 *
 * Intrinsic size has two sources: the WIDTH comes from the TMDB variant in
 * the URL (w780 serves both posters and backdrops in this repo, so the URL
 * alone cannot disambiguate), the HEIGHT comes from the field kind
 * (backdrop 16:9, poster 2:3). The kind is an aspect selector only — never
 * the size source. An unknown variant yields NO pair (never a guessed ratio)
 * while the preload is still emitted — the preload is size-agnostic.
 *
 * Assertion levels (no Astro render harness exists in this repo — vitest runs
 * without the astro vite plugin, and adding one is out of scope):
 *   L1 behaviour  — literal expected values against the helper functions.
 *   L2 wiring     — the template source must contain the exact call sites
 *                   that emit the attributes / the preload link, so the
 *                   helper cannot be bypassed silently by a hardcoded size.
 */

const root = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

/** Publication theme fixture: the featured row the homepage renders. */
const PUBLICATION_FIXTURE = {
  backdropUrl: 'https://image.tmdb.org/t/p/w1280/eZ239CUp1d6OryZEBPnO2n87gMG.jpg',
  posterUrl: 'https://image.tmdb.org/t/p/w780/6izwz7rsy95ARzTR3poZ8H6c5pp.jpg',
};

/** The width the TMDB client asks for backdrops (src/lib/tmdb/client.ts:94). */
const CLIENT_BACKDROP_URL =
  'https://image.tmdb.org/t/p/w780/rvtdN5XkWAfGX6xDuPL6yYS2seK.jpg';

/** The width the TMDB client asks for posters (src/lib/tmdb/client.ts:92). */
const CLIENT_POSTER_URL =
  'https://image.tmdb.org/t/p/w500/upwdEyhhYZ7pT2hD535fr2MGfpx.jpg';

/** Same fixture with a variant we cannot map (TMDB `original`). */
const UNKNOWN_VARIANT_FIXTURE = {
  backdropUrl: 'https://image.tmdb.org/t/p/original/eZ239CUp1d6OryZEBPnO2n87gMG.jpg',
};

/** A locally hosted upload — no TMDB variant at all. */
const UPLOAD_FIXTURE = { backdropUrl: '/uploads/cover-backdrop.jpg' };

/**
 * Discovery theme fixture: the first hero slide's backdrop. Discover tiles
 * request backdrops at w1280 (src/lib/tmdb/discover.ts:115-118), so the
 * preload carries the 1280x720 pair the hero <img> already declares.
 */
const DISCOVERY_HERO_FIXTURE =
  'https://image.tmdb.org/t/p/w1280/9PFonBhy4cQy7Jz20NpMygczOkv.jpg';

describe('hero image intrinsic size (CWV task 2)', () => {
  it('w1280 backdrop resolves to 1280x720', () => {
    expect(heroImageSize(PUBLICATION_FIXTURE.backdropUrl, 'backdrop')).toEqual({
      width: 1280,
      height: 720,
    });
  });

  it('w780 backdrop resolves to 780x439', () => {
    expect(heroImageSize(CLIENT_BACKDROP_URL, 'backdrop')).toEqual({
      width: 780,
      height: 439,
    });
  });

  it('w780 poster resolves to 780x1170', () => {
    expect(heroImageSize(PUBLICATION_FIXTURE.posterUrl, 'poster')).toEqual({
      width: 780,
      height: 1170,
    });
  });

  it('w500 poster resolves to 500x750', () => {
    expect(heroImageSize(CLIENT_POSTER_URL, 'poster')).toEqual({
      width: 500,
      height: 750,
    });
  });

  it('w300 poster resolves to 300x450', () => {
    expect(
      heroImageSize('https://image.tmdb.org/t/p/w300/6izwz7rsy95ARzTR3poZ8H6c5pp.jpg', 'poster'),
    ).toEqual({ width: 300, height: 450 });
  });

  it('unknown variant (original) resolves to no size pair', () => {
    expect(heroImageSize(UNKNOWN_VARIANT_FIXTURE.backdropUrl, 'backdrop')).toBeNull();
    expect(heroImageSize(UNKNOWN_VARIANT_FIXTURE.backdropUrl, 'poster')).toBeNull();
  });

  it('non-TMDB URL resolves to no size pair', () => {
    expect(heroImageSize(UPLOAD_FIXTURE.backdropUrl, 'backdrop')).toBeNull();
    expect(heroImageSize(null, 'backdrop')).toBeNull();
    expect(heroImageSize(undefined, 'poster')).toBeNull();
  });

  it('the width always comes from the URL variant; the kind only picks the aspect', () => {
    // w780 is used for posters AND backdrops in this repo: the kind decides
    // 16:9 vs 2:3, never the width.
    expect(heroImageSize(CLIENT_BACKDROP_URL, 'backdrop')!.width).toBe(780);
    expect(heroImageSize(CLIENT_BACKDROP_URL, 'poster')!.width).toBe(780);
    expect(heroImageSize(CLIENT_BACKDROP_URL, 'backdrop')!.height).toBe(439);
    expect(heroImageSize(CLIENT_BACKDROP_URL, 'poster')!.height).toBe(1170);
  });

  it('a backdrop field never receives a portrait pair, a poster field never a 16:9 one', () => {
    // Integer height rounding (780 -> 439) shifts the ratio slightly, so the
    // assertion is on the ratio within that rounding tolerance.
    for (const url of [PUBLICATION_FIXTURE.backdropUrl, CLIENT_BACKDROP_URL]) {
      const size = heroImageSize(url, 'backdrop')!;
      expect(Math.abs(size.width / size.height - 16 / 9)).toBeLessThan(0.005);
    }
    for (const url of [PUBLICATION_FIXTURE.posterUrl, CLIENT_POSTER_URL]) {
      const size = heroImageSize(url, 'poster')!;
      expect(Math.abs(size.width / size.height - 2 / 3)).toBeLessThan(0.005);
    }
  });

  it('variant extraction reads the TMDB path segment', () => {
    expect(heroImageVariant(PUBLICATION_FIXTURE.backdropUrl)).toBe('w1280');
    expect(heroImageVariant(PUBLICATION_FIXTURE.posterUrl)).toBe('w780');
    expect(heroImageVariant(UNKNOWN_VARIANT_FIXTURE.backdropUrl)).toBe('original');
    expect(heroImageVariant(UPLOAD_FIXTURE.backdropUrl)).toBeNull();
    expect(heroImageVariant(null)).toBeNull();
  });
});

describe('hero image preload (CWV task 2)', () => {
  it('known variant: preload carries the href and the intrinsic pair', () => {
    expect(heroImagePreload(PUBLICATION_FIXTURE.backdropUrl, 'backdrop')).toEqual({
      href: 'https://image.tmdb.org/t/p/w1280/eZ239CUp1d6OryZEBPnO2n87gMG.jpg',
      width: 1280,
      height: 720,
    });
  });

  it('unknown variant: preload kept, size pair omitted', () => {
    expect(heroImagePreload(UNKNOWN_VARIANT_FIXTURE.backdropUrl, 'backdrop')).toEqual({
      href: 'https://image.tmdb.org/t/p/original/eZ239CUp1d6OryZEBPnO2n87gMG.jpg',
    });
    expect(heroImagePreload(UPLOAD_FIXTURE.backdropUrl, 'backdrop')).toEqual({
      href: '/uploads/cover-backdrop.jpg',
    });
  });

  it('no hero URL: no preload at all', () => {
    expect(heroImagePreload(null, 'backdrop')).toBeNull();
    expect(heroImagePreload('', 'backdrop')).toBeNull();
    expect(heroImagePreload('   ', 'backdrop')).toBeNull();
  });

  it('the preload link carries exactly rel/as/href/width/height/fetchpriority', () => {
    expect(
      heroPreloadLinkAttrs({
        href: 'https://image.tmdb.org/t/p/w1280/eZ239CUp1d6OryZEBPnO2n87gMG.jpg',
        width: 1280,
        height: 720,
      }),
    ).toEqual({
      rel: 'preload',
      as: 'image',
      href: 'https://image.tmdb.org/t/p/w1280/eZ239CUp1d6OryZEBPnO2n87gMG.jpg',
      width: 1280,
      height: 720,
      fetchpriority: 'high',
    });
  });

  it('the preload link omits the size pair for an unknown variant', () => {
    const attrs = heroPreloadLinkAttrs({
      href: 'https://image.tmdb.org/t/p/original/eZ239CUp1d6OryZEBPnO2n87gMG.jpg',
    });
    expect(attrs).toEqual({
      rel: 'preload',
      as: 'image',
      href: 'https://image.tmdb.org/t/p/original/eZ239CUp1d6OryZEBPnO2n87gMG.jpg',
      width: undefined,
      height: undefined,
      fetchpriority: 'high',
    });
  });

  it('no preload descriptor: no link attributes at all', () => {
    expect(heroPreloadLinkAttrs(null)).toBeNull();
  });
});

describe('hero markup wiring: publication home + magazine (CWV task 2)', () => {
  it('publication home binds the URL-derived pair onto the hero <img>', () => {
    const index = read('src/pages/index.astro');
    // The pair must come from the helper, bound to the hero img itself, and
    // the kind must match the field rendered there (backdrop field).
    expect(index).toContain(
      'const coverSize = heroImageSize(featured?.backdropUrl ?? null, "backdrop");',
    );
    expect(index).toMatch(
      /<img\s+class="glam-cover-bg"[\s\S]{0,400}?width=\{coverSize\?\.width\}[\s\S]{0,120}?height=\{coverSize\?\.height\}/,
    );
  });

  it('the magazine cover binds the URL-derived pair onto its <img>', () => {
    const magazine = read('src/components/public/MagazineHome.astro');
    expect(magazine).toContain(
      'const coverSize = heroImageSize(featured?.backdropUrl ?? null, "backdrop");',
    );
    expect(magazine).toMatch(
      /<img\s+src=\{featured\.backdropUrl\}[\s\S]{0,400}?width=\{coverSize\?\.width\}[\s\S]{0,120}?height=\{coverSize\?\.height\}/,
    );
  });

  it('no call site asserts a kind that does not match the field it renders', () => {
    const index = read('src/pages/index.astro');
    const magazine = read('src/components/public/MagazineHome.astro');
    for (const source of [index, magazine]) {
      // A poster URL must never be measured with the backdrop aspect.
      expect(source).not.toMatch(/heroImageSize\([^)]*posterUrl[^)]*"backdrop"/);
      // ...and a backdrop URL must never be measured with the poster aspect.
      expect(source).not.toMatch(/heroImageSize\([^)]*backdropUrl[^)]*"poster"/);
    }
  });

  it('the homepage passes the hero preload to the layout', () => {
    const index = read('src/pages/index.astro');
    expect(index).toContain(
      'const coverPreload = isDiscovery\n  ? null\n  : heroImagePreload(featured?.backdropUrl ?? null, "backdrop");',
    );
    expect(index).toContain('preloadImage={coverPreload}');
  });

  it('the layout emits the preload link through the helper call site', () => {
    const base = read('src/layouts/Base.astro');
    expect(base).toContain('heroPreloadLinkAttrs');
    expect(base).toMatch(/<link\s+\{\.\.\.heroPreloadLinkAttrs\(preloadImage\)\}\s*\/>/);
    // No hardcoded preload link elsewhere in the layout.
    expect(base).not.toMatch(/rel=["']preload["']/);
  });

  it('no hardcoded hero size survives in the templates', () => {
    const index = read('src/pages/index.astro');
    const magazine = read('src/components/public/MagazineHome.astro');
    // The old 4:3 guess for a 16:9 TMDB backdrop is gone.
    expect(magazine).not.toContain('width="1280"');
    expect(magazine).not.toContain('height="960"');
    // The hero <img> must not carry a literal size at all.
    expect(index).not.toMatch(/glam-cover-bg[\s\S]{0,400}?width="\d+"/);
  });
});

describe('hero markup wiring: discovery home (CWV follow-up)', () => {
  const discover = () => read('src/components/discover/DiscoverHome.astro');

  it('the discovery hero preload href is the first (eager) slide image URL', () => {
    const src = discover();
    // The preload URL is read from the same source as the eager <img src>.
    expect(src).toContain('const heroFirstUrl = heroSlides[0]?.backdropUrl ?? null;');
    expect(src).toContain('const heroPreload = heroImagePreload(heroFirstUrl, "backdrop");');
    // Slide 0 is the only eager / fetchpriority=high image in the markup.
    expect(src).toMatch(/loading=\{i === 0 \? "eager" : "lazy"\}/);
    expect(src).toMatch(/fetchpriority=\{i === 0 \? "high" : undefined\}/);
    // ...and the eager image's src is that very variable, so href === src.
    expect(src).toContain('const slideUrl = i === 0 ? heroFirstUrl : t.backdropUrl;');
    expect(src).toMatch(/<img\s+class="d-hero-bg"\s+src=\{slideUrl!\}/);
  });

  it('the discovery preload is emitted through the shared attribute bag', () => {
    const src = discover();
    expect(src).toContain('heroPreloadLinkAttrs');
    expect(src).toMatch(/<link \{\.\.\.heroPreloadLinkAttrs\(heroPreload\)\} \/>/);
    // The exact attribute set the discovery preload carries (known variant).
    expect(
      heroPreloadLinkAttrs(heroImagePreload(DISCOVERY_HERO_FIXTURE, 'backdrop')),
    ).toEqual({
      rel: 'preload',
      as: 'image',
      href: DISCOVERY_HERO_FIXTURE,
      width: 1280,
      height: 720,
      fetchpriority: 'high',
    });
  });

  it('no hero image: no preload link at all', () => {
    // Helper level: no URL -> no descriptor -> no link attributes.
    expect(heroImagePreload(null, 'backdrop')).toBeNull();
    expect(heroPreloadLinkAttrs(heroImagePreload(null, 'backdrop'))).toBeNull();
    const src = discover();
    // The component guards the emission on the descriptor, so an empty href
    // can never reach the markup.
    expect(src).toMatch(
      /\{heroPreload \? \([\s\S]{0,400}?<link \{\.\.\.heroPreloadLinkAttrs\(heroPreload\)\} \/>/,
    );
    expect(src).not.toMatch(/<link[^>]*href=\{""\}/);
  });

  it('exactly one hero preload, not one per card', () => {
    const src = discover();
    expect(src.match(/heroPreloadLinkAttrs\(/g) ?? []).toHaveLength(1);
    expect(src.match(/<link/g) ?? []).toHaveLength(1);
    // Every other image in the component stays lazy.
    expect(src).toContain('loading="lazy"');
    expect(src).not.toContain('loading="eager"');
    // The discovery branch of the page passes no head preload, so the
    // component link is the only one on the page.
    const index = read('src/pages/index.astro');
    expect(index).toContain(
      'const coverPreload = isDiscovery\n  ? null\n  : heroImagePreload(featured?.backdropUrl ?? null, "backdrop");',
    );
  });

  it('the discovery preload carries the size pair only for a known variant', () => {
    expect(heroImagePreload(DISCOVERY_HERO_FIXTURE, 'backdrop')).toEqual({
      href: DISCOVERY_HERO_FIXTURE,
      width: 1280,
      height: 720,
    });
    // Unknown variant: preload kept, size pair omitted.
    expect(heroImagePreload(UNKNOWN_VARIANT_FIXTURE.backdropUrl, 'backdrop')).toEqual({
      href: UNKNOWN_VARIANT_FIXTURE.backdropUrl,
    });
    // The backdrop field is measured with the backdrop aspect, never the
    // poster one.
    const src = discover();
    expect(src).not.toMatch(/heroImagePreload\([^)]*posterUrl[^)]*"backdrop"/);
    expect(src).not.toMatch(/heroImagePreload\([^)]*backdropUrl[^)]*"poster"/);
  });
});

describe('font display swap (CWV task 2)', () => {
  it('a Google Fonts URL without a display param gets display=swap appended', () => {
    expect(
      withFontDisplaySwap('https://fonts.googleapis.com/css2?family=Anton&family=Lato:wght@400;700;900'),
    ).toBe('https://fonts.googleapis.com/css2?family=Anton&family=Lato:wght@400;700;900&display=swap');
  });

  it('a display=block URL is left alone (no second display param)', () => {
    const url = 'https://fonts.googleapis.com/css2?family=Anton&display=block';
    expect(withFontDisplaySwap(url)).toBe(url);
    expect(withFontDisplaySwap(url)).not.toContain('display=swap');
  });

  it('a display=swap URL is left alone', () => {
    const url = 'https://fonts.googleapis.com/css2?family=Anton&display=swap';
    expect(withFontDisplaySwap(url)).toBe(url);
  });

  it('a non-Google-Fonts stylesheet is untouched (no foreign query param)', () => {
    expect(withFontDisplaySwap('/fonts/site.css')).toBe('/fonts/site.css');
    expect(withFontDisplaySwap('https://cdn.example.com/fonts.css?v=2')).toBe(
      'https://cdn.example.com/fonts.css?v=2',
    );
  });

  it('empty input stays empty', () => {
    expect(withFontDisplaySwap(null)).toBeNull();
    expect(withFontDisplaySwap(undefined)).toBeNull();
    expect(withFontDisplaySwap('   ')).toBeNull();
  });

  it('the layout routes both font URLs through withFontDisplaySwap', () => {
    const base = read('src/layouts/Base.astro');
    expect(base).toContain('withFontDisplaySwap');
    expect(base).toContain('href={fontHref}');
    expect(base).toContain('href={fallbackFontHref}');
    // The hardcoded fallback already asks for swap; the brand URL is normalized.
    expect(base).toContain('display=swap');
  });
});
