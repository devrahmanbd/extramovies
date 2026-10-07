/**
 * POST /api/setup/keys — step 2 of the first-run wizard (optional API keys).
 * Body: { "tmdb.api_key"?: string, "openrouter.api_key"?: string }
 * (JSON or plain form post). Keys upsert normally; blanks keep existing.
 *
 * No auth while unconfigured; admin required after configuration.
 */
import type { APIRoute } from 'astro';
import {
  jsonOk,
  mirrorToDb,
  pickSettings,
  readBody,
  readSetupFile,
  setupOrAdmin,
  validateOr400,
  wantsHtml,
} from './_store';

export const prerender = false;

const KEY_FIELDS = ['tmdb.api_key', 'openrouter.api_key'] as const;

export const POST: APIRoute = async (context) => {
  const file = await readSetupFile().catch(() => ({} as Record<string, string>));
  const gate = await setupOrAdmin(context, file);
  if (gate) return gate;

  const body = await readBody(context.request);
  const input = pickSettings(body, KEY_FIELDS);

  const bad = validateOr400(input);
  if (bad) {
    if (wantsHtml(context.request)) {
      return context.redirect('/setup?error=keys#step-keys', 303);
    }
    return bad;
  }

  const next = { ...file, ...input };
  await writeSetupFile(next);
  await mirrorToDb(next);

  if (wantsHtml(context.request)) {
    return context.redirect('/setup?saved=keys#step-site', 303);
  }
  return jsonOk({ saved: Object.keys(input) });
};
