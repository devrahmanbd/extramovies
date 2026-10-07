/**
 * migrate-sql.ts — idempotent SQLite migrations with an applied-tracker.
 *
 * Usage: DB_FILE=/path/to.db npx tsx scripts/migrate-sql.ts
 *   (defaults to ./data/local.db; creates parent dirs)
 *
 * Why not `sqlite3 < file` in a loop: migrations/0005_moderation.sql
 * contains a bare ALTER TABLE … ADD COLUMN that fails on re-apply
 * ("duplicate column name"), breaking every deploy after the first.
 * This runner records applied files in _migrations and tolerates
 * already-applied DDL (IF NOT EXISTS gaps, duplicate columns) so reruns
 * always converge instead of failing.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3") as unknown as new (
  file: string
) => {
  exec(sql: string): void;
  prepare(sql: string): { get(...p: unknown[]): unknown; run(...p: unknown[]): unknown };
  close(): void;
};

const MIGRATIONS_DIR = path.join(process.cwd(), "migrations");
const DB_FILE = process.env.DB_FILE ?? path.join(process.cwd(), "data", "local.db");
const IGNORABLE = /already exists|duplicate column name/i;

function main(): void {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const db = new Database(DB_FILE);
  try {
    db.exec(
      "CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
    );
    const applied = new Set(
      (
        db.prepare("SELECT id FROM _migrations").all() as { id: string }[]
      ).map((r) => r.id)
    );
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    let ran = 0;
    let skipped = 0;
    for (const file of files) {
      if (applied.has(file)) {
        skipped += 1;
        continue;
      }
      const raw = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      // PRAGMAs (e.g. journal_mode) cannot run inside a transaction.
      const pragmas = raw
        .split("\n")
        .filter((l) => /^\s*PRAGMA\s/i.test(l))
        .join("\n");
      const body = raw
        .split("\n")
        .filter((l) => !/^\s*PRAGMA\s/i.test(l))
        .join("\n");
      if (pragmas.trim()) db.exec(pragmas);
      try {
        db.exec(`BEGIN; ${body}; COMMIT;`);
      } catch (err) {
        try {
          db.exec("ROLLBACK;");
        } catch {
          /* nothing to roll back */
        }
        if (err instanceof Error && IGNORABLE.test(err.message)) {
          console.log(`tolerated (already applied): ${file}: ${err.message.split("\n")[0]}`);
        } else {
          throw err;
        }
      }
      db.prepare("INSERT OR IGNORE INTO _migrations (id, applied_at) VALUES (?, ?)").run(
        file,
        new Date().toISOString()
      );
      ran += 1;
      console.log(`applied: ${file}`);
    }
    console.log(`migrate-sql done: ${ran} applied, ${skipped} skipped (${files.length} files)`);
  } finally {
    db.close();
  }
}

try {
  main();
} catch (err) {
  console.error("migrate-sql FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
}
