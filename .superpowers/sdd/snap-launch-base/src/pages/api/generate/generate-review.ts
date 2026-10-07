/** POST /api/generate/generate-review — full pipeline run. */
import type { NextApiRequest, NextApiResponse } from "next";
import type { APIRoute } from "astro";
import reviewWriterRules from "../../../../prompts/review-writer.md?raw";
import { validateTaste } from "../../../lib/ai/taste";
import { runFullReview, type ReviewJob } from "../../../lib/ai/pipeline";
import { getJobStore } from "../../../lib/ai/jobs";
import { wrapLegacy } from "../../../lib/api-adapter";

export const prerender = false;

const FALLBACK_RULES = "Write a personal movie review. Honor the rating tone.";

function loadSystemRules(): string {
  const bundled = (reviewWriterRules ?? "").trim();
  return bundled || FALLBACK_RULES;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { movie, rating, userPrompt, taste, researchSources } = ((req as { body?: unknown }).body ?? {}) as {
    movie?: { title?: unknown };
    rating?: unknown;
    userPrompt?: unknown;
    taste?: unknown;
    researchSources?: unknown;
  };
  if (!movie?.title || typeof movie.title !== "string")
    return res.status(400).json({ error: "movie.title is required" });
  if (typeof rating !== "number" || rating < 0 || rating > 10)
    return res.status(400).json({ error: "rating must be 0..10" });
  if (typeof userPrompt !== "string" || userPrompt.trim().length === 0)
    return res.status(400).json({ error: "userPrompt is required" });

  try {
    const store = getJobStore();
    const job: ReviewJob = {
      id: `review_${Date.now()}`,
      uxStage: "fetching",
      input: {
        movie: movie as ReviewJob["input"]["movie"],
        rating: rating as number,
        userPrompt: userPrompt as string,
        taste: validateTaste(taste ?? {}),
        researchSources: Array.isArray(researchSources) ? researchSources : [],
        systemRules: loadSystemRules(),
      },
      outputs: {},
      updatedAt: new Date().toISOString(),
    };
    await store.create(job);
    const done = await runFullReview(job, store);
    return res.status(200).json({ id: done.id, uxStage: done.uxStage, outputs: done.outputs });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "generation failed";
    return res.status(500).json({ error: message });
  }
}

export const POST: APIRoute = wrapLegacy(handler as never);

// Polling: frontend polls uxStage (fetching -> researching -> angle -> writing -> fact-check -> seo -> humanizing -> ready).
