/**
 * Adapter abstraction: one interface, two drivers.
 * - Production (Cloudflare): D1 via `env.DB` + drizzle-orm/d1
 * - Local / cPanel: SQLite file via better-sqlite3 + drizzle-orm/better-sqlite3
 *
 * Pages/endpoints take `locals.db` (wired in middleware) — never import a
 * driver directly. FTS5 search works identically on both (see migration).
 */
import { drizzle as drizzleD1, type DrizzleD1Database } from 'drizzle-orm/d1';
import { drizzle as drizzleSqlite, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { sql, type SQL } from 'drizzle-orm';
import * as schema from './schema';

/**
 * Driver-compat raw runner. Drizzle driver methods differ by version/dialect
 * (this repo's better-sqlite3 session exposes `.all`, not `.execute`):
 * prefer `.execute()`, fall back to `.all()`. Always resolves to a row array.
 * Test doubles exposing `{ execute }` keep working.
 */
export async function dbExecute<T = Record<string, unknown>>(
  db: AppDb | { execute: (q: unknown) => unknown } | { all: (q: unknown) => unknown },
  query: SQL
): Promise<T[]> {
  const d = db as {
    execute?: (q: unknown) => unknown;
    all?: (q: unknown) => unknown;
  };
  if (typeof d.execute === 'function') {
    const res = (await d.execute(query)) as { rows?: unknown } | unknown[];
    const rows = (res as { rows?: unknown })?.rows ?? res;
    return (Array.isArray(rows) ? rows : []) as T[];
  }
  if (typeof d.all === 'function') {
    try {
      const res = await d.all(query);
      return (Array.isArray(res) ? res : []) as T[];
    } catch (err) {
      // better-sqlite3 .all() rejects write statements ("does not return
      // data") — retry via .run() and resolve to no rows.
      if (
        /does not return data/i.test(
          err instanceof Error ? err.message : String(err)
        ) &&
        typeof (d as { run?: unknown }).run === 'function'
      ) {
        await (d as { run: (q: unknown) => unknown }).run(query);
        return [];
      }
      throw err;
    }
  }
  throw new Error('dbExecute: driver supports neither execute() nor all()');
}

export type AppDb = DrizzleD1Database<typeof schema> | BetterSQLite3Database<typeof schema>;

export interface AppEnv {
  DB?: D1Database;
  DB_FILE?: string;
  BRAND_PRESET?: string;
  SITE_URL?: string;
}

/**
 * Node-only require without a static import (keeps Workers bundles free of
 * node: APIs — this is property access, not an import statement, and the
 * Workers path returns via env.DB before ever reaching it).
 */
function nodeRequire(id: string): unknown {
  const g = globalThis as {
    process?: { getBuiltinModule?: (m: string) => unknown };
    require?: (id: string) => unknown;
  };
  const getBuiltin = g.process?.getBuiltinModule;
  if (typeof getBuiltin === 'function') {
    const mod = getBuiltin.call(g.process, 'module') as {
      createRequire?: (url: string) => (id: string) => unknown;
    };
    if (typeof mod?.createRequire === 'function') {
      return mod.createRequire(import.meta.url)(id);
    }
  }
  if (typeof g.require === 'function') return g.require(id);
  throw new Error(`node require unavailable for ${id}`);
}

export function getDb(env: AppEnv): AppDb {
  if (env.DB) return drizzleD1(env.DB, { schema }) as AppDb;
  // Local-only path — resolved at call time, never statically imported.
  const Database = nodeRequire('better-sqlite3') as typeof import('better-sqlite3');
  const file = env.DB_FILE ?? (typeof process !== 'undefined' ? process.env.DB_FILE : undefined) ?? './data/local.db';
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return drizzleSqlite(sqlite, { schema }) as AppDb;
}

export async function getSetting(db: AppDb, key: string): Promise<string | null> {
  // Portable raw query — dbExecute hides D1 / better-sqlite3 differences.
  const rows = await dbExecute<{ value: string }>(
    db,
    sql`SELECT value FROM settings WHERE key = ${key} LIMIT 1`
  );
  return rows[0]?.value ?? null;
}

/** FTS5 search over reviews (title + dek + canonical markdown). */
export async function searchReviews(db: AppDb, query: string, limit = 10) {
  const q = query.trim().replace(/["*]/g, '').slice(0, 120);
  if (!q) return [];
  const rows = await dbExecute(
    db,
    sql`SELECT r.slug, r.title, r.dek, r.rating_100 AS rating100,
               snippet(reviews_fts, 2, '<mark>', '</mark>', '…', 24) AS excerpt
        FROM reviews_fts f JOIN reviews r ON r.rowid = f.rowid
        WHERE reviews_fts MATCH ${q + '*'}
        ORDER BY rank LIMIT ${limit}`
  );
  return rows as {
    slug: string;
    title: string;
    dek: string | null;
    rating100: number | null;
    excerpt: string;
  }[];
}
