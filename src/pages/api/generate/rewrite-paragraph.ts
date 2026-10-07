/** POST /api/generate/rewrite-paragraph — partial action, one paragraph only. */
import type { NextApiRequest, NextApiResponse } from "next";
import type { APIRoute } from "astro";
import { rewriteParagraph } from "../../../lib/ai/pipeline";
import { validateTaste } from "../../../lib/ai/taste";
import { wrapLegacy } from "../../../lib/api-adapter";

export const prerender = false;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { paragraph, before, after, rating, instruction, taste } = (req.body ?? {}) as {
    paragraph?: unknown;
    before?: unknown;
    after?: unknown;
    rating?: unknown;
    instruction?: unknown;
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
      instruction: typeof instruction === "string" && instruction.trim()
        ? instruction
        : "Rewrite for clarity and voice. Preserve meaning and rating tone.",
      taste: validateTaste(taste ?? {}),
    });
    return res.status(200).json({ paragraph: text });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "rewrite failed";
    return res.status(500).json({ error: message });
  }
}

export const POST: APIRoute = wrapLegacy(handler as never);
