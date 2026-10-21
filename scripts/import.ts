/**
 * import.ts — import portable Markdown (frontmatter contract) into the store.
 * Usage: npm run import -- <inDir|file.md> [--dry]
 * Safe: validates each file, skips invalid with a warning, never deletes.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  markdownToReview,
  validatePortableReview,
  type PortableReview,
} from '../src/lib/portability.js';
import { defaultSites, rowSites, siteId, visibleHere } from '../src/lib/seo/store-merge.js';
import { checkPublishRating } from '../src/lib/publish-guard.js';
import {
  MANAGED_FIELDS_KEY,
  MANAGED_FIELD_NAMES,
  applyManagedRefresh,
  planManagedRefresh,
  resolveManagedFields,
  type ManagedField,
  type ManagedFields,
  type ManagedRefreshPlan,
} from '../src/lib/seed-managed-fields.js';
import {
  indexNowOrigin,
  notifyIndexNowSoon,
  reviewUrl,
} from '../src/lib/seo/indexnow.js';

const DB = process.env.REVIEWS_DB_PATH ?? path.join(process.cwd(), 'data', 'reviews.json');

/** Per-run report of the repo-managed fields the import refreshed. */
const REFRESH_REPORT_FILE = 'seed-refresh.json';

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

/**
 * Loud warning for a seed that asked to publish itself without a rating.
 * Names the slug (what the owner sees in /admin) and the action needed.
 */
function unratedPublishWarning(slug: string, suffix: string): string {
  return (
    `[import] WARN slug "${slug}" asked to publish without a rating: NOT published. ` +
    `Set a rating for "${slug}", then publish it from /admin.${suffix}`
  );
}

export interface SeedRefresh {
  /** Slug whose published row got repo-managed fields refreshed. */
  slug: string;
  /** The fields that actually changed (and were written). */
  fields: ManagedField[];
}

