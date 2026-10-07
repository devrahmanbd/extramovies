/**
 * OpenRouter gateway — SERVER-SIDE ONLY.
 * Never import this module from client components.
 * The API key lives only in process.env and is never serialized.
 *
 * Env:
 *   OPENROUTER_API_KEY    (required, server only)
 *   OPENROUTER_MODEL      (primary, e.g. anthropic/claude-sonnet-4)
 *   OPENROUTER_CHEAP_MODEL (cheap tier for metadata/seo-check/fact-lite)
 *   OPENROUTER_BASE_URL   (default https://openrouter.ai/api/v1)
 *   OPENROUTER_SITE_URL / OPENROUTER_SITE_NAME (optional ranking headers)
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

  const res = await fetch(`${baseUrl()}/chat/completions`, {
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
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.7,
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 500)}`);
  }

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

/** Cheap-tier shortcut for metadata / seo-check / fact-lite stages. */
export function cheapCompletion(messages: ChatMessage[], opts: Omit<ChatOptions, "tier"> = {}) {
  return chatCompletion(messages, { ...opts, tier: "cheap" });
}

/** Primary-tier shortcut for draft / voice / humanizer stages. */
export function primaryCompletion(messages: ChatMessage[], opts: Omit<ChatOptions, "tier"> = {}) {
  return chatCompletion(messages, { ...opts, tier: "primary" });
}
