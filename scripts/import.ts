/**
 * import.ts — import portable Markdown (frontmatter contract) into the store.
 * Usage: npm run import -- <inDir|file.md> [--dry]
 * Safe: validates each file, skips invalid with a warning, never deletes.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { markdownToReview, validatePortableReview } from '../src/lib/portability.js';

const DB = process.env.REVIEWS_DB_PATH ?? path.join(process.cwd(), 'data', 'reviews.json');

async function readStore(): Promise<Record<string, unknown>[]> {
  try {
    const raw = await fs.readFile(DB, 'utf8');
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return [];
    throw e;
  }
}

export async function importMarkdown(
  target: string,
  opts: { dry?: boolean } = {},
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const stat = await fs.stat(target);
  const files: string[] = [];
  if (stat.isDirectory()) {
    for (const f of await fs.readdir(target)) {
      if (f.endsWith('.md')) files.push(path.join(target, f));
    }
  } else {
    files.push(target);
  }
  const store = await readStore();
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const f of files) {
    const raw = await fs.readFile(f, 'utf8');
    const { review, warnings } = markdownToReview(raw, path.basename(f, '.md'));
    const problems = validatePortableReview(review);
    if (problems.length > 0) {
      skipped++;
      errors.push(`${f}: ${problems.join('; ')}`);
      continue;
    }
    for (const w of warnings) console.warn(`[import] ${f}: ${w}`);
    if (!opts.dry) {
      const now = new Date().toISOString();
      const existing = store.findIndex(
        (r) => (r as { slug?: string }).slug === review.slug,
      );
      const record = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        title: review.title,
        slug: review.slug,
        excerpt: (review.excerpt as string) ?? '',
        markdown: review.body,
        status: review.published_at ? 'published' : 'draft',
        rating: review.rating,
        imdbId: review.imdb_id,
        tmdbId: review.tmdb_id,
        publishedAt: review.published_at,
        seo: { seoTitle: review.seo_title, metaDesc: review.seo_description },
        redirects: [],
        createdAt: now,
        updatedAt: now,
      };
      if (existing >= 0) store[existing] = { ...(store[existing] as object), ...record, id: (store[existing] as { id: string }).id };
      else store.push(record);
    }
    imported++;
  }
  if (!opts.dry) {
    await fs.mkdir(path.dirname(DB), { recursive: true });
    await fs.writeFile(DB, JSON.stringify(store, null, 2) + '\n', 'utf8');
  }
  return { imported, skipped, errors };
}

async function main() {
  const target = process.argv[2];
  if (!target) throw new Error('usage: import.ts <inDir|file.md> [--dry]');
  const dry = process.argv.includes('--dry');
  const r = await importMarkdown(target, { dry });
  console.log(`[import] imported=${r.imported} skipped=${r.skipped}${dry ? ' (dry run)' : ''}`);
  for (const e of r.errors) console.error(`[import] SKIP ${e}`);
  if (r.skipped > 0) process.exitCode = 2;
}

if ((process.argv[1] ?? '').endsWith('import.ts')) {
  main().catch((e) => {
    console.error('[import] FAILED:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
