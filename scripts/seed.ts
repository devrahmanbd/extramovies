/**
 * seed.ts — idempotent demo seed (dev only, never prod data).
 * Usage: npm run db:seed  (tsx scripts/seed.ts)
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const DB = process.env.REVIEWS_DB_PATH ?? path.join(process.cwd(), 'data', 'reviews.json');

const SEED = [
  {
    id: 'seed-dune-2',
    title: 'Dune: Part Two',
    slug: 'dune-part-two',
    excerpt: 'Sandworms earn every minute.',
    markdown: '# Dune: Part Two\n\nThe sandworm ride earns every minute. 9/10.\n',
    status: 'published',
    rating: 9,
    region: 'US',
    tmdbId: 693134,
    imdbId: 'tt15239678',
    publishedAt: '2026-02-01T00:00:00.000Z',
    seo: { seoTitle: 'Dune: Part Two Review', metaDesc: 'A 9/10 review of the sequel.' },
    redirects: [],
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  },
  {
    id: 'seed-draft',
    title: 'Draft: Untitled Indie',
    slug: 'draft-untitled-indie',
    excerpt: 'Work in progress.',
    markdown: '# Notes\n\nDraft only — never published by seed.\n',
    status: 'draft',
    rating: 7,
    region: 'US',
    redirects: [],
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
  },
];

async function main() {
  await fs.mkdir(path.dirname(DB), { recursive: true });
  let cur: Record<string, unknown>[] = [];
  try {
    const raw = await fs.readFile(DB, 'utf8');
    const p = JSON.parse(raw);
    if (Array.isArray(p)) cur = p;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code !== 'ENOENT') throw e;
  }
  let added = 0;
  for (const s of SEED) {
    if (!cur.some((r) => (r as { id?: string }).id === s.id)) {
      cur.push(s);
      added++;
    }
  }
  await fs.writeFile(DB, JSON.stringify(cur, null, 2) + '\n', 'utf8');
  console.log(`[seed] +${added} (total ${cur.length}) -> ${DB}`);
}

if ((process.argv[1] ?? '').endsWith('seed.ts')) {
  main().catch((e) => {
    console.error('[seed] FAILED:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
