/**
 * Configured author identity — server-only sync reader.
 *
 * Single source of truth for the publication byline:
 *   data/settings.json key `seo.author` (flat; nested `seo.author` also
 *   accepted defensively) -> env SEO_AUTHOR -> ''.
 *
 * Never throws ('' fallback). No DB, no async — file read sync is fine
 * in Astro SSR; everything is wrapped in try/catch.
 */

import fs from "node:fs";
import path from "node:path";

export const LEGACY_AUTHOR = "Staff Review";
export const FALLBACK_AUTHOR = "The Editor";

function settingsFilePath(): string {
  try {
    if (typeof process !== "undefined" && process.env.SETTINGS_FILE_PATH) {
      return process.env.SETTINGS_FILE_PATH;
    }
  } catch {
    /* fall through to default */
  }
  try {
    return path.join(process.cwd(), "data", "settings.json");
  } catch {
    return path.join("data", "settings.json");
  }
}

function envAuthor(): string {
  try {
    // Astro/Vite runtime (import.meta.env) when available.
    // @ts-expect-error — import.meta available in Astro/Vite runtime
    const viteVal = typeof import.meta !== "undefined" ? import.meta.env?.SEO_AUTHOR : undefined;
    if (typeof viteVal === "string" && viteVal.trim() !== "") return viteVal.trim();
  } catch {
    /* non-Vite runtime */
  }
  try {
    if (
      typeof process !== "undefined" &&
      typeof process.env?.SEO_AUTHOR === "string" &&
      process.env.SEO_AUTHOR.trim() !== ""
    ) {
      return process.env.SEO_AUTHOR.trim();
    }
  } catch {
    /* env unavailable */
  }
  return "";
}

/** Configured author name, or '' when none is configured. Never throws. */
export function getConfiguredAuthor(): string {
  try {
    try {
      const raw = fs.readFileSync(settingsFilePath(), "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const flat = parsed["seo.author"];
      if (typeof flat === "string" && flat.trim() !== "") return flat.trim();
      const nested = (parsed as { seo?: unknown }).seo;
      if (nested && typeof nested === "object") {
        const a = (nested as Record<string, unknown>).author;
        if (typeof a === "string" && a.trim() !== "") return a.trim();
      }
    } catch {
      // Missing/unreadable/invalid file — fall through to env.
    }
    const env = envAuthor();
    if (env) return env;
    return "";
  } catch {
    return "";
  }
}

/**
 * Byline resolution: configured value wins; legacy 'Staff Review'/empty
 * falls back to configured or 'The Editor'.
 */
export function displayAuthor(reviewAuthor: string): string {
  try {
    const configured = getConfiguredAuthor().trim();
    if (configured) return configured;
    const r = typeof reviewAuthor === "string" ? reviewAuthor.trim() : "";
    if (!r) return FALLBACK_AUTHOR;
    if (r.toLowerCase() === LEGACY_AUTHOR.toLowerCase()) return FALLBACK_AUTHOR;
    return r;
  } catch {
    try {
      const r = typeof reviewAuthor === "string" ? reviewAuthor.trim() : "";
      if (!r) return FALLBACK_AUTHOR;
      if (r.toLowerCase() === LEGACY_AUTHOR.toLowerCase()) return FALLBACK_AUTHOR;
      return r;
    } catch {
      return FALLBACK_AUTHOR;
    }
  }
}
