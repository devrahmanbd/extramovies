import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeLegacyPath, parseCsv, buildTables, createLegacyRouter } from '../src/lib/legacy/router';

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
