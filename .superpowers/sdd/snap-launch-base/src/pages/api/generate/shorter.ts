/** POST /api/generate/shorter — partial action: tighten one paragraph (~40% shorter). */
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
        "Make it ~40% shorter. Cut filler and throat-clearing, keep every fact and the sharpest specific. Preserve meaning and rating tone.",
      taste: validateTaste(taste ?? {}),
    });
    return res.status(200).json({ paragraph: text });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "shorter failed";
    return res.status(500).json({ error: message });
  }
}

export const POST: APIRoute = wrapLegacy(handler as never);
