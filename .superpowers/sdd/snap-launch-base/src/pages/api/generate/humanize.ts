/** POST /api/generate/humanize — standalone humanizer pass on provided text. */
import type { NextApiRequest, NextApiResponse } from "next";
import type { APIRoute } from "astro";
import { chatCompletion } from "../../../lib/ai/openrouter";
import { STAGE_ROUTE, assertWithinBudget, logCost } from "../../../lib/ai/cost-control";
import { wrapLegacy } from "../../../lib/api-adapter";

export const prerender = false;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { text } = (req.body ?? {}) as { text?: unknown };
  if (typeof text !== "string" || !text.trim())
    return res.status(400).json({ error: "text is required" });

  try {
    const route = STAGE_ROUTE.humanize;
    assertWithinBudget("humanize", text);
    const result = await chatCompletion(
      [
        {
          role: "system",
          content:
            "Quality pass per humanizer principles: natural rhythm, varied sentences, concrete specifics. Preserve meaning, facts, opinion, and voice. No detector-evasion tricks. Output revised text only.",
        },
        { role: "user", content: text },
      ],
      { tier: route.tier, maxTokens: route.maxTokens, temperature: route.temperature, label: "action:humanize" }
    );
    logCost({ label: "action:humanize", model: result.model, promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens });
    return res.status(200).json({ text: result.text });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "humanize failed";
    return res.status(500).json({ error: message });
  }
}

export const POST: APIRoute = wrapLegacy(handler as never);
