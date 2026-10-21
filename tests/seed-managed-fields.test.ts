import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Repo-managed seed fields (src/lib/seed-managed-fields.ts + scripts/import.ts).
 *
 * House rule (AGENTS.md §2): a row the owner published from /admin is never
 * overwritten by a deploy. This is the ONE opt-in exception: a seed may
 * declare `managed_fields` in its frontmatter, and then the import writes ONLY
 * those fields on its own PUBLISHED row. Everything else stays put.
 *
 * These tests drive the real importMarkdown() against a temp store.
 */

let savedSiteId: string | undefined;

beforeEach(() => {
  savedSiteId = process.env.SITE_ID;
  process.env.SITE_ID = 'extramovies';
});

afterEach(() => {
  if (savedSiteId === undefined) delete process.env.SITE_ID;
  else process.env.SITE_ID = savedSiteId;
});

interface SeedOpts {
  /** Raw `managed_fields` frontmatter value (field names). */
  managed?: string[];
  publishedAt?: string;
  rating?: number;
  seoTitle?: string;
  seoDescription?: string;
  excerpt?: string;
  body?: string;
  /** Leave the seo_title key out of the frontmatter entirely. */
  omitSeoTitle?: boolean;
}

/** A seed .md file. `managed_fields` uses the repo's JSON-string list style. */
async function makeSeed(dir: string, slug: string, opts: SeedOpts = {}): Promise<string> {
  const file = path.join(dir, `${slug}.md`);
  const managed = opts.managed
    ? `managed_fields: "${JSON.stringify(opts.managed).replace(/"/g, '\\"')}"`
    : null;
  const md = [
    '---',
    `title: Seed ${slug}`,
    `slug: ${slug}`,
    `rating: ${opts.rating ?? 7}`,
    ...(opts.publishedAt ? [`published_at: "${opts.publishedAt}"`] : []),
    ...(opts.omitSeoTitle ? [] : [`seo_title: "${opts.seoTitle ?? 'Seed SEO title'}"`]),
    `seo_description: "${opts.seoDescription ?? 'Seed meta description.'}"`,
    `excerpt: "${opts.excerpt ?? 'Seed excerpt.'}"`,
    ...(managed ? [managed] : []),
    '---',
    '',
    opts.body ?? 'Seed body copy.',
    '',
  ].join('\n');
  await fs.writeFile(file, md, 'utf8');
  return file;
}

/** The row as the owner left it: published, hand-edited, site-tagged. */
function ownerRow(slug: string, over: Record<string, unknown> = {}) {
  return {
    id: 'owner-row-1',
    title: 'Owner title',
    slug,
    excerpt: 'Owner excerpt.',
    markdown: 'Owner body copy.',
    status: 'published',
    rating: 9.5,
    publishedAt: '2026-10-01T00:00:00.000Z',
    seo: { seoTitle: 'Owner SEO title', metaDesc: 'Owner meta description.' },
    redirects: [],
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    sites: ['extramovies'],
    ...over,
  };
}

async function writeStore(db: string, rows: unknown[]): Promise<void> {
  await fs.writeFile(db, JSON.stringify(rows, null, 2) + '\n', 'utf8');
}

async function readStore(db: string): Promise<Record<string, unknown>[]> {
  return JSON.parse(await fs.readFile(db, 'utf8'));
}

async function setup() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'seed-managed-'));
  const db = path.join(dir, 'reviews.json');
  return { dir, db };
}

