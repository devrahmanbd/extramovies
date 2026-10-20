/**
 * IndexNow integration (https://www.indexnow.org).
 *
 * WHAT IT IS: IndexNow is an open protocol that lets a site tell search
 * engines "these URLs changed — look at them now" instead of waiting for
 * the next crawl. Bing, Yandex, Seznam and the other participants share
 * one endpoint (https://api.indexnow.org/indexnow), so one ping reaches
 * all of them.
 *
 * WHAT IT IS NOT: a ranking request. IndexNow never asks for a better
 * position, never asks for inclusion, and never overrides a crawl block
 * (Bing's "Blocked — URL cannot appear on Bing" state stays until the
 * owner clears it in Bing Webmaster Tools). It only says: "look again".
 *
 * THE KEY IS PUBLIC — BY DESIGN. The protocol requires the key to be
 * fetchable from the site root (`https://<host>/<key>.txt`), so anybody
 * can read it. It is a shared token, NOT a secret: never gate anything on
 * it, never require it as an env var, never fail hard when it is absent.
 * The committed default key ships with the code (and its key file in
 * public/); a per-brand override can be set through the INDEXNOW_KEY env
 * var — the env wins — so a second brand can use its own key without a
 * code change.
 *
 * FAIL-SOFT BY CONTRACT: every failure here is swallowed and reported as
 * counts. A ping problem must never break a publish or an import.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { siteOrigin } from "./meta";

/** Shared endpoint of every IndexNow participant. */
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/** Protocol limit: at most 10,000 URLs per request. */
export const INDEXNOW_MAX_URLS = 10_000;

/** Per-request timeout (ms). A slow endpoint must never hang a publish. */
export const INDEXNOW_TIMEOUT_MS = 10_000;

/**
 * Default key — PUBLIC (the protocol requires it to be readable at the
 * site root). Generated with node's crypto.randomBytes(16); the matching
 * key file lives at public/<key>.txt so it is served from the site root.
 * Override per brand with the INDEXNOW_KEY env var.
 */
export const INDEXNOW_DEFAULT_KEY = "b51dda5f33279591da8c2fd0653384a4";

export interface IndexNowResult {
  /** URLs delivered to the endpoint (accepted by the engine). */
  pinged: number;
  /** URLs NOT delivered (filtered out, or the request failed). */
  failed: number;
  /** True when the caller's deadline hit before the ping settled. */
  pending?: boolean;
}

/** A fresh 32-hex-character key (16 random bytes). Public by nature. */
export function generateIndexNowKey(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Effective key: the INDEXNOW_KEY env override wins, otherwise the
 * committed default. Never empty, never an error.
 */
export function indexnowKey(): string {
  const env =
    typeof process !== "undefined" ? (process.env.INDEXNOW_KEY ?? "").trim() : "";
  return env !== "" ? env : INDEXNOW_DEFAULT_KEY;
}

/** Read a per-site origin from the dashboard settings file (best effort). */
function settingsFileOrigin(): string {
  try {
    const file =
      process.env.SETTINGS_FILE_PATH ??
      path.join(process.cwd(), "data", "settings.json");
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const v = (parsed as Record<string, unknown>)["site.url"];
      if (typeof v === "string" && v.trim() !== "") return v.trim();
    }
  } catch {
    /* missing/unreadable → no dashboard origin */
  }
  return "";
}

/**
 * The site's OWN origin, resolved in one place:
 *   SITE_URL env (per-box env, wins — same rule the canonicals use)
 *   → an explicit origin (e.g. derived from the request)
 *   → the dashboard `site.url` setting.
 *
 * Returns "" when nothing resolves. The caller must then SKIP the ping:
 * a guessed host would announce the wrong site's URLs.
 */
export function indexNowOrigin(explicit?: string): string {
  const fromEnvOrRequest = siteOrigin((explicit ?? "").trim()).trim();
  for (const raw of [fromEnvOrRequest, settingsFileOrigin()]) {
    const cleaned = raw.replace(/\/+$/, "");
    if (/^https?:\/\/[^/]+$/.test(cleaned)) return cleaned;
  }
  return "";
}

/** Host of an origin: hostname (for the URL filter) + host (for the payload). */
function hostOf(origin: string): { hostname: string; host: string } | null {
  try {
    const u = new URL(origin);
    return { hostname: u.hostname.toLowerCase(), host: u.host };
  } catch {
    return null;
  }
}

