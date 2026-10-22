import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tmdbOriginHints, TMDB_IMAGE_ORIGIN_URL } from '../src/lib/seo/asset-hints';

/**
 * CWV round (2026-10-22) wiring:
 *   1. image-origin hints — preconnect + dns-prefetch, emitted only for
 *      pages that carry TMDB artwork, earlier in the head than the preload;
 *   2. the homepage ships no animation library (native smooth scroll);
 *   3. the homepage's independent TMDB feeds are awaited together.
 *
 * L1 = the pure helper; L2 = the template call sites (no Astro render
 * harness exists in this repo — vitest runs without the astro vite plugin,
 * so markup is asserted from source).
 */

const root = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const TMDB = 'https://image.tmdb.org/t/p/w1280/9PFonBhy4cQy7Jz20NpMygczOkv.jpg';
const UPLOAD = '/uploads/cover-backdrop.jpg';

describe('tmdbOriginHints', () => {
  it('returns preconnect + dns-prefetch for the TMDB image origin', () => {
    expect(tmdbOriginHints([TMDB])).toEqual({
      preconnect: {
        rel: 'preconnect',
        href: TMDB_IMAGE_ORIGIN_URL,
        crossorigin: 'anonymous',
      },
      dnsPrefetch: { rel: 'dns-prefetch', href: TMDB_IMAGE_ORIGIN_URL },
    });
    expect(TMDB_IMAGE_ORIGIN_URL).toBe('https://image.tmdb.org');
  });

  it('is null when nothing on the page is TMDB artwork (no unused connection)', () => {
    expect(tmdbOriginHints([])).toBeNull();
    expect(tmdbOriginHints([null, undefined])).toBeNull();
    expect(tmdbOriginHints([UPLOAD])).toBeNull();
    expect(tmdbOriginHints(['https://cdn.example.com/x.jpg'])).toBeNull();
    expect(tmdbOriginHints([''])).toBeNull();
  });

  it('finds the one TMDB URL in a mixed list', () => {
    expect(tmdbOriginHints([null, UPLOAD, TMDB])).not.toBeNull();
  });
});

describe('image-origin hints: layout wiring', () => {
  const base = read('src/layouts/Base.astro');

  it('the layout derives the hints from the preload and the page image', () => {
    expect(base).toContain('const imageHints = tmdbOriginHints([preloadImage?.href, image]);');
  });

  it('preconnect + dns-prefetch are spread from the helper (no hardcoded host)', () => {
    expect(base).toContain('<link {...imageHints.preconnect} />');
    expect(base).toContain('<link {...imageHints.dnsPrefetch} />');
    // The origin string lives in the helper only.
    expect(base).not.toContain('image.tmdb.org');
  });

  it('the hints come BEFORE the LCP preload in the head', () => {
    const preconnectAt = base.indexOf('imageHints.preconnect');
    const preloadAt = base.indexOf('heroPreloadLinkAttrs(preloadImage)');
    expect(preconnectAt).toBeGreaterThan(-1);
    expect(preloadAt).toBeGreaterThan(-1);
    expect(preconnectAt).toBeLessThan(preloadAt);
    // ... and both are inside <head>.
    expect(preconnectAt).toBeLessThan(base.indexOf('</head>'));
  });
});

