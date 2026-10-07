/**
 * cost-control.ts — model routing + budget guards.
 * Goal: full reviews stay cheap; partial edits never trigger a full regen.
 */

import type { ModelTier } from "./openrouter";

export type StageName =
  | "metadata"
  | "research-query"
  | "plan"
  | "draft"
  | "style-voice"
  | "fact-check"
  | "seo"
  | "humanize"
  | "partial-edit";

export interface StageBudget {
  tier: ModelTier;
  maxTokens: number;
  temperature: number;
}

/** Per-stage routing: cheap where quality loss is invisible, primary where voice matters. */
export const STAGE_ROUTE: Record<StageName, StageBudget> = {
  "metadata":      { tier: "cheap",   maxTokens: 800,  temperature: 0.2 },
  "research-query":{ tier: "cheap",   maxTokens: 600,  temperature: 0.3 },
  "plan":          { tier: "cheap",   maxTokens: 1200, temperature: 0.4 },
  "draft":         { tier: "primary", maxTokens: 2500, temperature: 0.8 },
  "style-voice":   { tier: "primary", maxTokens: 2500, temperature: 0.7 },
  "fact-check":    { tier: "cheap",   maxTokens: 1200, temperature: 0.0 },
  "seo":           { tier: "cheap",   maxTokens: 1500, temperature: 0.3 },
  "humanize":      { tier: "primary", maxTokens: 2500, temperature: 0.7 },
  "partial-edit":  { tier: "primary", maxTokens: 800,  temperature: 0.7 },
};

/** Rough token estimate (~4 chars/token) for pre-flight budget checks. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface CostRecord {
  label: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  at: string;
}

const costLog: CostRecord[] = [];

export function logCost(r: Omit<CostRecord, "at">): void {
  costLog.push({ ...r, at: new Date().toISOString() });
  // DB owner: persist to generation_costs table here.
}

export function getCostLog(): readonly CostRecord[] {
  return costLog;
}

/** Pre-flight guard: refuse stages whose prompt is pathologically large. */
const MAX_PROMPT_TOKENS = 12_000;

export function assertWithinBudget(label: string, promptText: string): void {
  const n = estimateTokens(promptText);
  if (n > MAX_PROMPT_TOKENS) {
    throw new Error(
      `[cost-control] ${label}: prompt ~${n} tokens exceeds cap ${MAX_PROMPT_TOKENS}. Trim research notes / samples.`
    );
  }
}

/**
 * Partial actions (rewrite-paragraph, shorter, harsher, more-personal)
 * must only send the target paragraph + minimal context — never the full draft.
 * This helper builds that minimal payload.
 */
export function buildPartialPayload(
  paragraph: string,
  context: { before?: string; after?: string; rating: number; instruction: string }
): string {
  const parts = [
    `RATING (authoritative): ${context.rating}/10`,
    `INSTRUCTION: ${context.instruction}`,
    context.before ? `PREVIOUS PARAGRAPH (context only, do not rewrite):\n${context.before.slice(0, 600)}` : "",
    `TARGET PARAGRAPH TO REWRITE:\n${paragraph}`,
    context.after ? `NEXT PARAGRAPH (context only, do not rewrite):\n${context.after.slice(0, 600)}` : "",
  ].filter(Boolean);
  return parts.join("\n\n");
}