describe('seed import: repo-managed fields on a published row', () => {
  it('leaves a published row untouched when the seed declares nothing', async () => {
    const { dir, db } = await setup();
    await writeStore(db, [ownerRow('plain-film')]);
    const before = await fs.readFile(db, 'utf8');
    const file = await makeSeed(dir, 'plain-film', {
      publishedAt: '2026-10-17T09:00:00.000Z',
      rating: 8,
      seoTitle: 'New seed SEO title',
      seoDescription: 'New seed meta description.',
      excerpt: 'New seed excerpt.',
      body: 'New seed body.',
    });

    const { importMarkdown } = await import('../scripts/import');
    const r = await importMarkdown(file, { dbPath: db, skipExisting: true, refresh: true });

    expect(r.imported).toBe(0);
    expect(r.skipped).toBe(1);
    expect(r.refreshed).toEqual([]);
    expect(await fs.readFile(db, 'utf8')).toBe(before);
  });

  it('updates exactly the listed fields and leaves the rest of the row alone', async () => {
    const { dir, db } = await setup();
    await writeStore(db, [ownerRow('managed-film')]);
    const file = await makeSeed(dir, 'managed-film', {
      managed: ['seo_title', 'seo_description'],
      seoTitle: 'New seed SEO title',
      seoDescription: 'New seed meta description.',
      excerpt: 'New seed excerpt.',
      body: 'New seed body.',
    });

    const { importMarkdown } = await import('../scripts/import');
    const r = await importMarkdown(file, { dbPath: db, skipExisting: true, refresh: true });

    expect(r.imported).toBe(1);
    expect(r.skipped).toBe(0);
    expect(r.refreshed).toEqual([
      { slug: 'managed-film', fields: ['seo_title', 'seo_description'] },
    ]);

    const [row] = await readStore(db);
    // Managed fields: written.
    expect(row.seo).toMatchObject({
      seoTitle: 'New seed SEO title',
      metaDesc: 'New seed meta description.',
    });
    // Everything else: untouched.
    expect(row.excerpt).toBe('Owner excerpt.');
    expect(row.markdown).toBe('Owner body copy.');
    expect(row.rating).toBe(9.5);
    expect(row.publishedAt).toBe('2026-10-01T00:00:00.000Z');
    expect(row.status).toBe('published');
    expect(row.title).toBe('Owner title');
    expect(row.id).toBe('owner-row-1');
    expect(row.sites).toEqual(['extramovies']);
    // A real edit bumps updatedAt (the sitemap lastmod follows it).
    expect(row.updatedAt).not.toBe('2026-10-01T00:00:00.000Z');
    expect(row.createdAt).toBe('2026-10-01T00:00:00.000Z');
  });

  it('refreshes the body markdown only when body is listed', async () => {
    const { dir, db } = await setup();
    await writeStore(db, [ownerRow('body-film')]);
    const file = await makeSeed(dir, 'body-film', {
      managed: ['body'],
      seoTitle: 'New seed SEO title',
      excerpt: 'New seed excerpt.',
      body: 'New seed body with an internal anchor.',
    });

    const { importMarkdown } = await import('../scripts/import');
    const r = await importMarkdown(file, { dbPath: db, skipExisting: true, refresh: true });

    expect(r.refreshed).toEqual([{ slug: 'body-film', fields: ['body'] }]);
    const [row] = await readStore(db);
    expect(row.markdown).toBe('New seed body with an internal anchor.\n');
    expect(row.seo).toMatchObject({ seoTitle: 'Owner SEO title' });
    expect(row.excerpt).toBe('Owner excerpt.');
    expect(row.rating).toBe(9.5);
  });

  it('reports an unknown field name loudly and never writes it', async () => {
    const { dir, db } = await setup();
    await writeStore(db, [ownerRow('unknown-field-film')]);
    const file = await makeSeed(dir, 'unknown-field-film', {
      managed: ['rating', 'seo_title'],
      seoTitle: 'New seed SEO title',
    });

    const { importMarkdown } = await import('../scripts/import');
    const r = await importMarkdown(file, { dbPath: db, skipExisting: true, refresh: true });

    // Reported (not silently dropped)...
    expect(r.warnings.join('\n')).toMatch(/unknown field\(s\) rating ignored/);
    expect(r.errors).toEqual([]);
    // ...and the forbidden field was not written.
    const [row] = await readStore(db);
    expect(row.rating).toBe(9.5);
    expect(row.status).toBe('published');
    // The allowed field still refreshed.
    expect((row.seo as { seoTitle?: string }).seoTitle).toBe('New seed SEO title');
  });

  it('skips a listed field the seed carries no value for (warns, keeps the row value)', async () => {
    const { dir, db } = await setup();
    await writeStore(db, [ownerRow('empty-field-film')]);
    const file = await makeSeed(dir, 'empty-field-film', {
      managed: ['seo_title'],
      omitSeoTitle: true,
    });

    const { importMarkdown } = await import('../scripts/import');
    const r = await importMarkdown(file, { dbPath: db, skipExisting: true, refresh: true });

    expect(r.warnings.join('\n')).toMatch(/carries no value for seo_title/);
    expect(r.refreshed).toEqual([]);
    const [row] = await readStore(db);
    expect((row.seo as { seoTitle?: string }).seoTitle).toBe('Owner SEO title');
  });

  it('never touches a published row that belongs to another site', async () => {
    const { dir, db } = await setup();
    await writeStore(db, [ownerRow('other-site-film', { sites: ['cinemavilla'] })]);
    const before = await fs.readFile(db, 'utf8');
    const file = await makeSeed(dir, 'other-site-film', {
      managed: ['seo_title'],
      seoTitle: 'New seed SEO title',
    });

    const { importMarkdown } = await import('../scripts/import');
    const r = await importMarkdown(file, { dbPath: db, skipExisting: true, refresh: true });

    expect(r.imported).toBe(0);
    expect(r.skipped).toBe(1);
    expect(r.warnings.join('\n')).toMatch(/tagged for another site/);
    expect(await fs.readFile(db, 'utf8')).toBe(before);
  });

  it('still imports a draft row normally (the full row lands)', async () => {
    const { dir, db } = await setup();
    await writeStore(db, [
      ownerRow('draft-film', { status: 'draft', rating: 3, excerpt: 'Draft excerpt.' }),
    ]);
    const file = await makeSeed(dir, 'draft-film', {
      publishedAt: '2026-10-17T09:00:00.000Z',
      rating: 8,
      excerpt: 'Seed excerpt.',
      body: 'Seed body copy.',
    });

    const { importMarkdown } = await import('../scripts/import');
    const r = await importMarkdown(file, { dbPath: db, skipExisting: true, refresh: true });

    expect(r.imported).toBe(1);
    expect(r.skipped).toBe(0);
    const [row] = await readStore(db);
    expect(row.status).toBe('published');
    expect(row.rating).toBe(8);
    expect(row.excerpt).toBe('Seed excerpt.');
    expect(row.markdown).toBe('Seed body copy.\n');
    expect(row.id).toBe('owner-row-1');
  });

  it('is idempotent: a second run with the same seed changes nothing', async () => {
    const { dir, db } = await setup();
    await writeStore(db, [ownerRow('idem-film')]);
    const file = await makeSeed(dir, 'idem-film', {
      managed: ['seo_title'],
      seoTitle: 'New seed SEO title',
    });

    const { importMarkdown } = await import('../scripts/import');
    await importMarkdown(file, { dbPath: db, skipExisting: true, refresh: true });
    const afterFirst = await fs.readFile(db, 'utf8');
    const updatedAfterFirst = (await readStore(db))[0].updatedAt;

    const r2 = await importMarkdown(file, { dbPath: db, skipExisting: true, refresh: true });
    expect(r2.refreshed).toEqual([]);
    expect(await fs.readFile(db, 'utf8')).toBe(afterFirst);
    // No churn: a no-op refresh does not bump updatedAt either.
    expect((await readStore(db))[0].updatedAt).toBe(updatedAfterFirst);
  });

  it('writes a per-run report of what was refreshed (deploy log source)', async () => {
    const { dir, db } = await setup();
    await writeStore(db, [ownerRow('report-film')]);
    const file = await makeSeed(dir, 'report-film', {
      managed: ['seo_title', 'seo_description'],
      seoTitle: 'New seed SEO title',
      seoDescription: 'New seed meta description.',
    });

    const { importMarkdown } = await import('../scripts/import');
    await importMarkdown(file, { dbPath: db, skipExisting: true, refresh: true });

    const report = JSON.parse(
      await fs.readFile(path.join(dir, 'seed-refresh.json'), 'utf8'),
    );
    expect(report.site).toBe('extramovies');
    expect(report.refreshed).toEqual({
      'report-film': ['seo_title', 'seo_description'],
    });
  });

  it('a dry run reports the pending refresh and writes nothing', async () => {
    const { dir, db } = await setup();
    await writeStore(db, [ownerRow('dry-film')]);
    const before = await fs.readFile(db, 'utf8');
    const file = await makeSeed(dir, 'dry-film', {
      managed: ['seo_title'],
      seoTitle: 'New seed SEO title',
    });

    const { importMarkdown } = await import('../scripts/import');
    const r = await importMarkdown(file, { dbPath: db, dry: true, skipExisting: true, refresh: true });

    expect(r.refreshed).toEqual([]);
    expect(await fs.readFile(db, 'utf8')).toBe(before);
  });
});
