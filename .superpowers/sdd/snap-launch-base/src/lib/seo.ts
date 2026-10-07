/**
 * SEO helpers — every public surface reads the active brand preset.
 * Covers: <head> meta, canonical, OG/Twitter, JSON-LD (Review+Movie,
 * ItemList, BreadcrumbList, WebSite+SearchAction), sitemap.xml, RSS, manifest.
 * Principles: SSR HTML carries title/description/canonical/JSON-LD
 * (never JS-injected), one H1 per page, semantic landmarks.
 */
import type { BrandPreset } from './branding/resolve';
import type { SiteConfig } from './config';

export interface PageSeo {
  title: string;
  description: string;
  path: string;
  image?: string;
  noindex?: boolean;
  type?: 'website' | 'article';
  publishedTime?: string;
  modifiedTime?: string;
}

const stripSlash = (s: string) => s.replace(/\/$/, '');
const abs = (siteUrl: string, p: string) =>
  p.startsWith('http') ? p : `${stripSlash(siteUrl)}${p.startsWith('/') ? p : `/${p}`}`;

export function fullTitle(page: string, brand: BrandPreset): string {
  return page ? `${page} — ${brand.siteName}` : `${brand.siteName} — ${brand.tagline}`;
}

export function headMeta(cfg: SiteConfig, page: PageSeo) {
  const { brand, siteUrl } = cfg;
  const url = abs(siteUrl, page.path);
  const image = abs(siteUrl, page.image ?? brand.seo.defaultOgImage);
  const title = fullTitle(page.title, brand);
  return { title, url, image, description: page.description };
}

export function jsonLdWebSite(cfg: SiteConfig) {
  const { brand, siteUrl } = cfg;
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: brand.siteName,
    url: stripSlash(siteUrl),
    description: brand.tagline,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${stripSlash(siteUrl)}/search?q={query}`,
      'query-input': 'required name=query'
    }
  };
}

export interface ReviewLdInput {
  slug: string;
  headline: string;
  dek?: string | null;
  rating100?: number | null;
  verdict?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  image?: string | null;
  movie: { title: string; year?: number | null; directors?: string[] | null };
}

export function jsonLdReview(cfg: SiteConfig, r: ReviewLdInput) {
  const { brand, siteUrl } = cfg;
  const url = abs(siteUrl, `/reviews/${r.slug}/`);
  const ratingValue =
    r.rating100 == null ? undefined : Math.round((r.rating100 / 20) * 10) / 10;
  return {
    '@context': 'https://schema.org',
    '@type': 'Review',
    headline: r.headline,
    description: r.dek ?? r.verdict ?? brand.tagline,
    url,
    image: r.image ? abs(siteUrl, r.image) : abs(siteUrl, brand.seo.defaultOgImage),
    author: { '@type': 'Person', name: r.author ?? 'Staff' },
    publisher: {
      '@type': 'Organization',
      name: brand.siteName,
      logo: { '@type': 'ImageObject', url: abs(siteUrl, brand.logo) }
    },
    datePublished: r.publishedAt ?? undefined,
    dateModified: r.updatedAt ?? undefined,
    itemReviewed: {
      '@type': 'Movie',
      name: r.movie.title,
      dateCreated: r.movie.year ? String(r.movie.year) : undefined,
      director: (r.movie.directors ?? []).map((d) => ({ '@type': 'Person', name: d }))
    },
    ...(ratingValue != null
      ? { reviewRating: { '@type': 'Rating', ratingValue, bestRating: 5, worstRating: 0 } }
      : {})
  };
}

export function jsonLdBreadcrumbs(siteUrl: string, crumbs: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: abs(siteUrl, c.path)
    }))
  };
}

/** Sitemap entries — caller feeds review/movie slugs from DB. */
export function sitemapXml(
  cfg: SiteConfig,
  entries: { path: string; lastmod?: string; changefreq?: string; priority?: number }[]
): string {
  const urls = entries
    .map(
      (e) => `  <url><loc>${abs(cfg.siteUrl, e.path)}</loc>` +
        (e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : '') +
        `<changefreq>${e.changefreq ?? 'weekly'}</changefreq>` +
        `<priority>${e.priority ?? 0.7}</priority></url>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

/** RSS 2.0 — reviews feed, brand channel metadata. */
export function rssXml(
  cfg: SiteConfig,
  items: { slug: string; title: string; dek?: string | null; publishedAt?: string | null }[]
): string {
  const { brand, siteUrl } = cfg;
  const els = items
    .map(
      (i) => `    <item><title><![CDATA[${i.title}]]></title>` +
        `<link>${abs(siteUrl, `/reviews/${i.slug}/`)}</link>` +
        `<guid>${abs(siteUrl, `/reviews/${i.slug}/`)}</guid>` +
        (i.dek ? `<description><![CDATA[${i.dek}]]></description>` : '') +
        (i.publishedAt ? `<pubDate>${new Date(i.publishedAt).toUTCString()}</pubDate>` : '') +
        `</item>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>` +
    `<title><![CDATA[${brand.siteName}]]></title>` +
    `<link>${stripSlash(siteUrl)}/</link>` +
    `<description><![CDATA[${brand.tagline}]]></description>\n${els}\n</channel></rss>`;
}

/** PWA manifest — name/icons/themeColor from brand. */
export function manifestJson(brand: BrandPreset) {
  return {
    name: brand.siteName,
    short_name: brand.siteName,
    description: brand.tagline,
    start_url: '/',
    display: 'standalone',
    background_color: brand.seo.themeColor,
    theme_color: brand.seo.themeColor,
    icons: [
      { src: brand.icon, sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
      { src: brand.favicon, sizes: 'any', type: 'image/svg+xml' }
    ]
  };
}
