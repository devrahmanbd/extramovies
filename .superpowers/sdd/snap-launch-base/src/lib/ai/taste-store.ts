/**
 * taste-store.ts — persistence for the "My Taste" profile.
 * Canonical home: `settings` table, key `taste.profile`, JSON-encoded value
 * (settings.value holds JSON per the DB schema convention).
 * Uses portable raw queries so it runs on D1 + better-sqlite3.
 * Any object with an `execute` method works — in routes, pass `locals.db`.
 */

import { sql } from "drizzle-orm";
import { dbExecute } from "../db/adapter";
import type { AppDb } from "../db/adapter";
import { DEFAULT_TASTE, validateTaste, type TasteProfile } from "./taste";

export const TASTE_SETTINGS_KEY = "taste.profile";

interface Executable {
  execute(q: unknown): Promise<unknown>;
}

export async function loadTaste(
  db: AppDb | Executable
): Promise<TasteProfile> {
  const rows = await dbExecute<{ value: string }>(
    db as AppDb,
    sql`SELECT value FROM settings WHERE key = ${TASTE_SETTINGS_KEY} LIMIT 1`
  );
  const first = rows[0];
  if (!first?.value) return { ...DEFAULT_TASTE };
  try {
    return validateTaste(JSON.parse(first.value));
  } catch {
    return { ...DEFAULT_TASTE };
  }
}

export async function saveTaste(
  db: AppDb | Executable,
  taste: TasteProfile
): Promise<TasteProfile> {
  const valid = validateTaste(taste);
  valid.updatedAt = new Date().toISOString();
  const json = JSON.stringify(valid);
  await dbExecute(
    db as AppDb,
    sql`INSERT INTO settings (key, value) VALUES (${TASTE_SETTINGS_KEY}, ${json}) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  return valid;
}
