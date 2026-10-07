/** migrate.ts — `npm run migrate` entry. Runs local migrations. */
import { MIGRATIONS } from './migrate-local.js';

async function main() {
  for (const m of MIGRATIONS) {
    console.log(`[migrate] ${m.id}: ${m.describe}`);
    await m.up();
  }
  console.log('[migrate] done.');
}

main().catch((e) => {
  console.error('[migrate] FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
