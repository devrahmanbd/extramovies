/**
 * POST /api/setup/finish — step 3 of the first-run wizard (site details).
 * Body (JSON or plain form post):
 *   { "site.name"?: string, "region.default"?: string,
 *     "brand.preset"?: string, "site.theme"?: string (optional) }
 *
 * Site fields upsert normally. site.theme is written ONLY when nothing
 * has locked a theme yet — an existing value is never overwritten.
 * No auth while unconfigured; admin required after configuration.
 */
import type { APIRoute } from 'astro';
import { THEME_KEY, isValidTheme } from '../../../lib/theme';
import {
  hasStoredTheme,
  jsonErr,
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

const SITE_FIELDS = ['site.name', 'region.default', 'brand.preset'] as const;

export const POST: APIRoute = async (context) => {
  const file = await readSetupFile().catch(() => ({} as Record<string, string>));
  const gate = await setupOrAdmin(context, file);
  if (gate) return gate;

  const body = await readBody(context.request);
  const input = pickSettings(body, SITE_FIELDS);

  // Optional theme on the finish step: set-once semantics, strict values.
  const rawTheme = body[THEME_KEY];
  if (typeof rawTheme === 'string' && rawTheme.trim() !== '') {
    const theme = rawTheme.trim();
    if (!isValidTheme(theme)) {
      if (wantsHtml(context.request)) {
        return context.redirect('/setup?error=theme#step-site', 303);
      }
      return jsonErr(400, "site.theme must be 'discovery' or 'publication'");
    }
    if (!hasStoredTheme(file)) {
      input[THEME_KEY] = theme;
    }
    // Existing theme? Silently keep it — never overwrite.
  }

  const bad = validateOr400(input);
  if (bad) {
    if (wantsHtml(context.request)) {
      return context.redirect('/setup?error=site#step-site', 303);
    }
    return bad;
  }

  const next = { ...file, ...input };
  await writeSetupFile(next);
  await mirrorToDb(next);

  if (wantsHtml(context.request)) {
    return context.redirect('/admin/settings', 303);
  }
  return jsonOk({ saved: Object.keys(input), themeLocked: hasStoredTheme(next) });
};