describe('homepage ships no animation library', () => {
  const discover = read('src/components/discover/DiscoverHome.astro');
  const pkg = JSON.parse(read('package.json')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  it('gsap is gone from the dependency tree', () => {
    expect(pkg.dependencies?.gsap).toBeUndefined();
    expect(pkg.devDependencies?.gsap).toBeUndefined();
  });

  it('nothing under src/ imports gsap any more', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(astro|ts|tsx|js|mjs)$/.test(entry.name)) {
          if (/\bgsap\b/i.test(fs.readFileSync(full, 'utf8'))) {
            offenders.push(path.relative(root, full));
          }
        }
      }
    };
    walk(path.join(root, 'src'));
    expect(offenders).toEqual([]);
  });

  it('the hero slider animates with native compositor smooth scroll', () => {
    expect(discover).toContain('track.scrollTo({ left, behavior: "smooth" })');
    // The instant path is unchanged, and both paths still re-mark the dots.
    expect(discover).toContain('track.scrollLeft = left;');
    expect(discover).toContain('mark(index);');
  });

  it('every behaviour of the old tween survives', () => {
    // autoplay every 6s, dot aria-current, arrows, scroll re-mark, pause on
    // hover/focus, tab-hidden pause, reduced-motion early return.
    expect(discover).toContain('setInterval(() => go(index + 1), 6000)');
    expect(discover).toContain('d.setAttribute("aria-current", "true")');
    expect(discover).toContain('querySelectorAll("[data-hero-goto]")');
    expect(discover).toContain('track.addEventListener("scroll"');
    expect(discover).toContain('addEventListener("mouseenter", stop)');
    expect(discover).toContain('addEventListener("mouseleave", play)');
    expect(discover).toContain('addEventListener("focusin", stop)');
    expect(discover).toContain('addEventListener("focusout", play)');
    expect(discover).toContain('document.addEventListener("visibilitychange"');
    expect(discover).toContain(
      'if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;',
    );
  });
});