/** First value of a header (string | string[] | undefined), case-insensitive. */
function headerValue(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string {
  if (!headers) return "";
  const direct = headers[name] ?? headers[name.toLowerCase()];
  const raw = Array.isArray(direct) ? direct[0] : direct;
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Best-effort request origin from proxy headers.
 *
 * Behind the panel proxy Node sees http while the browser speaks https
 * (the reason security.checkOrigin is off in astro.config.mjs), so a
 * non-local host defaults to https and x-forwarded-proto wins when the
 * proxy sends it. Local dev stays http.
 */
export function originFromHeaders(
  headers: Record<string, string | string[] | undefined> | undefined,
): string {
  const host = headerValue(headers, "host");
  if (!host) return "";
  const forwarded = headerValue(headers, "x-forwarded-proto").split(",")[0]?.trim();
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
  const scheme =
    forwarded && /^https?$/i.test(forwarded)
      ? forwarded.toLowerCase()
      : local
        ? "http"
        : "https";
  return `${scheme}://${host}`;
}

/** Public URL of a published review (the canonical path of a review row). */
export function reviewUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/+$/, "")}/reviews/${slug}`;
}

function errText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : "unknown error";
}

/**
 * Announce URLs to the IndexNow participants (Bing first).
 *
 * Rules enforced here:
 *  - an empty list does nothing;
 *  - only http/https URLs are accepted;
 *  - only URLs on the site's OWN host are accepted (never an external one);
 *  - at most 10,000 URLs per request (protocol limit);
 *  - 10s timeout per request;
 *  - every failure is swallowed: counts come back, one warning is logged.
 */
export async function notifyIndexNow(
  urls: string[],
  opts: { origin?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<IndexNowResult> {
  const input = (Array.isArray(urls) ? urls : [])
    .filter((u): u is string => typeof u === "string")
    .map((u) => u.trim())
    .filter((u) => u !== "");
  if (input.length === 0) return { pinged: 0, failed: 0 };

  const origin = indexNowOrigin(opts.origin);
  const host = origin ? hostOf(origin) : null;
  if (!host) {
    console.warn(
      "[indexnow] skipped: site origin unknown (set SITE_URL or the site.url setting)",
    );
    return { pinged: 0, failed: input.length };
  }

  const accepted: string[] = [];
  let failed = 0;
  for (const raw of input) {
    let u: URL | null = null;
    try {
      u = new URL(raw);
    } catch {
      u = null;
    }
    if (
      !u ||
      (u.protocol !== "http:" && u.protocol !== "https:") ||
      u.hostname.toLowerCase() !== host.hostname
    ) {
      failed++;
      continue;
    }
    accepted.push(raw);
  }

  const doFetch =
    opts.fetchImpl ??
    (typeof fetch === "function" ? fetch : undefined);
  if (!doFetch) {
    console.warn("[indexnow] skipped: no fetch available in this runtime");
    return { pinged: 0, failed: input.length };
  }

  const key = indexnowKey();
  const timeoutMs = opts.timeoutMs ?? INDEXNOW_TIMEOUT_MS;
  let pinged = 0;
  for (let i = 0; i < accepted.length; i += INDEXNOW_MAX_URLS) {
    const chunk = accepted.slice(i, i + INDEXNOW_MAX_URLS);
    const payload = { host: host.host, key, urlList: chunk };
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response | undefined;
      try {
        res = await doFetch(INDEXNOW_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      const status = typeof res?.status === "number" ? res.status : 0;
      const ok = res?.ok === true || (status >= 200 && status < 300);
      if (ok) {
        pinged += chunk.length;
      } else {
        failed += chunk.length;
        console.warn(
          `[indexnow] rejected: HTTP ${status || "?"} for ${chunk.length} URL(s)`,
        );
      }
    } catch (err) {
      failed += chunk.length;
      console.warn(`[indexnow] ping failed: ${errText(err)}`);
    }
  }
  return { pinged, failed };
}

/**
 * Ping with a hard deadline: resolves as soon as the ping settles OR the
 * deadline passes, so a slow IndexNow endpoint can never delay a publish
 * response or a deploy. The ping keeps running in the background; its own
 * timeout (10s) still applies.
 */
export async function notifyIndexNowSoon(
  urls: string[],
  opts: {
    origin?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    deadlineMs?: number;
  } = {},
): Promise<IndexNowResult> {
  const deadlineMs = opts.deadlineMs ?? 2_000;
  const work = notifyIndexNow(urls, opts).catch((err: unknown) => {
    console.warn(`[indexnow] ping error: ${errText(err)}`);
    return { pinged: 0, failed: 0 };
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<IndexNowResult>((resolve) => {
    timer = setTimeout(
      () => resolve({ pinged: 0, failed: 0, pending: true }),
      deadlineMs,
    );
    const t = timer as unknown as { unref?: () => void };
    if (typeof t.unref === "function") t.unref();
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
