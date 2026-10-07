/**
 * POST /api/setup/theme — step 1 of the first-run wizard.
 * Body: { "site.theme": "discovery" | "publication" } (JSON or plain form post).
 *
 * No auth while unconfigured; admin required after configuration.
 * NEVER overwrites an existing site.theme value (409 on conflict).
 */
import type { APIRoute } from 'astro';
import { THEME_KEY } from '../../../lib/theme';
import {
  hasStoredTheme,
  jsonErr,
  jsonOk,
  mirrorToDb,
  readBody,
  readSetupFile,
  setupOrAdmin,
  wantsHtml,
  writeSetupFile,
} from './_store';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const file = await readSetupFile().catch(() => ({} as Record<string, string>));
  const gate = await setupOrAdmin(context, file);
  if (gate) return gate;

  const body = await readBody(context.request);
  const raw = body[THEME_KEY];
  const theme = typeof raw === 'string' ? raw.trim() : '';

  // Strict: empty / unknown values are rejected here (dashboard allows
  // empty for partial saves; the wizard theme step does not).
  if (theme !== 'discovery' && theme !== 'publication') {
    if (wantsHtml(context.request)) {
      return context.redirect('/setup?error=theme#step-type', 303);
    }
    return jsonErr(400, "site.theme must be 'discovery' or 'publication'");
  }

  // Permanent choice — an existing value is never overwritten, by anyone.
  if (hasStoredTheme(file)) {
    if (wantsHtml(context.request)) {
      return context.redirect('/setup?error=locked#step-type', 303);
    }
    return jsonErr(409, 'site.theme is already set and cannot be changed');
  }

  const next = { ...file, [THEME_KEY]: theme };
  await writeSetupFile(next);
  await mirrorToDb(next);

  if (wantsHtml(context.request)) {
    return context.redirect('/setup?saved=theme#step-keys', 303);
  }
  return jsonOk({ theme });
};
