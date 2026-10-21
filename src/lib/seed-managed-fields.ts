/**
 * seed-managed-fields — the ONE exception that lets a repo seed refresh the
 * SEO/meta surface of a PUBLISHED review.
 *
 * House rule (AGENTS.md §2): a row the owner published from /admin is NEVER
 * overwritten by a deploy. That rule stays exactly as it is. This module
 * adds a single, explicit, per-seed opt-in on top of it:
 *
 *   managed_fields: "[\"seo_title\", \"seo_description\"]"
 *
 * When the seed's row is already published, the import then writes ONLY the
 * listed fields — and only the ones the seed actually carries a value for.
 * Everything else on the row (rating, published_at, status, title, the
 * owner's own edits, the row id, its sites tag) stays exactly as it was.
 *
 * Narrow by construction:
 *   - the allowlist is fixed: seo_title, seo_description, excerpt, body,
 *     featured;
 *   - an unknown name is reported loudly and IGNORED, never written;
 *   - a seed without the key changes no behaviour at all (additive,
 *     fallback-first — AGENTS.md §6);
 *   - the row must be visible on the running site (slug + site identity),
 *     so a seed can never reach into another brand's row.
 */
import type { PortableReview } from './portability';

/** Frontmatter key a seed uses to declare which fields the repo owns. */
export const MANAGED_FIELDS_KEY = 'managed_fields';

/** The ONLY fields a seed may ever manage (SEO/meta surface + placement). */
export const MANAGED_FIELD_NAMES = [
  'seo_title',
  'seo_description',
  'excerpt',
  'body',
  'featured',
] as const;

export type ManagedField = (typeof MANAGED_FIELD_NAMES)[number];

export interface ManagedFields {
  /** The seed declared the key at all. */
  declared: boolean;
  /** Allowed names, in the order the seed listed them, deduped. */
  fields: ManagedField[];
  /** Declared names that are NOT allowed — reported, never written. */
  unknown: string[];
}

export interface ManagedRefreshPlan {
  /** Fields the seed may write (allowed AND the seed carries a value). */
  writable: ManagedField[];
  /** Fields whose seed value differs from the row's current value. */
  changed: ManagedField[];
  /** Fields the seed lists but carries no value for — skipped, reported. */
  empty: ManagedField[];
}

/** A usable string value, or undefined for empty/blank/non-string input. */
function usable(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

/**
 * A usable boolean value, or undefined for anything that is not a real
 * boolean (a string, a number, null). Only `true`/`false` are flags.
 */
function flag(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

/**
 * Resolve the seed's `managed_fields` declaration.
 *
 * `declared` is the list of names as parsed from the frontmatter (undefined
 * when the key is absent). Unknown names are collected, not thrown: the
 * caller reports them and the import continues.
 */
export function resolveManagedFields(declared: string[] | undefined): ManagedFields {
  if (!declared || declared.length === 0) {
    return { declared: false, fields: [], unknown: [] };
  }
  const fields: ManagedField[] = [];
  const unknown: string[] = [];
  for (const raw of declared) {
    const name = String(raw ?? '').trim().toLowerCase();
    if (!name) continue;
    if ((MANAGED_FIELD_NAMES as readonly string[]).includes(name)) {
      const field = name as ManagedField;
      if (!fields.includes(field)) fields.push(field);
    } else if (!unknown.includes(name)) {
      unknown.push(name);
    }
  }
  return { declared: true, fields, unknown };
}

/** The row's `seo` object (never undefined — an empty object when absent). */
function seoOf(row: Record<string, unknown>): Record<string, unknown> {
  const seo = row.seo;
  return seo && typeof seo === 'object' && !Array.isArray(seo)
    ? (seo as Record<string, unknown>)
    : {};
}

/** The value the SEED carries for a managed field (undefined = no value). */
export function seedManagedValue(
  field: ManagedField,
  review: PortableReview,
): string | boolean | undefined {
  switch (field) {
    case 'seo_title':
      return usable(review.seo_title);
    case 'seo_description':
      return usable(review.seo_description);
    case 'excerpt':
      return usable((review as Record<string, unknown>).excerpt);
    case 'body':
      return usable(review.body);
    case 'featured':
      return flag((review as Record<string, unknown>).featured);
  }
}

/** The value the ROW currently holds for a managed field. */
export function rowManagedValue(
  row: Record<string, unknown>,
  field: ManagedField,
): string | boolean | undefined {
  switch (field) {
    case 'seo_title':
      return usable(seoOf(row).seoTitle);
    case 'seo_description':
      return usable(seoOf(row).metaDesc);
    case 'excerpt':
      return usable(row.excerpt);
    case 'body':
      return usable(row.markdown);
    case 'featured':
      return flag(row.featured);
  }
}

/**
 * Plan a managed-field refresh of an existing row: which fields the seed may
 * write, which of them actually differ, and which are declared but empty.
 * Pure — it never mutates the row.
 */
export function planManagedRefresh(
  row: Record<string, unknown>,
  review: PortableReview,
  fields: ManagedField[],
): ManagedRefreshPlan {
  const writable: ManagedField[] = [];
  const changed: ManagedField[] = [];
  const empty: ManagedField[] = [];
  for (const field of fields) {
    const value = seedManagedValue(field, review);
    if (value === undefined) {
      empty.push(field);
      continue;
    }
    writable.push(field);
    if (rowManagedValue(row, field) !== value) changed.push(field);
  }
  return { writable, changed, empty };
}

/**
 * Write the planned fields onto the row. Only the fields whose value really
 * changed are written — the rest of the row is never touched.
 *
 * `seo` is merged, not replaced: the owner's own keys inside it (primaryTopic,
 * searchIntent) survive.
 */
export function applyManagedRefresh(
  row: Record<string, unknown>,
  review: PortableReview,
  plan: ManagedRefreshPlan,
): ManagedField[] {
  const written: ManagedField[] = [];
  for (const field of plan.changed) {
    const value = seedManagedValue(field, review);
    if (value === undefined) continue;
    switch (field) {
      case 'seo_title':
        row.seo = { ...seoOf(row), seoTitle: value as string };
        break;
      case 'seo_description':
        row.seo = { ...seoOf(row), metaDesc: value as string };
        break;
      case 'excerpt':
        row.excerpt = value;
        break;
      case 'body':
        row.markdown = value;
        break;
      case 'featured':
        row.featured = value as boolean;
        break;
    }
    written.push(field);
  }
  return written;
}
