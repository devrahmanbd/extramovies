/**
 * pipeline.ts — stage pipeline for review generation.
 *
 * Stages:
 *   INPUT -> MOVIE DATA -> USER OPINION -> RESEARCH -> FACT CHECK
 *   -> REVIEW PLAN -> DRAFT -> STYLE/VOICE -> HUMANIZER -> SEO -> FINAL MARKDOWN
 *
 * Frontend polling stages (UX):
 *   fetching -> researching -> angle -> writing -> fact-check -> seo -> humanizing -> ready
 *
 * Each stage is a pure-ish function; intermediate results are cached
 * in the job store so partial actions never trigger a full regen.
 */

import { chatCompletion } from "./openrouter";
import { STAGE_ROUTE, assertWithinBudget, logCost } from "./cost-control";
import { buildTasteBlock, buildSamplesBlock, ratingAlignmentNote, type TasteProfile } from "./taste";
import { buildResearchNotesBlock, type ResearchSource } from "./research-store";

export type UxStage =
  | "fetching"
  | "researching"
  | "angle"
  | "writing"
  | "fact-check"
  | "seo"
  | "humanizing"
  | "ready";

export interface MovieFacts {
  title: string;
  year?: number;
  director?: string;
  genres?: string[];
  runtimeMinutes?: number;
  cast?: string[];
  isAdaptation?: boolean;
}

export interface ReviewInput {
  movie: MovieFacts;
  rating: number; // 0..10 authoritative
  userPrompt: string; // the user's opinion / angle notes
  taste: TasteProfile;
  researchSources?: ResearchSource[];
  systemRules: string; // loaded from prompts/review-writer.md SYSTEM section
}

export interface StageOutputs {
  movieData?: string;
  opinionDistilled?: string;
  researchNotes?: string;
  factCheck?: string;
  plan?: string;
  draft?: string;
  voiced?: string;
  humanized?: string;
  seo?: { title: string; metaDescription: string; slug: string };
  finalMarkdown?: string;
}

export interface ReviewJob {
  id: string;
  uxStage: UxStage;
  input: ReviewInput;
  outputs: StageOutputs;
  updatedAt: string;
}

export interface JobStore {
  create(job: ReviewJob): Promise<void>;
  update(id: string, patch: Partial<ReviewJob>): Promise<ReviewJob>;
  get(id: string): Promise<ReviewJob | null>;
}

/** In-memory job store; DB owner swaps for a persistent adapter. */
export function createMemoryJobStore(): JobStore & { all(): ReviewJob[] } {
  const map = new Map<string, ReviewJob>();
  return {
    async create(job) { map.set(job.id, job); },
    async update(id, patch) {
      const cur = map.get(id);
      if (!cur) throw new Error(`job ${id} not found`);
      const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
      map.set(id, next);
      return next;
    },
    async get(id) { return map.get(id) ?? null; },
    all: () => [...map.values()],
  };
}

async function runStage(
  label: keyof typeof STAGE_ROUTE,
  system: string,
  user: string
): Promise<string> {
  const route = STAGE_ROUTE[label];
  assertWithinBudget(label, system + user);
  const res = await chatCompletion(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { tier: route.tier, maxTokens: route.maxTokens, temperature: route.temperature, label: `stage:${label}` }
  );
  logCost({ label: `stage:${label}`, model: res.model, promptTokens: res.usage.promptTokens, completionTokens: res.usage.completionTokens });
  return res.text;
}

export function buildFinalPrompt(input: ReviewInput): { system: string; user: string } {
  // Authoritative order: SYSTEM RULES + TASTE + SAMPLES + MOVIE FACTS + RESEARCH NOTES + RATING + USER PROMPT
  const system = [
    input.systemRules,
    buildTasteBlock(input.taste),
    buildSamplesBlock(input.taste),
  ].join("\n\n");

  const user = [
    `--- MOVIE FACTS ---\n${JSON.stringify(input.movie, null, 2)}`,
    buildResearchNotesBlock(input.researchSources ?? []),
    ratingAlignmentNote(input.rating),
    `--- USER OPINION (raw notes, preserve the gist) ---\n${input.userPrompt}`,
    `Write the review now. Output final Markdown only.`,
  ].join("\n\n");

  return { system, user };
}

