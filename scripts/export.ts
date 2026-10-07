/**
 * export.ts — export all reviews as portable Markdown with frontmatter.
 * Usage: npm run export -- [outDir]   (default: content/reviews)
 * Contract: title, slug, rating, movie_id, imdb_id, tmdb_id,
 *           published_at, seo_title, seo_description + body.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { reviewToMarkdown } from '../src/lib/portability.js';

const DB = process.env.REVIEWS_DB_PATH ?? path.join(process.cwd(), 'data', 'reviews.json');

interface StoredReview {
  id: string;
  title: string;
  slug: string;
  markdown?: string;
  body?: string;
  rating?: number;
  region?: string;
  movie?: { movieId?: string; imdbId?: string; title?: string };
  tmdbId?: number;
  imdbId?: string;
  publishedAt?: string;
  seo?: { seoTitle?: string; metaDesc?: string };
  [k: string]: unknown;
}

export async function exportReviews(outDir: string, dbPath = DB): Promise<string[]> {
  await fs.mkdir(outDir, { recursive: true });
  let arr: StoredReview[] = [];
  try {
    arr = JSON.parse(await fs.readFile(dbPath, 'utf8')) as StoredReview[];
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code !== 'ENOENT') throw e;
  }
  const written: string[] = [];
  for (const r of arr) {
    const md = reviewToMarkdown({
      title: r.title,
      slug: r.slug,
      rating: r.rating,
      movie_id: (r.movie?.movieId ?? r.id ?? null) as string | null,
      imdb_id: (r.imdbId ?? r.movie?.imdbId ?? null) as string | null,
      tmdb_id: (r.tmdbId ?? null) as number | null,
      published_at: (r.publishedAt ?? null) as string | null,
      seo_title: (r.seo?.seoTitle ?? null) as string | null,
      seo_description: (r.seo?.metaDesc ?? null) as string | null,
      body: (r.markdown ?? r.body ?? '') as string,
    });
    const file = path.join(outDir, `${r.slug}.md`);
    await fs.writeFile(file, md, 'utf8');
    written.push(file);
  }
  return written;
}

async function main() {
  const outDir = process.argv[2] ?? path.join(process.cwd(), 'content', 'reviews');
  const files = await exportReviews(outDir);
  console.log(`[export] ${files.length} review(s) -> ${outDir}`);
  for (const f of files) console.log(`  ${f}`);
}

if ((process.argv[1] ?? '').endsWith('export.ts')) {
  main().catch((e) => {
    console.error('[export] FAILED:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
