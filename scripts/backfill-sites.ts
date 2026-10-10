/**
 * backfill-sites.ts — one-time cutover for pre-namespace store rows.
 *
 * Tags untagged non-seed rows with a site namespace so pre-namespace
 * extramovies content stops rendering as "shared everywhere" once SITE_ID
 * is set on the servers.
 *
 * Additive + idempotent: only fills in missing/empty `sites` on rows that
 * lack it; never touches rows that already have a tag, never deletes.
 * Seed rows (`seed-*`) stay untagged (shared starter) unless --include-seeds.
 *
 * Usage (run ON the target server, or with --db pointing at a copy):
 *   npx tsx scripts/backfill-sites.ts --site=extramovies --dry
 *   npx tsx scripts/backfill-sites.ts --site=extramovies
 *   npx tsx scripts/backfill-sites.ts --site=cinemavilla --include-seeds --db=/path/reviews.json
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const DEFAULT_DB = process.env.REVIEWS_DB_PATH ?? path.join(process.cwd(), 'data', 'reviews.json');

function arg(name: string): string | undefined {
  const p = `--${name}=`;
  for (const a of process.argv.slice(2)) {
    if (a.startsWith(p)) return a.slice(p.length);
  }
  return undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const site = arg('site') ?? process.env.SITE_ID;
  if (!site || !site.trim()) {
    throw new Error('usage: backfill-sites.ts --site=<site-id> [--dry] [--include-seeds] [--db=path]');
  }
  const dry = flag('dry');
  const includeSeeds = flag('include-seeds');
  const dbFile = arg('db') ?? DEFAULT_DB;

  let rows: Record<string, unknown>[];
  try {
    const raw = await fs.readFile(dbFile, 'utf8');
    const parsed = JSON.parse(raw);
    rows = Array.isArray(parsed) ? parsed : [];
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') {
      console.log(`[backfill] no store at ${dbFile}; nothing to do`);
      return;
    }
    throw e;
  }

  let tagged = 0;
  let skippedTagged = 0;
  let skippedSeeds = 0;
  for (const r of rows) {
    const sites = (r as { sites?: unknown }).sites;
    if (Array.isArray(sites) && sites.length > 0) {
      skippedTagged += 1;
      continue;
    }
    const id = String((r as { id?: unknown }).id ?? '');
    if (!includeSeeds && id.startsWith('seed-')) {
      skippedSeeds += 1;
      continue;
    }
    if (!dry) (r as { sites: string[] }).sites = [site.trim()];
    tagged += 1;
  }

  if (!dry) {
    await fs.mkdir(path.dirname(dbFile), { recursive: true });
    await fs.writeFile(dbFile, JSON.stringify(rows, null, 2) + '\n', 'utf8');
  }
  console.log(
    `[backfill] site=${site} ${dry ? '(dry run) ' : ''}tagged=${tagged} already-tagged=${skippedTagged} skipped-seeds=${skippedSeeds} file=${dbFile}`,
  );
}

main().catch((e) => {
  console.error('[backfill] FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
