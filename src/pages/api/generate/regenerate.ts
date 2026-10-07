/** POST /api/generate/regenerate — re-run draft + downstream with same or updated input. */
import type { NextApiRequest, NextApiResponse } from "next";
import type { APIRoute } from "astro";
import { getJobStore } from "../../../lib/ai/jobs";
import { runFullReview } from "../../../lib/ai/pipeline";
import { validateTaste } from "../../../lib/ai/taste";
import { wrapLegacy } from "../../../lib/api-adapter";

export const prerender = false;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { id, rating, userPrompt, taste } = (req.body ?? {}) as {
    id?: unknown;
    rating?: unknown;
    userPrompt?: unknown;
    taste?: unknown;
  };
  if (typeof id !== "string") return res.status(400).json({ error: "id is required" });

  try {
    const store = getJobStore();
    const job = await store.get(id);
    if (!job) return res.status(404).json({ error: "job not found" });
    if (typeof rating === "number") {
      if (rating < 0 || rating > 10) return res.status(400).json({ error: "rating must be 0..10" });
      job.input.rating = rating;
    }
    if (typeof userPrompt === "string" && userPrompt.trim()) job.input.userPrompt = userPrompt;
    if (taste !== undefined) job.input.taste = validateTaste(taste);
    job.outputs = {}; // drop stale stage outputs; job store keeps input cached
    const done = await runFullReview(job, store);
    return res.status(200).json({ id: done.id, uxStage: done.uxStage, outputs: done.outputs });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "regenerate failed";
    return res.status(500).json({ error: message });
  }
}

export const POST: APIRoute = wrapLegacy(handler as never);
