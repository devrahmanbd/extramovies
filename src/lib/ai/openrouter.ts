/**
 * OpenRouter gateway — SERVER-SIDE ONLY.
 * Never import this module from client components.
 * The API key lives only in process.env and is never serialized.
 *
 * Env:
 *   OPENROUTER_API_KEY    (required, server only — free :free models still need a key)
 *   OPENROUTER_MODEL      (primary, default thinkingmachines/inkling:free)
 *   OPENROUTER_CHEAP_MODEL (cheap tier for metadata/seo-check/fact-lite,
 *     default nvidia/nemotron-3.5-lightning:free)
 *   OPENROUTER_BASE_URL   (default https://openrouter.ai/api/v1)
 *   OPENROUTER_SITE_URL / OPENROUTER_SITE_NAME (optional ranking headers)
 *
 * Free-tier note: :free endpoints are best-effort (429/502/404-no-provider
 * are routine) and rate-limited (20 req/min, 50 req/day without credits),
 * so chatCompletion retries transient failures with backoff. Prompts and
 * completions on free models may be logged by providers for training —
 * never send secrets, credentials, or unlisted PII in prompts.
 */

export type ModelTier = "primary" | "cheap";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  tier?: ModelTier;
  modelOverride?: string;
  temperature?: number;
  maxTokens?: number;
  /** Caller label for cost logging, e.g. "stage:draft" */
  label?: string;
  signal?: AbortSignal;
}

export interface ChatResult {
  text: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

import { effectiveWithoutDb } from "../settings";

/** Dashboard-injected overrides (set per-request from settings table). */
const overrides: { apiKey?: string; model?: string; cheapModel?: string; baseUrl?: string } = {};

export function setOpenRouterOverrides(o: Partial<typeof overrides>): void {
  if (o.apiKey !== undefined) overrides.apiKey = o.apiKey;
  if (o.model !== undefined) overrides.model = o.model;
  if (o.cheapModel !== undefined) overrides.cheapModel = o.cheapModel;
  if (o.baseUrl !== undefined) overrides.baseUrl = o.baseUrl;
}

function baseUrl(): string {
  const v = overrides.baseUrl?.trim() || effectiveWithoutDb('openrouter.base_url');
  return (v || "https://openrouter.ai/api/v1").replace(/\/$/, "");
}

function apiKey(): string {
  const v = overrides.apiKey?.trim() || effectiveWithoutDb('openrouter.api_key');
  if (!v) throw new Error("Missing OpenRouter key — set it at /admin/settings → APIs (server-side only).");
  return v;
}

/** @deprecated use baseUrl() — kept so old imports don't break. */
export const BASE_URL = "https://openrouter.ai/api/v1";

function assertServer() {
  if (typeof window !== "undefined") {
    throw new Error(
      "openrouter.ts imported on the client. This module is server-only."
    );
  }
  apiKey();
}

export function getPrimaryModel(): string {
  return overrides.model?.trim() || effectiveWithoutDb('openrouter.model');
}

export function getCheapModel(): string {
  return (
    overrides.cheapModel?.trim() ||
    overrides.model?.trim() ||
    effectiveWithoutDb('openrouter.cheap_model') ||
    effectiveWithoutDb('openrouter.model')
  );
}

export function resolveModel(tier: ModelTier = "primary"): string {
  return tier === "cheap" ? getCheapModel() : getPrimaryModel();
}

export async function chatCompletion(
  messages: ChatMessage[],
  opts: ChatOptions = {}
): Promise<ChatResult> {
  assertServer();
  const model = opts.modelOverride ?? resolveModel(opts.tier ?? "primary");

  const body = JSON.stringify({
    model,
    messages,
    temperature: opts.temperature ?? 0.7,
    ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
  });

  // Free-tier endpoints fail transiently (429/502/404-no-provider). Retry
  // with backoff; POSTs here have no server-side side effects.
  const delaysMs = [1500, 5000];
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${baseUrl()}/chat/completions`, {
        method: "POST",
        signal: opts.signal,
        headers: {
          Authorization: `Bearer ${apiKey()}`,
          "Content-Type": "application/json",
          ...(effectiveWithoutDb('site.url')
            ? { "HTTP-Referer": effectiveWithoutDb('site.url') }
            : {}),
          ...(effectiveWithoutDb('site.name')
            ? { "X-Title": effectiveWithoutDb('site.name') }
            : {}),
        },
        body,
      });
    } catch (err) {
      lastError = err;
      if ((err as Error)?.name === "AbortError" || attempt === delaysMs.length) throw err;
      await sleep(delaysMs[attempt]);
      continue;
    }
    if (res.ok) {
      const json = await res.json();
      const choice = json?.choices?.[0]?.message?.content ?? "";
      const text = Array.isArray(choice)
        ? choice.map((p: any) => (typeof p === "string" ? p : p?.text ?? "")).join("")
        : String(choice ?? "");

      return {
        text,
        model: json?.model ?? model,
        usage: {
          promptTokens: json?.usage?.prompt_tokens ?? 0,
          completionTokens: json?.usage?.completion_tokens ?? 0,
          totalTokens: json?.usage?.total_tokens ?? 0,
        },
      };
    }
    const errBody = await res.text().catch(() => "");
    lastError = new Error(`OpenRouter ${res.status}: ${errBody.slice(0, 500)}`);
    const retryable =
      res.status === 429 ||
      res.status === 502 ||
      res.status === 503 ||
      res.status === 504 ||
      (res.status === 404 && /no provider/i.test(errBody));
    if (!retryable || attempt === delaysMs.length) throw lastError;
    await sleep(delaysMs[attempt]);
  }
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Cheap-tier shortcut for metadata / seo-check / fact-lite stages. */
export function cheapCompletion(messages: ChatMessage[], opts: Omit<ChatOptions, "tier"> = {}) {
  return chatCompletion(messages, { ...opts, tier: "cheap" });
}

/** Primary-tier shortcut for draft / voice / humanizer stages. */
export function primaryCompletion(messages: ChatMessage[], opts: Omit<ChatOptions, "tier"> = {}) {
  return chatCompletion(messages, { ...opts, tier: "primary" });
}
