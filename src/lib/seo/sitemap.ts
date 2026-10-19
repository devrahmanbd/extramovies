/** Sitemap + robots helpers (seo-technical: crawlability). */

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
}

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map(
      (e) =>
        `  <url>\n    <loc>${escXml(e.loc)}</loc>` +
        (e.lastmod ? `\n    <lastmod>${escXml(e.lastmod)}</lastmod>` : "") +
        (e.changefreq ? `\n    <changefreq>${e.changefreq}</changefreq>` : "") +
        (typeof e.priority === "number" ? `\n    <priority>${e.priority.toFixed(1)}</priority>` : "") +
        `\n  </url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function buildRobotsTxt(origin: string): string {
  const base = origin.replace(/\/$/, "");
  // Allow-only policy: no Disallow rules. Admin/login/search pages carry a
  // `noindex` meta, and Google can only read that meta if it can crawl them.
  return (
    `User-agent: *\n` +
    `Allow: /\n` +
    `\n` +
    `Sitemap: ${base}/sitemap.xml\n`
  );
}
