/**
 * import.ts — import portable Markdown (frontmatter contract) into the store.
 * Usage: npm run import -- <inDir|file.md> [--dry]
 * Safe: validates each file, skips invalid with a warning, never deletes.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { markdownToReview, validatePortableReview } from '../src/lib/portability.js';
import { defaultSites } from '../src/lib/seo/store-merge.js';
import { checkPublishRating } from '../src/lib/publish-guard.js';

const DB = process.env.REVIEWS_DB_PATH ?? path.join(process.cwd(), 'data', 'reviews.json');

async function readStore(dbFile: string = DB): Promise<Record<string, unknown>[]> {
  try {
    const raw = await fs.readFile(dbFile, 'utf8');
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return [];
    throw e;
  }
}

/** String list from frontmatter: real arrays pass through, JSON strings parse, CSV splits. */
function strArray(v: unknown): string[] | undefined {
  if (Array.isArray(v)) {
    const out = v.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean);
    return out.length > 0 ? out : undefined;
  }
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed: unknown = JSON.parse(v);
      if (Array.isArray(parsed)) return strArray(parsed);
    } catch {
      /* not JSON — fall through to CSV */
    }
    const out = v.split(',').map((s) => s.trim()).filter(Boolean);
    return out.length > 0 ? out : undefined;
  }
  return undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/**
 * Movie metadata carried in seed frontmatter (movie_title, movie_year,
 * movie_genres, movie_runtime, movie_director, movie_cast, movie_overview,
 * movie_poster, movie_imdb). Absent when the file carries none, so plain
 * text imports behave exactly as before.
 */
function buildMovieMeta(extras: Record<string, unknown>): Record<string, unknown> | undefined {
  const movie: Record<string, unknown> = {};
  const title = str(extras.movie_title);
  if (title) movie.title = title;
  const year = str(extras.movie_year) ?? (typeof extras.movie_year === 'number' ? String(extras.movie_year) : undefined);
  if (year) movie.year = year;
  const genres = strArray(extras.movie_genres);
  if (genres) movie.genres = genres;
  const runtime = str(extras.movie_runtime);
  if (runtime) movie.runtime = runtime;
  const director = str(extras.movie_director);
  if (director) movie.director = director;
  const cast = strArray(extras.movie_cast);
  if (cast) movie.cast = cast;
  const overview = str(extras.movie_overview);
  if (overview) movie.overview = overview;
  const poster = str(extras.movie_poster);
  if (poster) movie.poster = poster;
  const movieId = str(extras.movie_id) ?? (typeof extras.movie_id === 'number' ? String(extras.movie_id) : undefined);
  if (movieId) movie.movieId = movieId;
  const imdbId = str(extras.movie_imdb) ?? str(extras.imdb_id);
  if (imdbId) movie.imdbId = imdbId;
  return Object.keys(movie).length > 0 ? movie : undefined;
}

