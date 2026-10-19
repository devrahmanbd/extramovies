import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeLegacyPath, parseCsv, buildTables, createLegacyRouter, isStaticAssetPath } from '../src/lib/legacy/router';

describe('normalizeLegacyPath', () => {
  it('lowercases, strips trailing slash and query', () => {
    expect(normalizeLegacyPath('/18-Movies/The-Evil-Dead-1981-Hindi-Dubbed-480P-Full-Movie-Download/')).toBe('/the-evil-dead-1981-hindi-dubbed-480p-full-movie-download');
    expect(normalizeLegacyPath('/foo/?utm=x')).toBe('/foo');
  });
  it('strips category prefix and feed shells (leading-only, mirroring the tool)', () => {
    expect(normalizeLegacyPath('/300mb-movies/foo/feed/')).toBe('/foo');
    expect(normalizeLegacyPath('/web-series/bar/page/3/')).toBe('/bar/page/3');
    expect(normalizeLegacyPath('/page/7/')).toBe('/page/7');
  });
  it('keeps .php player paths and numeric pages intact', () => {
    expect(normalizeLegacyPath('/9xplay.php?url=abc')).toBe('/9xplay.php');
    expect(normalizeLegacyPath('/1059/')).toBe('/1059');
  });
  it('root normalizes to empty', () => {
    expect(normalizeLegacyPath('/')).toBe('');
    expect(normalizeLegacyPath('/feed/')).toBe('');
  });
});

describe('parseCsv', () => {
  it('handles quoted commas', () => {
    const rows = parseCsv('a,b\n"x,1",2\n');
    expect(rows).toEqual([['a', 'b'], ['x,1', '2']]);
  });
});

describe('buildTables', () => {
  it('map rows -> 301 targets, /410 and unresolved rows -> gone set, "/" skipped', () => {
    const mapText = [
      'legacy_path,target_path,tmdb_type,tmdb_id,confidence,title,year',
      '/foo-2019-full-movie-download/,/movies/123,movie,123,1.0,Foo,2019',
      '/bar-2001-full-movie-download/,/410,post,,0,,2001',
      '/,/ ,post,,0,,',
    ].join('\n');
    const unresText = [
      'legacy_url,reason',
      'http://ww7.extramovies.org:80/9xplay.php?url=abc,player',
      'http://ww7.extramovies.org:80/baz-2005-full-movie-download/,unresolved',
    ].join('\n');
    const t = buildTables(mapText, unresText);
    expect(t.map.get('/foo-2019-full-movie-download')).toBe('/movies/123');
    expect(t.unresolved.has('/bar-2001-full-movie-download')).toBe(true);
    expect(t.unresolved.has('/9xplay.php')).toBe(true);
    expect(t.unresolved.has('/baz-2005-full-movie-download')).toBe(true);
    expect(t.map.has('')).toBe(false);
  });
  it('map wins over unresolved for the same path', () => {
    const t = buildTables(
      'legacy_path,target_path\n/x/,/movies/1',
      'legacy_url,reason\nhttp://h/x/,unresolved',
    );
    expect(t.map.get('/x')).toBe('/movies/1');
    expect(t.unresolved.has('/x')).toBe(false);
  });
});

