import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let savedSiteId: string | undefined;

beforeEach(() => {
  savedSiteId = process.env.SITE_ID;
});

afterEach(() => {
  if (savedSiteId === undefined) delete process.env.SITE_ID;
  else process.env.SITE_ID = savedSiteId;
});

async function makeMd(dir: string, slug: string): Promise<string> {
  const file = path.join(dir, `${slug}.md`);
  const md = [
    '---',
    `title: Site Test ${slug}`,
    `slug: ${slug}`,
    'rating: 8',
    'published_at: 2026-10-01T00:00:00.000Z',
    'seo_title: Site Test',
    'seo_description: Site test description.',
    '---',
    '',
    `# Site Test ${slug}`,
    '',
    'Body copy here.',
    '',
  ].join('\n');
  await fs.writeFile(file, md, 'utf8');
  return file;
}

describe('import: sites default matches save-draft rule', () => {
  it('stamps current SITE_ID on fresh imports', async () => {
    process.env.SITE_ID = 'extramovies';
    const { importMarkdown } = await import('../scripts/import');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-sites-'));
    const db = path.join(dir, 'reviews.json');
    const file = await makeMd(dir, 'site-stamp-film');
    const r = await importMarkdown(file, { dbPath: db });
    expect(r.imported).toBe(1);
    const rows = JSON.parse(await fs.readFile(db, 'utf8'));
    expect(rows[0].sites).toEqual(['extramovies']);
  });

  it('leaves rows untagged when SITE_ID is unset (backward compatible)', async () => {
    delete process.env.SITE_ID;
    const { importMarkdown } = await import('../scripts/import');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-sites-'));
    const db = path.join(dir, 'reviews.json');
    const file = await makeMd(dir, 'shared-film');
    await importMarkdown(file, { dbPath: db });
    const rows = JSON.parse(await fs.readFile(db, 'utf8'));
    expect(rows[0].sites).toBeUndefined();
  });

  it('preserves an explicit sites tag on re-import', async () => {    process.env.SITE_ID = 'extramovies';
    const { importMarkdown } = await import('../scripts/import');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-sites-'));
    const db = path.join(dir, 'reviews.json');
    await fs.writeFile(
      db,
      JSON.stringify([
        {
          id: 'keep-1',
          title: 'Keep',
          slug: 'keep-film',
          excerpt: 'x',
          markdown: 'x',
          status: 'draft',
          sites: ['cinemavilla'],
          redirects: [],
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
        },
      ]),
      'utf8',
    );
    const file = await makeMd(dir, 'keep-film');
    await importMarkdown(file, { dbPath: db });
    const rows = JSON.parse(await fs.readFile(db, 'utf8'));
    expect(rows[0].sites).toEqual(['cinemavilla']);
  });
});

