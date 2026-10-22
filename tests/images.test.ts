import { describe, expect, it } from 'vitest';
import {
  TMDB_BACKDROP_SIZES,
  TMDB_CARD_SIZES,
  TMDB_IMAGE_ORIGIN,
  TMDB_POSTER_SIZES,
  tmdbImageAt,
  tmdbImagePath,
  tmdbSrcSet,
  tmdbWidthOf,
} from '../src/lib/seo/images';

/**
 * TMDB responsive artwork (CWV task 4).
 *
 * A srcset is only emitted for genuine TMDB artwork: null / empty / upload /
 * foreign inputs return null and the caller keeps the plain src it already
 * rendered. These are L1 behaviour assertions on the pure helper.
 */

const POSTER = 'https://image.tmdb.org/t/p/w342/upwdEyhhYZ7pT2hD535fr2MGfpx.jpg';
const BACKDROP = 'https://image.tmdb.org/t/p/w1280/9PFonBhy4cQy7Jz20NpMygczOkv.jpg';
const UPLOAD = '/uploads/cover-backdrop.jpg';
const FOREIGN = 'https://cdn.example.com/art/w500/poster.jpg';

describe('tmdbWidthOf', () => {
  it('reads the pixel width out of a wN variant', () => {
    expect(tmdbWidthOf('w185')).toBe(185);
    expect(tmdbWidthOf('w1280')).toBe(1280);
    expect(tmdbWidthOf(' W342 ')).toBe(342);
  });

  it('returns null for a non-width variant or garbage', () => {
    expect(tmdbWidthOf('original')).toBeNull();
    expect(tmdbWidthOf('w0')).toBeNull();
    expect(tmdbWidthOf('')).toBeNull();
  });
});

describe('tmdbImagePath', () => {
  it('extracts the file part of a TMDB URL, whatever the variant', () => {
    expect(tmdbImagePath(POSTER)).toBe('/upwdEyhhYZ7pT2hD535fr2MGfpx.jpg');
    expect(tmdbImagePath(BACKDROP)).toBe('/9PFonBhy4cQy7Jz20NpMygczOkv.jpg');
    expect(tmdbImagePath('https://image.tmdb.org/t/p/original/x.webp')).toBe('/x.webp');
  });

  it('accepts a bare TMDB file path', () => {
    expect(tmdbImagePath('/9PFonBhy4cQy7Jz20NpMygczOkv.jpg')).toBe(
      '/9PFonBhy4cQy7Jz20NpMygczOkv.jpg',
    );
  });

  it('returns null for a null, empty, upload or foreign path', () => {
    expect(tmdbImagePath(null)).toBeNull();
    expect(tmdbImagePath(undefined)).toBeNull();
    expect(tmdbImagePath('')).toBeNull();
    expect(tmdbImagePath('   ')).toBeNull();
    expect(tmdbImagePath(UPLOAD)).toBeNull();
    expect(tmdbImagePath(FOREIGN)).toBeNull();
    expect(tmdbImagePath('image.tmdb.org/t/p/w500/x.jpg')).toBeNull();
  });
});

describe('tmdbImageAt', () => {
  it('rebuilds the URL at another variant', () => {
    expect(tmdbImageAt(POSTER, 'w185')).toBe(
      `${TMDB_IMAGE_ORIGIN}/t/p/w185/upwdEyhhYZ7pT2hD535fr2MGfpx.jpg`,
    );
    expect(tmdbImageAt(POSTER, 'w500')).toBe(
      `${TMDB_IMAGE_ORIGIN}/t/p/w500/upwdEyhhYZ7pT2hD535fr2MGfpx.jpg`,
    );
  });

  it('returns null for a non-TMDB path or an empty variant', () => {
    expect(tmdbImageAt(null, 'w500')).toBeNull();
    expect(tmdbImageAt(UPLOAD, 'w500')).toBeNull();
    expect(tmdbImageAt(FOREIGN, 'w500')).toBeNull();
    expect(tmdbImageAt(POSTER, '')).toBeNull();
  });
});

describe('tmdbSrcSet', () => {
  it('is null for a null path and for non-TMDB artwork (the plain src fallback)', () => {
    expect(tmdbSrcSet(null)).toBeNull();
    expect(tmdbSrcSet(undefined)).toBeNull();
    expect(tmdbSrcSet('')).toBeNull();
    expect(tmdbSrcSet(UPLOAD)).toBeNull();
    expect(tmdbSrcSet(FOREIGN)).toBeNull();
  });

  it('emits one candidate for a single size', () => {
    expect(tmdbSrcSet(POSTER, ['w342'])).toBe(
      `${TMDB_IMAGE_ORIGIN}/t/p/w342/upwdEyhhYZ7pT2hD535fr2MGfpx.jpg 342w`,
    );
  });

  it('keeps the caller order and the poster ladder by default', () => {
    expect(tmdbSrcSet(POSTER)).toBe(
      [
        `${TMDB_IMAGE_ORIGIN}/t/p/w185/upwdEyhhYZ7pT2hD535fr2MGfpx.jpg 185w`,
        `${TMDB_IMAGE_ORIGIN}/t/p/w342/upwdEyhhYZ7pT2hD535fr2MGfpx.jpg 342w`,
        `${TMDB_IMAGE_ORIGIN}/t/p/w500/upwdEyhhYZ7pT2hD535fr2MGfpx.jpg 500w`,
      ].join(', '),
    );
    expect(tmdbSrcSet(POSTER)).toBe(tmdbSrcSet(POSTER, TMDB_POSTER_SIZES));
  });

  it('rewrites the hero ladder from whatever variant the source carries', () => {
    expect(tmdbSrcSet(BACKDROP, TMDB_BACKDROP_SIZES)).toBe(
      [
        `${TMDB_IMAGE_ORIGIN}/t/p/w780/9PFonBhy4cQy7Jz20NpMygczOkv.jpg 780w`,
        `${TMDB_IMAGE_ORIGIN}/t/p/w1280/9PFonBhy4cQy7Jz20NpMygczOkv.jpg 1280w`,
      ].join(', '),
    );
  });

  it('skips candidates without a numeric width instead of emitting a broken descriptor', () => {
    expect(tmdbSrcSet(POSTER, ['original', 'w500'])).toBe(
      `${TMDB_IMAGE_ORIGIN}/t/p/w500/upwdEyhhYZ7pT2hD535fr2MGfpx.jpg 500w`,
    );
    expect(tmdbSrcSet(POSTER, ['original'])).toBeNull();
    expect(tmdbSrcSet(POSTER, [])).toBeNull();
  });

  it('the card ladder is the poster ladder plus w780 for large slots', () => {
    expect(TMDB_CARD_SIZES).toEqual(['w185', 'w342', 'w500', 'w780']);
    expect(tmdbSrcSet(POSTER, TMDB_CARD_SIZES)!.endsWith('780w')).toBe(true);
  });
});
