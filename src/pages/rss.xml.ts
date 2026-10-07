import type { APIRoute } from "astro";
import { getBrand } from "../lib/seo/brand";
import { getLatestReviews } from "../lib/seo/content";

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const GET: APIRoute = ({ url }) => {
  const brand = getBrand();
  const origin = url.origin;
  const items = getLatestReviews(30)
    .map(
      (r) => `    <item>
      <title>${escXml(`${r.movieTitle} review: ${r.reviewTitle}`)}</title>
      <link>${origin}/reviews/${r.slug}</link>
      <guid isPermaLink="true">${origin}/reviews/${r.slug}</guid>
      <description>${escXml(r.excerpt)}</description>
      <pubDate>${new Date(r.publishedAt).toUTCString()}</pubDate>
    </item>`
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>${escXml(brand.name)}</title>\n    <link>${origin}/</link>\n    <description>${escXml(brand.description)}</description>\n    <language>en-us</language>\n${items}\n  </channel>\n</rss>\n`;
  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
};
