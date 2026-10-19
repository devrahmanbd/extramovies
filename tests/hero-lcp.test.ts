import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { heroImagePreload, heroImageSize, heroImageVariant } from '../src/lib/seo/hero-image';
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
 * The size pair is derived from the TMDB variant carried in the URL. An
 * unknown variant yields NO pair (never a guessed ratio) while the preload
 * is still emitted — the preload is size-agnostic.
 *
 * Rendering note: the repo has no Astro render harness (vitest runs without
 * the astro vite plugin and the brief forbids adding one), so the "rendered
 * markup" assertions below mirror Astro's attribute contract locally
 * (`width={n}` renders as `width="n"`, undefined attributes are omitted) and
 * pin the template wiring by source, the way tests/publication.test.ts does.
 */

const root = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

/** Publication theme fixture: the featured row the homepage renders. */
const PUBLICATION_FIXTURE = {
  backdropUrl: 'https://image.tmdb.org/t/p/w1280/eZ239CUp1d6OryZEBPnO2n87gMG.jpg',
  posterUrl: 'https://image.tmdb.org/t/p/w780/6izwz7rsy95ARzTR3poZ8H6c5pp.jpg',
};

/** Same fixture with a variant we cannot map (TMDB `original`). */
const UNKNOWN_VARIANT_FIXTURE = {
  backdropUrl: 'https://image.tmdb.org/t/p/original/eZ239CUp1d6OryZEBPnO2n87gMG.jpg',
};

/** A locally hosted upload — no TMDB variant at all. */
const UPLOAD_FIXTURE = { backdropUrl: '/uploads/cover-backdrop.jpg' };

/** Astro renders `width={n}` as `width="n"`; undefined attributes are omitted. */
function renderSizeAttrs(size: { width: number; height: number } | null): string {
  return size ? ` width="${size.width}" height="${size.height}"` : '';
}

/** The head preload the layout emits for a hero image. */
function renderPreloadLink(
  preload: { href: string; width?: number; height?: number } | null,
): string {
  if (!preload) return '';
  const size =
    preload.width && preload.height
      ? ` width="${preload.width}" height="${preload.height}"`
      : '';
  return `<link rel="preload" as="image" href="${preload.href}"${size} fetchpriority="high" />`;
}

describe('hero image intrinsic size (CWV task 2)', () => {
  it('w1280 backdrop resolves to 1280x720', () => {
    expect(heroImageSize(PUBLICATION_FIXTURE.backdropUrl, 'backdrop')).toEqual({
      width: 1280,
      height: 720,
    });
  });

  it('w780 backdrop resolves to 780x439', () => {
    expect(
      heroImageSize('https://image.tmdb.org/t/p/w780/rvtdN5XkWAfGX6xDuPL6yYS2seK.jpg', 'backdrop'),
    ).toEqual({ width: 780, height: 439 });
  });

  it('poster w300 resolves to 300x450', () => {
    expect(
      heroImageSize('https://image.tmdb.org/t/p/w300/6izwz7rsy95ARzTR3poZ8H6c5pp.jpg', 'poster'),
    ).toEqual({ width: 300, height: 450 });
  });

  it('unknown variant (original) resolves to no size pair', () => {
    expect(heroImageSize(UNKNOWN_VARIANT_FIXTURE.backdropUrl, 'backdrop')).toBeNull();
  });

  it('non-TMDB URL resolves to no size pair', () => {
    expect(heroImageSize(UPLOAD_FIXTURE.backdropUrl, 'backdrop')).toBeNull();
    expect(heroImageSize(null, 'backdrop')).toBeNull();
    expect(heroImageSize(undefined, 'poster')).toBeNull();
  });

  it('w780 is kind-dependent: backdrop 780x439, poster yields no pair (never guess)', () => {
    // TMDB serves w780 in both the backdrop and the poster namespace, so the
    // caller must state the shape instead of the URL guessing it.
    expect(heroImageSize(PUBLICATION_FIXTURE.posterUrl, 'backdrop')).toEqual({
      width: 780,
      height: 439,
    });
    expect(heroImageSize(PUBLICATION_FIXTURE.posterUrl, 'poster')).toBeNull();
  });

  it('variant extraction reads the TMDB path segment', () => {
    expect(heroImageVariant(PUBLICATION_FIXTURE.backdropUrl)).toBe('w1280');
    expect(heroImageVariant(UNKNOWN_VARIANT_FIXTURE.backdropUrl)).toBe('original');
    expect(heroImageVariant(UPLOAD_FIXTURE.backdropUrl)).toBeNull();
    expect(heroImageVariant(null)).toBeNull();
  });
});

