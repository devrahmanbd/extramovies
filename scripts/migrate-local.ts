/**
 * migrate-local.ts — ensure local data files + document D1 parity.
 * Usage: npm run migrate  (tsx scripts/migrate-local.ts)
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
const REVIEWS_JSON = process.env.REVIEWS_DB_PATH ?? path.join(DATA_DIR, 'reviews.json');

const MIGRATIONS = [
  {
    id: '001-reviews-json',
    describe: 'ensure data/reviews.json exists (array)',
    async up() {
      await fs.mkdir(path.dirname(REVIEWS_JSON), { recursive: true });
      try {
        const raw = await fs.readFile(REVIEWS_JSON, 'utf8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error('reviews.json must be an array');
      } catch (e: unknown) {
        if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') {
          await fs.writeFile(REVIEWS_JSON, '[]\n', 'utf8');
        } else throw e;
      }
    },
  },
  {
    id: '002-portable-contract',
    describe: 'validate existing reviews against portable contract (non-destructive)',
    async up() {
      const raw = await fs.readFile(REVIEWS_JSON, 'utf8');
      const arr = JSON.parse(raw) as unknown[];
      let fixed = 0;
      for (const r of arr as Record<string, unknown>[]) {
        if (r && typeof r === 'object' && !Array.isArray((r as Record<string, unknown>).redirects)) {
          (r as Record<string, unknown>).redirects = [];
          fixed++;
        }
      }
      if (fixed > 0) await fs.writeFile(REVIEWS_JSON, JSON.stringify(arr, null, 2) + '\n', 'utf8');
      console.log(`migration 002: normalized ${fixed} review(s)`);
    },
  },
];

async function main() {
  console.log(`[migrate] target: ${REVIEWS_JSON}`);
  for (const m of MIGRATIONS) {
    console.log(`[migrate] ${m.id}: ${m.describe}`);
    await m.up();
  }
  console.log('[migrate] done. D1 parity: apply equivalent DDL via `wrangler d1 migrations apply`.');
  console.log('[migrate] see docs/DEPLOY.md for Cloudflare + cPanel paths.');
}

if ((process.argv[1] ?? '').endsWith('migrate-local.ts')) {
  main().catch((e) => {
    console.error('[migrate] FAILED:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

export { MIGRATIONS };