export async function importMarkdown(
  target: string,
  opts: { dry?: boolean; dbPath?: string; skipExisting?: boolean; refresh?: boolean } = {},
): Promise<{ imported: number; skipped: number; errors: string[]; refused: string[] }> {
  const stat = await fs.stat(target);
  const files: string[] = [];
  if (stat.isDirectory()) {
    for (const f of await fs.readdir(target)) {
      if (f.endsWith('.md')) files.push(path.join(target, f));
    }
  } else {
    files.push(target);
  }
  const dbFile = opts.dbPath ?? DB;
  const store = await readStore(dbFile);
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  const refused: string[] = [];
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
    // A seed may publish itself (published_at in frontmatter), but an
    // UNRATED review must never go live: it would ship a public
    // "rated 0/10" claim (meta description + JSON-LD reviewRating).
    // The rating is the owner's call, so the row still lands — as a DRAFT.
    const wantsPublish = Boolean(review.published_at);
    const gate = wantsPublish ? checkPublishRating(review.rating) : { ok: true as const };
    const publish = wantsPublish && gate.ok;
    const refusal = wantsPublish && !gate.ok ? gate.error : null;
    if (opts.dry && refusal) {
      refused.push(`${f}: ${refusal}`);
      console.error(`[import] REFUSED PUBLISH ${f}: ${refusal} (dry run — would import as draft)`);
    }
    if (!opts.dry) {
      const now = new Date().toISOString();
      const existing = store.findIndex(
        (r) => (r as { slug?: string }).slug === review.slug,
      );      // Safe re-runs for automation: leave present rows untouched.
      // --refresh is a targeted exception: it rescues DRAFT rows only
      // (seed files may have gained published_at / content edits), while
      // rows the owner published from /admin are never overwritten.
      if (existing >= 0) {
        const prev = store[existing] as { status?: string };
        if (opts.skipExisting && !(opts.refresh && prev.status === 'draft')) {
          skipped++;
          continue;
        }
      }
      const extras = review as unknown as Record<string, unknown>;
      const movie = buildMovieMeta(extras);
      if (refusal) {
        refused.push(`${f}: ${refusal}`);
        console.error(`[import] REFUSED PUBLISH ${f}: ${refusal} (row imported as draft)`);
      }
      // Explicit `sites` in the file wins (cross-posted seeds); otherwise
      // the current SITE_ID is stamped so imports stay site-exclusive.
      const fileSites = strArray(extras.sites);
      const sites =
        fileSites && fileSites.length > 0
          ? fileSites
          : defaultSites();
      const record = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        title: review.title,
        slug: review.slug,
        excerpt: (review.excerpt as string) ?? '',
        markdown: review.body,
        status: publish ? 'published' : 'draft',
        rating: review.rating,
        ...(movie ? { movie } : {}),
        ...(typeof extras.region === 'string' && extras.region.trim() ? { region: extras.region.trim() } : {}),
        imdbId: review.imdb_id,
        tmdbId: review.tmdb_id,
        ...(publish || !review.published_at
          ? { publishedAt: review.published_at }
          : {}),
        seo: { seoTitle: review.seo_title, metaDesc: review.seo_description },
        redirects: [],
        createdAt: now,
        updatedAt: now,
        ...(sites !== undefined ? { sites } : {}),
      };
      if (existing >= 0) {
        const prev = store[existing] as { id: string; sites?: string[] };
        // Preserve an existing explicit sites tag on update; only stamp
        // the default when the row has none.
        const keepSites =
          Array.isArray(prev.sites) ? { sites: prev.sites } : (sites !== undefined ? { sites } : {});
        store[existing] = { ...(store[existing] as object), ...record, id: prev.id, ...keepSites };
      } else store.push(record);
    }
    imported++;
  }
  if (!opts.dry) {
    await fs.mkdir(path.dirname(dbFile), { recursive: true });
    await fs.writeFile(dbFile, JSON.stringify(store, null, 2) + '\n', 'utf8');
  }
  return { imported, skipped, errors, refused };
}

async function main() {
  const target = process.argv[2];
  if (!target) throw new Error('usage: import.ts <inDir|file.md> [--dry] [--skip-existing] [--refresh]');
  const dry = process.argv.includes('--dry');
  const skipExisting = process.argv.includes('--skip-existing');
  const refresh = process.argv.includes('--refresh');
  const r = await importMarkdown(target, { dry, skipExisting, refresh });
  console.log(`[import] imported=${r.imported} skipped=${r.skipped}${dry ? ' (dry run)' : ''}${skipExisting ? ' (skip-existing)' : ''}${refresh ? ' (refresh)' : ''}`);
  for (const e of r.errors) console.error(`[import] SKIP ${e}`);
  // A refused publish is a content mistake, not a crash: the row landed as
  // a draft (the owner still has to score it), but the release must not
  // claim it published. Exit non-zero so CI stops before shipping it.
  if (r.refused.length > 0) {
    console.error(`[import] ${r.refused.length} seed(s) asked to publish without a rating — left as drafts.`);
    process.exitCode = 2;
  }
  if (r.errors.length > 0) process.exitCode = 2;
}

if ((process.argv[1] ?? '').endsWith('import.ts')) {
  main().catch((e) => {
    console.error('[import] FAILED:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