describe('createLegacyRouter (IO, fail-soft, hot reload)', () => {
  it('missing dir disables: check() passes through', () => {
    const r = createLegacyRouter(path.join(os.tmpdir(), 'legacy-nonexistent-xyz'));
    expect(r.check('/foo')).toBeNull();
    expect(r.stats()).toEqual({ ready: false, mapped: 0, gone: 0 });
  });
  it('serves 301/410 from fixture files, reloads on mtime change', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-fixture-'));
    fs.writeFileSync(path.join(dir, 'redirect_map.csv'), 'legacy_path,target_path,tmdb_type,tmdb_id,confidence,title,year\n/old-movie-2019-full-movie-download/,/movies/123,movie,123,1.0,Foo,2019\n');
    fs.writeFileSync(path.join(dir, 'unresolved.csv'), 'legacy_url,reason\n/9xplay.php,player\n');
    const r = createLegacyRouter(dir);

    const gone = r.check('/9xplay.php?url=abc');
    expect(gone?.status).toBe(410);
    const moved = r.check('/18-movies/old-movie-2019-full-movie-download/');
    expect(moved?.status).toBe(301);
    expect(moved?.headers.get('Location')).toBe('/movies/123');
    expect(r.check('/not-in-any-map')).toBeNull();
    expect(r.check('/')).toBeNull();

    fs.writeFileSync(path.join(dir, 'redirect_map.csv'), 'legacy_path,target_path,tmdb_type,tmdb_id,confidence,title,year\n/old-movie-2019-full-movie-download/,/movies/999,movie,999,1.0,Foo,2019\n');
    const moved2 = r.check('/old-movie-2019-full-movie-download/');
    expect(moved2?.headers.get('Location')).toBe('/movies/999');
  });
});

describe('isStaticAssetPath', () => {
  it('exempts root-level files with a static-asset extension', () => {
    for (const p of [
      '/robots.txt',
      '/favicon.ico',
      '/sitemap.xml',
      '/rss.xml',
      '/style.css',
      '/app.js',
      '/data.json',
      '/font.woff2',
    ]) {
      expect(isStaticAssetPath(p)).toBe(true);
    }
  });
  it('exempts any file under a known asset namespace, whatever the extension', () => {
    for (const p of [
      '/brand/noir-cinema/logo.svg',
      '/brand/noir-cinema/favicon.ico',
      '/uploads/hero.png',
      '/uploads/poster.jpg',
      '/uploads/still.webp',
      '/uploads/loop.gif',
      '/assets/site.css',
      '/assets/app.js',
      '/images/cover.jpeg',
      '/img/thumb.avif',
      '/media/clip.mp4',
      '/media/clip.webm',
      '/css/main.css',
      '/js/app.js',
      '/fonts/inter.woff',
      '/static/logo.svg',
      '/_astro/index.hash.js',
      '/vendor/lib.min.js',
      '/uploads/nested/deep/file.bin',
    ]) {
      expect(isStaticAssetPath(p)).toBe(true);
    }
  });
  it('keeps dated legacy image paths in legacy scope (not root, not a namespace)', () => {
    // The WordPress-era corpus holds uploaded images under dated paths.
    // Those must keep their legacy answer (410 / 301), not 404.
    expect(isStaticAssetPath('/2017/05/12/film.jpg')).toBe(false);
    expect(isStaticAssetPath('/2017/05/12/film.png')).toBe(false);
    expect(isStaticAssetPath('/2018/03/04/poster.webp')).toBe(false);
    expect(isStaticAssetPath('/wp-content/uploads/2017/05/12/film.jpg')).toBe(false);
  });
  it('keeps php and content paths out of the allowlist', () => {
    expect(isStaticAssetPath('/9xplay.php')).toBe(false);
    expect(isStaticAssetPath('/9xplay.php?url=abc')).toBe(false);
    expect(isStaticAssetPath('/2016/he-said-she-said-1991-720p/')).toBe(false);
    expect(isStaticAssetPath('/movies/123')).toBe(false);
    expect(isStaticAssetPath('/reviews/dune-part-two')).toBe(false);
    expect(isStaticAssetPath('/')).toBe(false);
    expect(isStaticAssetPath('/some.movie.2020/')).toBe(false);
    expect(isStaticAssetPath('/robots.php')).toBe(false);
  });
  it('is case-insensitive and ignores the query string / fragment', () => {
    expect(isStaticAssetPath('/ROBOTS.TXT')).toBe(true);
    expect(isStaticAssetPath('/Favicon.ICO')).toBe(true);
    expect(isStaticAssetPath('/BRAND/noir-cinema/logo.svg')).toBe(true);
    expect(isStaticAssetPath('/robots.txt?x=1')).toBe(true);
    expect(isStaticAssetPath('/robots.txt#top')).toBe(true);
  });
  it('normalizes before the check: trailing slash and percent-encoded dot match', () => {
    expect(isStaticAssetPath('/robots.txt/')).toBe(true);
    expect(isStaticAssetPath('/robots%2Etxt')).toBe(true);
    expect(isStaticAssetPath('/FAVICON%2EICO')).toBe(true);
  });
});

