import type { APIRoute } from "astro";
import { buildRobotsTxt } from "../lib/seo/sitemap";
import { siteOrigin } from "../lib/seo/meta";

/**
 * GET /robots.txt — crawler policy for this brand.
 * The origin is resolved through siteOrigin() so every brand emits its own
 * domain (SITE_URL wins behind the proxy; request origin in dev) — never a
 * hardcoded host, never a query string.
 * NOTE: the legacy archive router must never intercept this path — /robots.txt
 * is a root-level asset file, exempt under the asset rules in
 * src/lib/legacy/router.ts (isStaticAssetPath).
 */
export const GET: APIRoute = ({ url }) => {
  return new Response(buildRobotsTxt(siteOrigin(url.origin)), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
