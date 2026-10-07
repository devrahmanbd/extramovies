import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

// Series hub page (S1) — static contract test for the new Astro page only.
// Does NOT retest the lib (mapTvDetails / safeShowDefaults / member store
// all have their own suites). Asserts the page composition the spec
// requires: TV data + TV providers + tv-scoped member UI + TVSeries SEO,
// with no editorial slot and no sitemap entries.

const PAGE = path.join(process.cwd(), 'src', 'pages', 'series', '[tmdbId].astro');

async function src(): Promise<string> {
  return fs.readFile(PAGE, 'utf8');
}

describe('series hub page (S1) contract', () => {
  it('exists and fetches TV meta via getTvMetaSafe (never throws)', async () => {
    const s = await src();
    expect(s).toContain('getTvMetaSafe');
    expect(s).toContain('getTvMetaSafe(tmdbId, region)');
  });

  it('uses TV providers (getTvProvidersRaw + normalize), never the movie endpoint', async () => {
    const s = await src();
    expect(s).toContain('getTvProvidersRaw');
    expect(s).toContain('normalizeWatchProviders');
    expect(s).not.toContain('getStreamingAvailability');
  });

  it('wires member reviews scoped to media="tv"', async () => {
    const s = await src();
    expect(s).toContain('MemberReviewList');
    expect(s).toContain('MemberReviewForm');
    expect(s).toContain('media="tv"');
    expect(s).toContain('"tv", 20');
  });

  it('emits TVSeries + BreadcrumbList JSON-LD; aggregateRating only with member data', async () => {
    const s = await src();
    expect(s).toContain('"TVSeries"');
    expect(s).toContain('breadcrumbJsonLd');
    expect(s).toContain('aggregateRating');
    expect(s).toContain('memberRatings.length > 0');
  });

  it('noindex when !ok and guards non-numeric ids with 404', async () => {
    const s = await src();
    expect(s).toContain('"noindex, follow"');
    expect(s).toContain('/^\\d+$/');
  });

  it('has no editorial slot and adds no sitemap entries', async () => {
    const s = await src();
    expect(s).not.toContain('findReviewForTmdbId');
    expect(s).not.toContain('MovieShowcase');
    const sitemap = await fs.readFile(
      path.join(process.cwd(), 'src', 'pages', 'sitemap.xml.ts'),
      'utf8',
    );
    expect(sitemap).not.toContain('/series/');
  });

  it('tolerates null show fields (safeShowDefaults path)', async () => {
    const s = await src();
    expect(s).toContain('show.year ?');
    expect(s).toContain('genreNames.length > 0');
    expect(s).toContain('show.posterUrl ?');
  });
});