describe('import: seed extras + safe re-runs', () => {
  let savedSiteId: string | undefined;
  beforeEach(() => {
    savedSiteId = process.env.SITE_ID;
  });
  afterEach(() => {
    if (savedSiteId === undefined) delete process.env.SITE_ID;
    else process.env.SITE_ID = savedSiteId;
  });

  async function makeSeed(
    dir: string,
    slug: string,
    opts: { publishedAt?: string; rating?: number } = {},
  ): Promise<string> {
    const file = path.join(dir, `${slug}.md`);
    const md = [
      '---',
      `title: Seed ${slug}`,
      `slug: ${slug}`,
      `rating: ${opts.rating ?? 7}`,
      ...(opts.publishedAt ? [`published_at: "${opts.publishedAt}"`] : []),
      'excerpt: Seed excerpt here.',
      'movie_title: Seed Film',
      'movie_year: "2026"',
      'movie_genres: "[\\"Action\\", \\"Comedy\\"]"',
      'movie_director: Some Director',
      'movie_cast: "[\\"A One\\", \\"B Two\\"]"',
      'movie_poster: "https://image.tmdb.org/t/p/w500/seed.jpg"',
      'movie_imdb: "tt0000001"',
      'region: "US"',
      'sites: "[\\"extramovies\\"]"',
      '---',
      '',
      `# Seed ${slug}`,
      '',
      'Seed body copy.',
      '',
    ].join('\n');
    await fs.writeFile(file, md, 'utf8');
    return file;
  }

  it('carries movie metadata + explicit sites, arrives as draft', async () => {
    process.env.SITE_ID = 'cinemavilla';
    const { importMarkdown } = await import('../scripts/import');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-seed-'));
    const db = path.join(dir, 'reviews.json');
    const file = await makeSeed(dir, 'seed-film');
    const r = await importMarkdown(file, { dbPath: db });
    expect(r.imported).toBe(1);
    const rows = JSON.parse(await fs.readFile(db, 'utf8'));
    expect(rows[0].status).toBe('draft');
    // Explicit file tag wins over the ambient SITE_ID.
    expect(rows[0].sites).toEqual(['extramovies']);
    expect(rows[0].movie.title).toBe('Seed Film');
    expect(rows[0].movie.genres).toEqual(['Action', 'Comedy']);
    expect(rows[0].movie.cast).toEqual(['A One', 'B Two']);
    expect(rows[0].movie.poster).toBe('https://image.tmdb.org/t/p/w500/seed.jpg');
    expect(rows[0].movie.director).toBe('Some Director');
  });

  it('--skip-existing leaves present rows untouched (safe re-runs)', async () => {
    process.env.SITE_ID = 'extramovies';
    const { importMarkdown } = await import('../scripts/import');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-seed-'));
    const db = path.join(dir, 'reviews.json');
    const file = await makeSeed(dir, 'seed-film');
    await importMarkdown(file, { dbPath: db });
    const before = await fs.readFile(db, 'utf8');
    const r = await importMarkdown(file, { dbPath: db, skipExisting: true });
    expect(r.imported).toBe(0);
    expect(r.skipped).toBe(1);
    expect(await fs.readFile(db, 'utf8')).toBe(before);
  });

  it('--refresh publishes seed drafts from file state (id + sites preserved)', async () => {
    process.env.SITE_ID = 'extramovies';
    const { importMarkdown } = await import('../scripts/import');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-seed-'));
    const db = path.join(dir, 'reviews.json');
    const file = path.join(dir, 'seed-film.md');
    // First run: seed arrives as a draft (no published_at in file).
    await importMarkdown(await makeSeed(dir, 'seed-film'), { dbPath: db });
    // Owner releases it: file gains published_at + a bumped rating.
    await makeSeed(dir, 'seed-film', { publishedAt: '2026-10-17T09:00:00.000Z', rating: 8 });
    const r = await importMarkdown(file, { dbPath: db, skipExisting: true, refresh: true });
    expect(r.imported).toBe(1);
    const rows = JSON.parse(await fs.readFile(db, 'utf8'));
    expect(rows[0].status).toBe('published');
    expect(rows[0].publishedAt).toBe('2026-10-17T09:00:00.000Z');
    expect(rows[0].rating).toBe(8);
    expect(rows[0].id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
    expect(rows[0].sites).toEqual(['extramovies']);
  });

  it('--refresh never touches rows the owner published from /admin', async () => {
    process.env.SITE_ID = 'extramovies';
    const { importMarkdown } = await import('../scripts/import');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-seed-'));
    const db = path.join(dir, 'reviews.json');
    const file = await makeSeed(dir, 'seed-film', { publishedAt: '2026-10-17T09:00:00.000Z' });
    await importMarkdown(file, { dbPath: db });
    // Simulate owner edits in /admin: published + a different rating.
    let rows = JSON.parse(await fs.readFile(db, 'utf8'));
    rows[0].status = 'published';
    rows[0].rating = 9.5;
    await fs.writeFile(db, JSON.stringify(rows), 'utf8');
    const r = await importMarkdown(file, { dbPath: db, skipExisting: true, refresh: true });
    expect(r.imported).toBe(0);
    expect(r.skipped).toBe(1);
    rows = JSON.parse(await fs.readFile(db, 'utf8'));
    expect(rows[0].rating).toBe(9.5);
    expect(rows[0].status).toBe('published');
  });

  it('shipped extramovies seeds validate clean (dry run)', async () => {
    const { importMarkdown } = await import('../scripts/import');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-seed-'));
    const db = path.join(dir, 'reviews.json');
    const seedDir = path.join(process.cwd(), 'seeds', 'extramovies');
    const r = await importMarkdown(seedDir, { dbPath: db, dry: true });
    expect(r.errors).toEqual([]);
    expect(r.imported).toBeGreaterThanOrEqual(2);
  });
});
