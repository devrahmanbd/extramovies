/**
 * backup.ts — DB backup / restore for the file-backed store (+ SQLite passthrough).
 * Usage:
 *   npm run backup -- backup [dbPath] [outDir]
 *   npm run backup -- restore <backupFile> [destPath]
 * Defaults: dbPath = $REVIEWS_DB_PATH or data/reviews.json, outDir = backups/
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const DEFAULT_DB = process.env.REVIEWS_DB_PATH ?? path.join(process.cwd(), 'data', 'reviews.json');

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export async function backupDb(src = DEFAULT_DB, outDir = path.join(process.cwd(), 'backups')): Promise<string> {
  await fs.mkdir(outDir, { recursive: true });
  const base = path.basename(src).replace(/[^a-z0-9.-]+/gi, '_') || 'reviews.json';
  const dest = path.join(outDir, `${stamp()}-${base}`);
  await fs.copyFile(src, dest);
  // sidecar manifest for restore verification
  const stat = await fs.stat(src);
  await fs.writeFile(
    `${dest}.manifest.json`,
    JSON.stringify({ src, bytes: stat.size, at: new Date().toISOString() }, null, 2),
    'utf8',
  );
  return dest;
}

export async function restoreDb(backupFile: string, dest = DEFAULT_DB): Promise<string> {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  // safety: keep a pre-restore copy
  try {
    await fs.copyFile(dest, `${dest}.pre-restore-${stamp()}.bak`);
  } catch {
    /* no existing db — nothing to shelve */
  }
  await fs.copyFile(backupFile, dest);
  return dest;
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'backup') {
    const dest = await backupDb(a, b);
    console.log(`[backup] wrote ${dest}`);
  } else if (cmd === 'restore') {
    if (!a) throw new Error('usage: backup.ts restore <backupFile> [destPath]');
    const dest = await restoreDb(a, b);
    console.log(`[backup] restored to ${dest}`);
  } else {
    throw new Error('usage: backup.ts <backup|restore> [...]');
  }
}

if ((process.argv[1] ?? '').endsWith('backup.ts')) {
  main().catch((e) => {
    console.error('[backup] FAILED:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