describe('hero image preload (CWV task 2)', () => {
  it('known variant: preload carries the href and the intrinsic pair', () => {
    expect(heroImagePreload(PUBLICATION_FIXTURE.backdropUrl, 'backdrop')).toEqual({
      href: PUBLICATION_FIXTURE.backdropUrl,
      width: 1280,
      height: 720,
    });
  });

  it('unknown variant: preload kept, size pair omitted', () => {
    expect(heroImagePreload(UNKNOWN_VARIANT_FIXTURE.backdropUrl, 'backdrop')).toEqual({
      href: UNKNOWN_VARIANT_FIXTURE.backdropUrl,
    });
    expect(heroImagePreload(UPLOAD_FIXTURE.backdropUrl, 'backdrop')).toEqual({
      href: UPLOAD_FIXTURE.backdropUrl,
    });
  });

  it('no hero URL: no preload at all', () => {
    expect(heroImagePreload(null, 'backdrop')).toBeNull();
    expect(heroImagePreload('', 'backdrop')).toBeNull();
    expect(heroImagePreload('   ', 'backdrop')).toBeNull();
  });
});

describe('rendered hero markup: publication home + magazine (CWV task 2)', () => {
  it('publication home renders the backdrop img with the intrinsic pair and preloads the same URL', () => {
    const size = heroImageSize(PUBLICATION_FIXTURE.backdropUrl, 'backdrop');
    const img = `<img class="glam-cover-bg" src="${PUBLICATION_FIXTURE.backdropUrl}"${renderSizeAttrs(size)} />`;
    expect(img).toContain('width="1280"');
    expect(img).toContain('height="720"');

    const head = renderPreloadLink(heroImagePreload(PUBLICATION_FIXTURE.backdropUrl, 'backdrop'));
    expect(head).toContain('rel="preload"');
    expect(head).toContain('as="image"');
    expect(head).toContain(`href="${PUBLICATION_FIXTURE.backdropUrl}"`);
    expect(head).toContain('width="1280"');
    expect(head).toContain('height="720"');
  });

  it('variant-unknown fixture: size pair omitted, preload kept', () => {
    const size = heroImageSize(UNKNOWN_VARIANT_FIXTURE.backdropUrl, 'backdrop');
    expect(size).toBeNull();
    const img = `<img class="glam-cover-bg" src="${UNKNOWN_VARIANT_FIXTURE.backdropUrl}"${renderSizeAttrs(size)} />`;
    expect(img).not.toContain('width=');
    expect(img).not.toContain('height=');

    const head = renderPreloadLink(heroImagePreload(UNKNOWN_VARIANT_FIXTURE.backdropUrl, 'backdrop'));
    expect(head).toContain('rel="preload"');
    expect(head).toContain(`href="${UNKNOWN_VARIANT_FIXTURE.backdropUrl}"`);
    expect(head).not.toContain('width=');
    expect(head).not.toContain('height=');
  });

  it('magazine cover renders the same intrinsic pair', () => {
    const size = heroImageSize(PUBLICATION_FIXTURE.backdropUrl, 'backdrop');
    const img = `<img src="${PUBLICATION_FIXTURE.backdropUrl}"${renderSizeAttrs(size)} />`;
    expect(img).toContain('width="1280"');
    expect(img).toContain('height="720"');
  });

  it('templates wire the helpers (no hardcoded hero size left behind)', () => {
    const index = read('src/pages/index.astro');
    expect(index).toContain('heroImageSize(');
    expect(index).toContain('heroImagePreload(');
    expect(index).toContain('width={coverSize?.width}');
    expect(index).toContain('height={coverSize?.height}');
    expect(index).toContain('preloadImage={coverPreload}');

    const magazine = read('src/components/public/MagazineHome.astro');
    expect(magazine).toContain('heroImageSize(');
    expect(magazine).toContain('width={coverSize?.width}');
    expect(magazine).toContain('height={coverSize?.height}');
    // The old hardcoded 4:3 guess (1280x960) is gone — the pair is derived.
    expect(magazine).not.toContain('width="1280"');
    expect(magazine).not.toContain('height="960"');

    const base = read('src/layouts/Base.astro');
    expect(base).toContain('preloadImage');
    expect(base).toMatch(/rel[:=]\s*["']preload["']/);
    expect(base).toMatch(/as[:=]\s*["']image["']/);
  });
});

describe('font display swap (CWV task 2)', () => {
  it('Google Fonts URL without display=swap gets it appended', () => {
    expect(
      withFontDisplaySwap('https://fonts.googleapis.com/css2?family=Anton&family=Lato:wght@400;700;900'),
    ).toBe('https://fonts.googleapis.com/css2?family=Anton&family=Lato:wght@400;700;900&display=swap');
  });

  it('URL that already carries display=swap is untouched', () => {
    const url = 'https://fonts.googleapis.com/css2?family=Anton&display=swap';
    expect(withFontDisplaySwap(url)).toBe(url);
  });

  it('non-Google-Fonts stylesheet is untouched (no foreign query param)', () => {
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

  it('Base layout routes both font URLs through withFontDisplaySwap', () => {
    const base = read('src/layouts/Base.astro');
    expect(base).toContain('withFontDisplaySwap');
    // The hardcoded fallback already asks for swap; the brand URL is normalized.
    expect(base).toContain('display=swap');
  });
});
