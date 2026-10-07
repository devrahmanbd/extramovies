/** POST /api/generate/harsher — partial action: sharpen criticism, stay honest. */
import type { NextApiRequest, NextApiResponse } from "next";
import type { APIRoute } from "astro";
import { rewriteParagraph } from "../../../lib/ai/pipeline";
import { validateTaste } from "../../../lib/ai/taste";
import { wrapLegacy } from "../../../lib/api-adapter";

export const prerender = false;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { paragraph, before, after, rating, taste } = (req.body ?? {}) as {
    paragraph?: unknown;
    before?: unknown;
    after?: unknown;
    rating?: unknown;
    taste?: unknown;
  };
  if (typeof paragraph !== "string" || !paragraph.trim())
    return res.status(400).json({ error: "paragraph is required" });
  if (typeof rating !== "number" || rating < 0 || rating > 10)
    return res.status(400).json({ error: "rating must be 0..10" });

  try {
    const text = await rewriteParagraph(paragraph, {
      before: before as string | undefined,
      after: after as string | undefined,
      rating,
      instruction:
        "Sharpen the criticism one notch: more direct, more specific about what failed. No cruelty for sport, no invented flaws, no generic snark. Tone must still match the authoritative rating.",
      taste: validateTaste(taste ?? {}),
    });
    return res.status(200).json({ paragraph: text });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "harsher failed";
    return res.status(500).json({ error: message });
  }
}

export const POST: APIRoute = wrapLegacy(handler as never);
