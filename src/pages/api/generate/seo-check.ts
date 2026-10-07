/** POST /api/generate/seo-check — cheap-tier SEO audit of title/meta/draft. */
import type { NextApiRequest, NextApiResponse } from "next";
import type { APIRoute } from "astro";
import { chatCompletion } from "../../../lib/ai/openrouter";
import { STAGE_ROUTE, assertWithinBudget, logCost } from "../../../lib/ai/cost-control";
import { wrapLegacy } from "../../../lib/api-adapter";

export const prerender = false;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { title, metaDescription, draft } = (req.body ?? {}) as {
    title?: unknown;
    metaDescription?: unknown;
    draft?: unknown;
  };
  if (typeof draft !== "string" || !draft.trim())
    return res.status(400).json({ error: "draft is required" });

  try {
    const route = STAGE_ROUTE.seo;
    const payload = `TITLE: ${title ?? "(none)"}\nMETA: ${metaDescription ?? "(none)"}\nDRAFT (excerpt):\n${draft.slice(0, 2000)}`;
    assertWithinBudget("seo", payload);
    const result = await chatCompletion(
      [
        {
          role: "system",
          content:
            "SEO check (cheap tier). Return JSON {issues: string[], title: string, metaDescription: string, slug: string}. No keyword stuffing, no clickbait contradicting the review's verdict.",
        },
        { role: "user", content: payload },
      ],
      { tier: route.tier, maxTokens: route.maxTokens, temperature: route.temperature, label: "action:seo-check" }
    );
    logCost({ label: "action:seo-check", model: result.model, promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens });
    return res.status(200).json({ result: result.text });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "seo-check failed";
    return res.status(500).json({ error: message });
  }
}

export const POST: APIRoute = wrapLegacy(handler as never);