describe('createLegacyRouter (live assets are never legacy-scoped)', () => {
  // The Wayback corpus archived a robots.txt and a favicon.ico, so the live
  // asset paths sit in the legacy "unresolved" set and used to be answered
  // 410 Gone — which blocked the crawl and killed the favicon.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-assets-'));
  fs.writeFileSync(
    path.join(dir, 'redirect_map.csv'),
    [
      'legacy_path,target_path,tmdb_type,tmdb_id,confidence,title,year',
      '/old-movie-2019-full-movie-download/,/movies/123,movie,123,1.0,Foo,2019',
      '/2018/03/04/poster.png,/movies/456,movie,456,1.0,Poster,2018',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(dir, 'unresolved.csv'),
    [
      'legacy_url,reason',
      'http://ww7.extramovies.org:80/robots.txt,archived',
      'http://ww7.extramovies.org:80/favicon.ico,archived',
      'http://ww7.extramovies.org:80/9xplay.php?url=abc,player',
      'http://ww7.extramovies.org:80/2016/he-said-she-said-1991-720p/,unresolved',
      'http://ww7.extramovies.org:80/2017/05/12/film.jpg,uploaded image',
    ].join('\n'),
  );
  const r = createLegacyRouter(dir);

  it('passes live asset paths through (never 301, never 410)', () => {
    for (const p of [
      '/robots.txt',
      '/favicon.ico',
      '/brand/noir-cinema/logo.svg',
      '/uploads/hero.png',
      '/sitemap.xml',
      '/assets/site.css',
    ]) {
      expect(r.check(p)).toBeNull();
    }
  });
  it('exempts asset paths case-insensitively', () => {
    expect(r.check('/ROBOTS.TXT')).toBeNull();
    expect(r.check('/Favicon.ICO')).toBeNull();
    expect(r.check('/BRAND/noir-cinema/logo.svg')).toBeNull();
  });
  it('answers the trailing-slash and percent-encoded variants of /robots.txt the same', () => {
    expect(r.check('/robots.txt/')).toBeNull();
    expect(r.check('/robots%2Etxt')).toBeNull();
    expect(r.check('/FAVICON%2EICO')).toBeNull();
  });
  it('keeps dated legacy image paths in legacy scope (410 / 301)', () => {
    // Not a root-level file and not under an asset namespace: the legacy
    // answer must stand, it must not fall through to a 404.
    expect(r.check('/2017/05/12/film.jpg')?.status).toBe(410);
    const mapped = r.check('/2018/03/04/poster.png');
    expect(mapped?.status).toBe(301);
    expect(mapped?.headers.get('Location')).toBe('/movies/456');
  });
  it('keeps .php in legacy scope (410)', () => {
    expect(r.check('/9xplay.php?url=abc')?.status).toBe(410);
  });
  it('keeps mapped legacy paths at 301 and unresolved legacy paths at 410', () => {
    const moved = r.check('/18-movies/old-movie-2019-full-movie-download/');
    expect(moved?.status).toBe(301);
    expect(moved?.headers.get('Location')).toBe('/movies/123');
    expect(r.check('/2016/he-said-she-said-1991-720p/')?.status).toBe(410);
  });
  it('leaves the normalisation of content paths untouched', () => {
    expect(normalizeLegacyPath('/18-Movies/The-Evil-Dead-1981-Hindi-Dubbed-480P-Full-Movie-Download/')).toBe('/the-evil-dead-1981-hindi-dubbed-480p-full-movie-download');
    expect(normalizeLegacyPath('/9xplay.php?url=abc')).toBe('/9xplay.php');
  });
});
