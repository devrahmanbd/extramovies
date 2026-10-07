import type { APIRoute } from "astro";
import { buildRobotsTxt } from "../lib/seo/sitemap";
import { siteOrigin } from "../lib/seo/meta";

export const GET: APIRoute = ({ url }) => {
  return new Response(buildRobotsTxt(siteOrigin(url.origin)), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