describe('homepage feeds: concurrency with per-call fail-soft', () => {
  const index = read('src/pages/index.astro');
  const block = index.slice(
    index.indexOf('const discoveryFeeds = isDiscovery'),
    index.indexOf('const discoveryTop'),
  );

  it('the eight independent TMDB calls run through one Promise.all', () => {
    expect(block).toContain('await Promise.all([');
    for (const call of [
      'getTrending().catch(() => [])',
      'getPopular().catch(() => [])',
      'getNowPlaying().catch(() => [])',
      'getUpcoming().catch(() => [])',
      'discoverBy("free", "US").catch(() => [])',
      'discoverBy("stream").catch(() => [])',
      'discoverBy("rent").catch(() => [])',
      'listTmdbGenres().catch(() => [])',
    ]) {
      expect(block).toContain(call);
    }
    // No sequential await is left in the block.
    expect(block.match(/await /g)?.length).toBe(1);
  });

  it('the isDiscovery guard still gates the batch and the tuple order is fixed', () => {
    expect(block).toContain('const discoveryFeeds = isDiscovery');
    expect(block).toContain(': null;');
    const order = [
      'discoveryFeeds?.[0] ?? []',
      'discoveryFeeds?.[1] ?? []',
      'discoveryFeeds?.[2] ?? []',
      'discoveryFeeds?.[3] ?? []',
      'discoveryFeeds?.[4] ?? []',
      'discoveryFeeds?.[5] ?? []',
      'discoveryFeeds?.[6] ?? []',
      'discoveryFeeds?.[7] ?? []',
    ];
    const positions = order.map((needle) => block.indexOf(needle));
    expect(positions.every((p) => p > -1)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    // Same values feed the same names as before.
    for (const assignment of [
      'const trending = discoveryFeeds?.[0]',
      'const popular = discoveryFeeds?.[1]',
      'const nowPlaying = discoveryFeeds?.[2]',
      'const upcoming = discoveryFeeds?.[3]',
      'const freeTiles = discoveryFeeds?.[4]',
      'const streamTiles = discoveryFeeds?.[5]',
      'const rentTiles = discoveryFeeds?.[6]',
      'const tmdbGenres = discoveryFeeds?.[7]',
    ]) {
      expect(block).toContain(assignment);
    }
  });
});

describe('responsive artwork: template wiring', () => {
  it('the discovery hero <img> carries srcset + sizes, non-TMDB safe', () => {
    const discover = read('src/components/discover/DiscoverHome.astro');
    expect(discover).toContain(
      'const slideSrcSet = tmdbSrcSet(slideUrl, TMDB_BACKDROP_SIZES);',
    );
    expect(discover).toMatch(
      /<img\s+class="d-hero-bg"\s+src=\{slideUrl!\}\s+srcset=\{slideSrcSet \?\? undefined\}\s+sizes=\{slideSrcSet \? "100vw" : undefined\}/,
    );
    // Intrinsic pair and priority unchanged.
    expect(discover).toContain('width="1280"');
    expect(discover).toContain('height="720"');
    expect(discover).toContain('fetchpriority={i === 0 ? "high" : undefined}');
  });

  it('the publication cover <img> carries srcset + sizes', () => {
    const index = read('src/pages/index.astro');
    expect(index).toContain(
      'const coverSrcSet = tmdbSrcSet(featured?.backdropUrl ?? null, TMDB_BACKDROP_SIZES);',
    );
    expect(index).toMatch(
      /<img\s+class="glam-cover-bg"[\s\S]{0,200}?srcset=\{coverSrcSet \?\? undefined\}\s+sizes=\{coverSrcSet \? "100vw" : undefined\}/,
    );
  });

  it('poster tiles get the poster ladder and keep their width/height pair', () => {
    const tile = read('src/components/discover/MovieTile.astro');
    expect(tile).toContain('const posterSrcSet = isLead ? null : tmdbSrcSet(posterUrl, TMDB_POSTER_SIZES);');
    expect(tile).toContain('srcset={posterSrcSet ?? undefined}');
    expect(tile).toContain('sizes={posterSrcSet ? posterSizes : undefined}');
    // Large lead art keeps its 780-wide source: w500 would soften it.
    expect(tile).toContain('width={isLead ? "780" : "342"}');
    expect(tile).toContain('height={isLead ? "1170" : "513"}');
  });

  it('review cards get srcset on every poster thumb but never on the 1280 lead', () => {
    const card = read('src/components/public/ReviewCard.astro');
    expect(card).toContain('const thumbSrcSet = tmdbSrcSet(thumbArt, TMDB_POSTER_SIZES);');
    expect(card).toContain('const largeSrcSet = tmdbSrcSet(thumbArt, TMDB_CARD_SIZES);');
    expect(card.match(/srcset=\{/g)).toHaveLength(5);
    // The lead (backdropArt 1280x720) block is untouched.
    expect(card).toMatch(
      /<img\s+src=\{leadArt\}[\s\S]{0,120}?width="1280"[\s\S]{0,80}?height="720"/,
    );
    // Every width/height attribute the cards had is still there.
    for (const pair of [
      ['600', '900'],
      ['120', '180'],
      ['88', '132'],
    ]) {
      expect(card).toContain(`width="${pair[0]}"`);
      expect(card).toContain(`height="${pair[1]}"`);
    }
  });

  it('the homepage review thumbs cap their download at their real slot', () => {
    const discover = read('src/components/discover/DiscoverHome.astro');
    const week = read('src/components/discover/NewThisWeek.astro');
    // Top-ranked row: 3.5rem/.index-thumb box (56px) instead of a w780 poster.
    expect(discover).toContain('const thumbSrcSet = tmdbSrcSet(r.posterUrl, TMDB_POSTER_SIZES);');
    expect(discover).toContain('srcset={thumbSrcSet ?? undefined}');
    expect(discover).toContain('sizes={thumbSrcSet ? "56px" : undefined}');
    // Weekly shelf: five-across at >=64rem, 48rem shelf, 56px narrow row.
    expect(week).toContain(
      'const WEEK_THUMB_SIZES = "(min-width: 64rem) 210px, (min-width: 48rem) 140px, 56px";',
    );
    expect(week).toContain('sizes={thumbSrcSet ? WEEK_THUMB_SIZES : undefined}');
    // Intrinsic pairs kept.
    expect(discover).toContain('width="88"');
    expect(discover).toContain('height="132"');
    expect(week).toContain('width="342"');
    expect(week).toContain('height="513"');
  });
});

describe('hero dot tap targets (Lighthouse target-size)', () => {
  const css = read('src/styles/global.css');

  it('the dot link box is 24x24 while the dot itself stays 14px', () => {
    const block = css.slice(css.indexOf('CWV 2026-10-22 — hero dot tap targets'));
    expect(block).toContain('width: 24px;');
    expect(block).toContain('height: 24px;');
    expect(block).toContain('min-width: 24px;');
    expect(block).toContain('.d-hero-dots a::before {');
    expect(block).toContain('width: 14px;');
    expect(block).toContain('height: 14px;');
  });
});