/** Full run: executes every stage in order, caching each output on the job. */
export async function runFullReview(job: ReviewJob, store: JobStore): Promise<ReviewJob> {
  const { input } = job;
  const set = async (uxStage: UxStage, outputs: Partial<StageOutputs>) =>
    store.update(job.id, { uxStage, outputs: { ...job.outputs, ...outputs } });

  // MOVIE DATA (fetching)
  await set("fetching", {});
  const movieData = await runStage(
    "metadata",
    "Extract clean movie metadata as JSON. Never invent missing fields — use null.",
    JSON.stringify(input.movie)
  );
  job.outputs.movieData = movieData;

  // RESEARCH (researching) — notes come from stored sources; model only distills queries if needed
  await store.update(job.id, { uxStage: "researching" });
  job.outputs.researchNotes = buildResearchNotesBlock(input.researchSources ?? []);

  // REVIEW PLAN (angle)
  await store.update(job.id, { uxStage: "angle" });
  const plan = await runStage(
    "plan",
    "You are the review planner. Given taste + rating + opinion, output: 1) one-sentence angle, 2) 4-6 beat outline, 3) what NOT to say. Honor the rating tone.",
    [buildTasteBlock(input.taste), ratingAlignmentNote(input.rating), `OPINION:\n${input.userPrompt}`].join("\n\n")
  );
  job.outputs.plan = plan;

  // DRAFT (writing)
  await store.update(job.id, { uxStage: "writing" });
  const { system, user } = buildFinalPrompt(input);
  const draft = await runStage("draft", system, `${plan}\n\n${user}`);
  job.outputs.draft = draft;

  // STYLE/VOICE pass
  const voiced = await runStage(
    "style-voice",
    `Apply the author's voice. ${buildTasteBlock(input.taste)}\nRemove banned phrases and generic openers. Preserve facts, rating tone, and meaning.`,
    draft
  );
  job.outputs.voiced = voiced;

  // FACT CHECK
  await store.update(job.id, { uxStage: "fact-check" });
  const factCheck = await runStage(
    "fact-check",
    "You are the fact-checker. Flag invented quotes, wrong years/names, unverified claims. Output a bullet list of issues or 'CLEAN'. Never rewrite the review.",
    `MOVIE FACTS:\n${movieData}\n\nREVIEW:\n${voiced}`
  );
  job.outputs.factCheck = factCheck;

  // SEO (cheap)
  await store.update(job.id, { uxStage: "seo" });
  const seoRaw = await runStage(
    "seo",
    "SEO editor. Output JSON {title, metaDescription (<=155 chars), slug}. No keyword stuffing, no clickbait that contradicts the rating.",
    `${input.movie.title} (${input.movie.year ?? "?"}) rated ${input.rating}/10.\n${voiced.slice(0, 2000)}`
  );
  let seo: StageOutputs["seo"];
  try {
    seo = JSON.parse(seoRaw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as StageOutputs["seo"];
  } catch {
    seo = { title: input.movie.title, metaDescription: "", slug: input.movie.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") };
  }
  job.outputs.seo = seo;

  // HUMANIZER (separate action in UX too, but included in full run)
  await store.update(job.id, { uxStage: "humanizing" });
  const humanized = await runStage(
    "humanize",
    "Quality pass per humanizer principles: natural rhythm, varied sentences, concrete specifics over abstractions. Preserve meaning, facts, opinion, and voice. No detector-evasion tricks.",
    voiced
  );
  job.outputs.humanized = humanized;
  job.outputs.finalMarkdown = humanized;

  return store.update(job.id, { uxStage: "ready", outputs: job.outputs });
}

/** Partial edit: rewrite one paragraph only — no full regen. */
export async function rewriteParagraph(
  paragraph: string,
  opts: { before?: string; after?: string; rating: number; instruction: string; taste: TasteProfile }
): Promise<string> {
  const { buildPartialPayload } = await import("./cost-control");
  const payload = buildPartialPayload(paragraph, {
    before: opts.before,
    after: opts.after,
    rating: opts.rating,
    instruction: opts.instruction,
  });
  return runStage(
    "partial-edit",
    `Rewrite exactly one paragraph. ${buildTasteBlock(opts.taste)}\n${ratingAlignmentNote(opts.rating)} Output only the rewritten paragraph.`,
    payload
  );
}
