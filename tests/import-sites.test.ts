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

  it('preserves an explicit sites tag on re-import', async () => {
    process.env.SITE_ID = 'extramovies';
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
