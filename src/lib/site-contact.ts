/**
 * Contact route — the address a reader writes to, and the reply window the
 * editor promises.
 *
 * NO ADDRESS IS CONFIGURED YET. Both values below are empty on purpose: an
 * invented address is a dead end for a reader and a false claim to a crawler.
 * Until one is set, /contact renders a clearly marked placeholder where the
 * mail link would be, and the page never pretends to have a working inbox.
 *
 * Three ways to set the address, in priority order:
 *   1. env CONTACT_EMAIL        per box, no rebuild (the server's
 *                              ecosystem.config.js env block)
 *   2. SITE_CONTACT_EMAIL      the constant below, a one line code change
 *   3. nothing                 the page shows the placeholder
 *
 * The reply window works the same way (CONTACT_RESPONSE_TIME /
 * SITE_CONTACT_RESPONSE_TIME) and is optional: with no window set, the page
 * says the only thing it can say honestly, that the editor reads every
 * message and that there is no autoresponder.
 *
 * Per-box values, never per-review copy: the address is site configuration,
 * so it lives in env or in this file, not in a review row.
 */

/** The editor's address. Empty until the owner fills it in. */
export const SITE_CONTACT_EMAIL = "";

/** The reply window the editor promises, in the owner's own words. */
export const SITE_CONTACT_RESPONSE_TIME = "";

/** Env var that carries the address per box (wins over the constant). */
export const CONTACT_EMAIL_ENV = "CONTACT_EMAIL";

/** Env var that carries the reply window per box. */
export const CONTACT_RESPONSE_TIME_ENV = "CONTACT_RESPONSE_TIME";

/** Read an env var without ever throwing (no process.env in some runtimes). */
function envVal(name: string): string {
  if (!name) return "";
  try {
    // Astro/Vite runtime (import.meta.env) when available.
    // @ts-expect-error — import.meta available in Astro/Vite runtime
    const viteVal = typeof import.meta !== "undefined" ? import.meta.env?.[name] : undefined;
    if (typeof viteVal === "string" && viteVal.trim() !== "") return viteVal.trim();
  } catch {
    /* non-Vite runtime */
  }
  try {
    if (typeof process !== "undefined" && typeof process.env?.[name] === "string") {
      const v = process.env[name].trim();
      if (v) return v;
    }
  } catch {
    /* env unavailable */
  }
  return "";
}

/**
 * A basic address shape check: one @, something on both sides, a dot in the
 * domain. Used to keep a typo out of a live mailto link.
 */
export function isUsableEmail(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  if (!v || v.length > 254) return false;
  if (/\s/.test(v)) return false;
  const at = v.indexOf("@");
  if (at <= 0 || at !== v.lastIndexOf("@")) return false;
  const domain = v.slice(at + 1);
  return domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}

/**
 * The contact address for this site, or "" when none is configured.
 * Never throws, never invents an address.
 */
export function getContactEmail(): string {
  const fromEnv = envVal(CONTACT_EMAIL_ENV);
  if (fromEnv) return fromEnv;
  const fromCode = SITE_CONTACT_EMAIL.trim();
  if (fromCode) return fromCode;
  return "";
}

/**
 * The reply window the editor promises, or "" when none is configured.
 * Same resolution order as the address.
 */
export function getContactResponseTime(): string {
  const fromEnv = envVal(CONTACT_RESPONSE_TIME_ENV);
  if (fromEnv) return fromEnv;
  const fromCode = SITE_CONTACT_RESPONSE_TIME.trim();
  if (fromCode) return fromCode;
  return "";
}

/**
 * A mailto link with an optional subject. Returns "" when there is no usable
 * address, so a caller never renders a broken mail link.
 */
export function contactMailto(email: string | null | undefined, subject?: string): string {
  const addr = (email ?? "").trim();
  if (!isUsableEmail(addr)) return "";
  const base = `mailto:${addr}`;
  const subjectPart = (subject ?? "").trim();
  if (!subjectPart) return base;
  return `${base}?subject=${encodeURIComponent(subjectPart)}`;
}

export interface SiteContact {
  /** The editor's address, or "" when none is configured. */
  email: string;
  /** True when the address is present AND usable as a mail link. */
  hasEmail: boolean;
  /** The promised reply window, or "" when the owner has not set one. */
  responseTime: string;
}

/** The whole contact route in one read: address, mail-link flag, reply window. */
export function getSiteContact(): SiteContact {
  const email = getContactEmail();
  return {
    email,
    hasEmail: isUsableEmail(email),
    responseTime: getContactResponseTime(),
  };
}
