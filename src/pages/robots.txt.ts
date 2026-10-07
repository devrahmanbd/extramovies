import type { APIRoute } from "astro";
import { buildRobotsTxt } from "../lib/seo/sitemap";

export const GET: APIRoute = ({ url }) => {
  return new Response(buildRobotsTxt(url.origin), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
