/**
 * Manual "Where to Watch" links, added per review by the editor.
 * Two buckets:
 *   - free: custom free streaming sites the editor vouches for
 *   - paid: paid watch options (affiliate / sponsor / ticket links)
 *
 * Rendered AFTER the automatic TMDB/JustWatch tiles, clearly badged
 * "Added by the editor". Paid links always render rel="nofollow sponsored".
 */

export type CustomWatchKind = 'free' | 'paid';

export interface CustomWatchLink {
  label: string;
  url: string;
  kind: CustomWatchKind;
}

export interface CustomWatch {
  free: CustomWatchLink[];
  paid: CustomWatchLink[];
}

export const EMPTY_CUSTOM_WATCH: CustomWatch = { free: [], paid: [] };

export const MAX_LINKS_PER_KIND = 12;
export const MAX_LABEL_LEN = 60;

function cleanUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v) return null;
  // Absolute https/http URLs only — no javascript:, no relative paths.
  if (!/^https?:\/\/[^/\s]+\.[^/\s]+/i.test(v)) return null;
  if (/^javascript:/i.test(v)) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

function cleanLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_LABEL_LEN);
  return v ? v : null;
}

/** Validate + normalize one raw link. Returns null when unusable. */
export function normalizeCustomLink(raw: unknown, kind: CustomWatchKind): CustomWatchLink | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const label = cleanLabel(r.label);
  const url = cleanUrl(r.url);
  if (!label || !url) return null;
  return { label, url, kind };
}

/** Validate + normalize a whole customWatch payload (unknown shape from API body). */
export function normalizeCustomWatch(raw: unknown): CustomWatch {
  const out: CustomWatch = { free: [], paid: [] };
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as Record<string, unknown>;
  for (const kind of ['free', 'paid'] as const) {
    const list = r[kind];
    if (!Array.isArray(list)) continue;
    const seen = new Set<string>();
    for (const item of list) {
      const link = normalizeCustomLink(item, kind);
      if (!link) continue;
      const dedupe = `${link.label.toLowerCase()}|${link.url}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out[kind].push(link);
      if (out[kind].length >= MAX_LINKS_PER_KIND) break;
    }
  }
  return out;
}

/** True when at least one manual link exists. */
export function hasCustomWatch(cw: CustomWatch | undefined | null): boolean {
  if (!cw) return false;
  return (cw.free?.length ?? 0) + (cw.paid?.length ?? 0) > 0;
}

/** First letter avatar for a tile without a provider logo. */
export function initialOf(label: string): string {
  const ch = label.trim().charAt(0);
  return ch ? ch.toUpperCase() : '•';
}