export async function importMarkdown(
  target: string,
  opts: { dry?: boolean; dbPath?: string; skipExisting?: boolean; refresh?: boolean } = {},
): Promise<{
  imported: number;
  skipped: number;
  errors: string[];
  refused: string[];
  /** Loud-but-harmless notices (unknown managed field, empty value, ...). */
  warnings: string[];
  /** Repo-managed fields refreshed on published rows this run. */
  refreshed: SeedRefresh[];
}> {
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
  if (!opts.dry) {
    // Clear any report from an earlier run BEFORE touching the store, so a
    // stale report can never be read as this run's result.
    await fs.mkdir(path.dirname(dbFile), { recursive: true });
    await writeRefreshReport(dbFile, []);
  }
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  const refused: string[] = [];
  const warnings: string[] = [];
  const refreshed: SeedRefresh[] = [];
  /** Slugs this run published (announced to IndexNow once, at the end). */
  const publishedSlugs: string[] = [];
  for (const f of files) {
    const raw = await fs.readFile(f, 'utf8');
    const { review, warnings: parseWarnings } = markdownToReview(raw, path.basename(f, '.md'));
    const problems = validatePortableReview(review);
    if (problems.length > 0) {
      skipped++;
      errors.push(`${f}: ${problems.join('; ')}`);
      continue;
    }
    for (const w of parseWarnings) console.warn(`[import] ${f}: ${w}`);
    // A seed may publish itself (published_at in frontmatter), but an
    // UNRATED review must never go live: it would ship a public
    // "rated 0/10" claim (meta description + JSON-LD reviewRating).
    // The rating is the owner's call, so the row still lands — as a DRAFT,
    // with a loud warning. One unrated seed never fails the whole run.
    const wantsPublish = Boolean(review.published_at);
    const gate = wantsPublish ? checkPublishRating(review.rating) : { ok: true as const };
    const publish = wantsPublish && gate.ok;
    const refusal = wantsPublish && !gate.ok ? gate.error : null;
    if (opts.dry && refusal) {
      refused.push(`${review.slug}: ${refusal}`);
      console.error(unratedPublishWarning(review.slug, ' (dry run: nothing written)'));
    }
    const extras = review as unknown as Record<string, unknown>;
    // A seed may declare which fields the REPO owns (SEO/meta surface only).
    // This is the one exception to "a published row is never overwritten".
    const managed = resolveManagedFields(strArray(extras[MANAGED_FIELDS_KEY]));
    if (managed.unknown.length > 0) {
      const notice =
        `[import] WARN slug "${review.slug}" ${MANAGED_FIELDS_KEY}: unknown field(s) ` +
        `${managed.unknown.join(', ')} ignored (never written). ` +
        `Allowed: ${MANAGED_FIELD_NAMES.join(', ')}.`;
      console.warn(notice);
      warnings.push(notice);
    }
    const existing = store.findIndex(
      (r) => (r as { slug?: string }).slug === review.slug,
    );
    const existingRow =
      existing >= 0 ? (store[existing] as Record<string, unknown>) : undefined;
    // Dry run: report what a live run WOULD refresh (nothing is written).
    if (opts.dry && existingRow) {
      const plan = planPublishedRowRefresh(existingRow, review, managed);
      if (plan && plan.changed.length > 0) {
        console.log(
          `[import] DRY RUN ${review.slug} would refresh: ${plan.changed.join(', ')} (nothing written)`,
        );
      }
    }
    if (!opts.dry) {
      const now = new Date().toISOString();
      // Safe re-runs for automation: leave present rows untouched.
      // --refresh is a targeted exception: it rescues DRAFT rows only
      // (seed files may have gained published_at / content edits), while
      // rows the owner published from /admin are never overwritten.
      if (existing >= 0) {
        const prev = store[existing] as { status?: string };
        if (opts.skipExisting && !(opts.refresh && prev.status === 'draft')) {
          // The row stands — UNLESS the seed declared repo-managed fields.
          // Then the import writes ONLY those fields and nothing else.
          const done = refreshManagedFields({
            row: store[existing] as Record<string, unknown>,
            review,
            managed,
            now,
            warnings,
            refreshed,
          });
          if (done) {
            imported++;
            continue;
          }
          skipped++;
          continue;
        }
      }
      const movie = buildMovieMeta(extras);
      if (refusal) {
        refused.push(`${review.slug}: ${refusal}`);
        console.error(unratedPublishWarning(review.slug, ' (kept as a draft)'));
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
      // This seed landed as a LIVE review -> its URL is announced to
      // IndexNow below (batched, one request per run).
      if (publish) publishedSlugs.push(review.slug);
    }
    imported++;
  }
  if (!opts.dry) {
    await fs.mkdir(path.dirname(dbFile), { recursive: true });
    await fs.writeFile(dbFile, JSON.stringify(store, null, 2) + '\n', 'utf8');
    await writeRefreshReport(dbFile, refreshed);
    if (publishedSlugs.length > 0) await announcePublished(publishedSlugs);
  }
  return { imported, skipped, errors, refused, warnings, refreshed };
}

/**
 * Plan the repo-managed refresh of an EXISTING row.
 *
 * Eligible rows only: a PUBLISHED row on THIS site. A draft row is already
 * refreshed wholesale by --refresh; a row tagged for another brand is never
 * ours to touch. Returns null when the row is not eligible.
 */
function planPublishedRowRefresh(
  row: Record<string, unknown>,
  review: PortableReview,
  managed: ManagedFields,
): ManagedRefreshPlan | null {
  if (!managed.fields.length) return null;
  if ((row.status as string | undefined) !== 'published') return null;
  if (!visibleHere(rowSites(row as { sites?: unknown }))) return null;
  return planManagedRefresh(row, review, managed.fields);
}

/**
 * Refresh ONLY the repo-managed fields of a published row.
 *
 * Everything else on the row is left exactly as the owner left it: rating,
 * published_at, status, title, id, sites, movie, redirects. Returns true
 * when the seed was handled here (the import counts it as imported).
 */
function refreshManagedFields(args: {
  row: Record<string, unknown>;
  review: PortableReview;
  managed: ManagedFields;
  now: string;
  warnings: string[];
  refreshed: SeedRefresh[];
}): boolean {
  const { row, review, managed, now, warnings, refreshed } = args;
  if (!managed.declared || !managed.fields.length) return false;
  if ((row.status as string | undefined) !== 'published') return false;
  if (!visibleHere(rowSites(row as { sites?: unknown }))) {
    const notice =
      `[import] WARN slug "${review.slug}" ${MANAGED_FIELDS_KEY} ignored: the row is ` +
      `tagged for another site (sites: ${JSON.stringify(rowSites(row as { sites?: unknown }) ?? [])}).`;
    console.warn(notice);
    warnings.push(notice);
    return false;
  }
  const plan = planManagedRefresh(row, review, managed.fields);
  if (plan.empty.length > 0) {
    const notice =
      `[import] WARN slug "${review.slug}" ${MANAGED_FIELDS_KEY}: the seed carries no value for ` +
      `${plan.empty.join(', ')} — skipped (the row keeps its current value).`;
    console.warn(notice);
    warnings.push(notice);
  }
  if (plan.changed.length === 0) {
    console.log(
      `[import] SEED OK ${review.slug} (status=published, seo in sync: ` +
        `${plan.writable.length > 0 ? plan.writable.join(', ') : 'nothing to write'})`,
    );
    return true;
  }
  applyManagedRefresh(row, review, plan);
  // A substantive edit bumps updatedAt (sitemap lastmod follows it).
  row.updatedAt = now;
  refreshed.push({ slug: review.slug, fields: plan.changed });
  console.log(
    `[import] SEED OK ${review.slug} (status=published, seo refreshed: ${plan.changed.join(', ')})`,
  );
  return true;
}

/**
 * Per-run report of the repo-managed fields the import refreshed. The deploy
 * verification step reads it so the log shows what each seed refreshed.
 *
 * Always written (empty when nothing was refreshed) so a stale report can
 * never outlive the run that produced it.
 */
async function writeRefreshReport(dbFile: string, refreshed: SeedRefresh[]): Promise<void> {
  const file = path.join(path.dirname(dbFile), REFRESH_REPORT_FILE);
  const bySlug: Record<string, string[]> = {};
  for (const r of refreshed) bySlug[r.slug] = r.fields;
  try {
    await fs.writeFile(
      file,
      JSON.stringify(
        { site: siteId(), runAt: new Date().toISOString(), refreshed: bySlug },
        null,
        2,
      ) + '\n',
      'utf8',
    );
  } catch (err) {
    console.warn(
      `[import] refresh report not written: ${err instanceof Error ? err.message : err}`,
    );
  }
}

/**
 * Announce freshly published seeds to the IndexNow participants (Bing
 * first) so the engine looks at the new URLs now, not at the next crawl.
 *
 * Batched into ONE request (the protocol allows 10,000 URLs per call) and
 * never fatal: a ping problem is a warning, never an import failure.
 */
async function announcePublished(slugs: string[]): Promise<void> {
  try {
    const origin = indexNowOrigin();
    if (!origin) {
      console.warn(
        `[import] ${slugs.length} seed(s) published but IndexNow skipped ` +
          `(site origin unknown — set SITE_URL or the site.url setting)`,
      );
      return;
    }
    const urls = slugs.map((slug) => reviewUrl(origin, slug));
    const result = await notifyIndexNowSoon(urls, { origin });
    if (result.pinged > 0) {
      console.log(`[import] indexnow: announced ${result.pinged} published URL(s)`);
    } else if (result.failed > 0) {
      console.warn(`[import] indexnow: ${result.failed} published URL(s) not announced`);
    }
  } catch (err) {
    console.warn(
      `[import] indexnow: ping failed: ${err instanceof Error ? err.message : err}`,
    );
  }
}

/**
 * CLI run — prints the summary + warnings and returns the process exit code.
 *
 * An unrated-publish refusal is NOT an error: the seed lands as a draft
 * (the owner scores it later) and the run continues with the remaining
 * seeds, exit 0. A content mistake in one seed must never block a
 * release. Only a malformed/unimportable seed (validation errors) is
 * fatal, as before.
 */
export async function runImport(
  target: string,
  opts: { dry?: boolean; skipExisting?: boolean; refresh?: boolean; dbPath?: string } = {},
): Promise<number> {
  const r = await importMarkdown(target, opts);
  console.log(
    `[import] imported=${r.imported} skipped=${r.skipped}` +
      `${opts.dry ? ' (dry run)' : ''}` +
      `${opts.skipExisting ? ' (skip-existing)' : ''}` +
      `${opts.refresh ? ' (refresh)' : ''}` +
      `${r.refreshed.length > 0 ? ` (seo refreshed=${r.refreshed.length})` : ''}`,
  );
  for (const e of r.errors) console.error(`[import] SKIP ${e}`);
  if (r.refused.length > 0) {
    console.error(
      `[import] ${r.refused.length} seed(s) asked to publish without a rating: ` +
        `left as drafts. Set a rating, then publish from /admin.`,
    );
  }
  return r.errors.length > 0 ? 2 : 0;
}

async function main() {
  const target = process.argv[2];
  if (!target) throw new Error('usage: import.ts <inDir|file.md> [--dry] [--skip-existing] [--refresh]');
  const dry = process.argv.includes('--dry');
  const skipExisting = process.argv.includes('--skip-existing');
  const refresh = process.argv.includes('--refresh');
  process.exitCode = await runImport(target, { dry, skipExisting, refresh });
}

if ((process.argv[1] ?? '').endsWith('import.ts')) {
  main().catch((e) => {
    console.error('[import] FAILED:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
