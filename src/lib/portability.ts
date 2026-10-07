/**
 * portability.ts — framework-agnostic import/export + portable helpers.
 *
 * No framework lock: pure TypeScript, no Astro/Next/Drizzle imports.
 * Markdown is the portable artifact. DB JSON is an implementation detail.
 *
 * Frontmatter contract (export/import):
 *   title, slug, rating, movie_id, imdb_id, tmdb_id,
 *   published_at, seo_title, seo_description
 * + body (Markdown).
 */

export interface PortableReview {
  title: string;
  slug: string;
  rating?: number;
  movie_id?: string | number | null;
  imdb_id?: string | null;
  tmdb_id?: number | null;
  published_at?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  body: string;
  // passthrough extras (excerpt, director, year...) preserved but optional
  [k: string]: unknown;
}

const FRONTMATTER_FIELDS = [
  'title',
  'slug',
  'rating',
  'movie_id',
  'imdb_id',
  'tmdb_id',
  'published_at',
  'seo_title',
  'seo_description',
] as const;

// ---------------------------------------------------------------- slug

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'review'
  );
}

/** Slug from title + optional disambiguator (year / movie id). */
export function buildSlug(title: string, extra?: string | number | null): string {
  const base = slugify(title);
  if (extra === undefined || extra === null || extra === '') return base;
  const tail = slugify(String(extra));
  if (!tail) return base;
  return `${base}-${tail}`.slice(0, 80);
}

// ------------------------------------------------------- frontmatter io

function escapeYamlValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  const s = String(v);
  // Quote when it contains characters that break plain YAML scalars.
  if (/[:#\[\]{}&*!|>'"%@`,\n]/.test(s) || /^\s|\s$/.test(s) || s === '') {
    return JSON.stringify(s);
  }
  return s;
}

function parseYamlValue(raw: string): unknown {
  const t = raw.trim();
  if (t === '' || t === '~' || t.toLowerCase() === 'null') return null;
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    try {
      return JSON.parse(t.startsWith("'") ? `"${t.slice(1, -1).replace(/"/g, '\\"')}"` : t);
    } catch {
      return t.slice(1, -1);
    }
  }
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (t === 'true') return true;
  if (t === 'false') return false;
  return t;
}

/** Parse `---\nfrontmatter\n---\nbody`. Never throws on malformed input. */
export function parseFrontmatter(md: string): { data: Record<string, unknown>; body: string } {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: md };
  const data: Record<string, unknown> = {};
  for (const line of (m[1] ?? '').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue; // skip malformed lines safely
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key) data[key] = parseYamlValue(val);
  }
  return { data, body: m[2] ?? '' };
}

export function stringifyFrontmatter(data: Record<string, unknown>, body: string): string {
  const lines = ['---'];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    lines.push(`${k}: ${escapeYamlValue(v)}`);
  }
  lines.push('---', '');
  return lines.join('\n') + (body.startsWith('\n') ? body.slice(1) : body) + (body.endsWith('\n') ? '' : '\n');
}

// ------------------------------------------------- review <-> markdown

export function reviewToMarkdown(r: PortableReview): string {
  const data: Record<string, unknown> = {};
  for (const f of FRONTMATTER_FIELDS) {
    const v = (r as Record<string, unknown>)[f];
    // Always emit the contract keys (empty when unknown) so imports are stable.
    data[f] = v ?? (f === 'rating' || f === 'tmdb_id' ? v ?? null : v ?? null);
  }
  // Preserve a small set of known extras without breaking the contract.
  for (const k of ['excerpt', 'director', 'year', 'genres', 'status']) {
    if (r[k] !== undefined) data[k] = r[k];
  }
  return stringifyFrontmatter(data, r.body ?? '');
}

export interface ImportResult {
  review: PortableReview;
  warnings: string[];
}

/** Parse exported Markdown back into a review. Safe on malformed input. */
export function markdownToReview(md: string, fallbackSlug?: string): ImportResult {
  const warnings: string[] = [];
  const { data, body } = parseFrontmatter(md);
  if (Object.keys(data).length === 0 && !md.startsWith('---')) {
    warnings.push('no frontmatter found; body-only import');
  }
  const title = typeof data.title === 'string' && data.title.trim()
    ? data.title.trim()
    : 'Untitled';
  if (!data.title) warnings.push('missing title; defaulted to Untitled');
  const rawSlug = typeof data.slug === 'string' && data.slug.trim()
    ? data.slug.trim()
    : fallbackSlug ?? title;
  const slug = slugify(rawSlug);
  const rating = typeof data.rating === 'number' && Number.isFinite(data.rating)
    ? Math.min(10, Math.max(0, data.rating))
    : undefined;
  if (data.rating !== undefined && data.rating !== null && rating === undefined) {
    warnings.push('invalid rating ignored');
  }
  const review: PortableReview = {
    title,
    slug,
    rating,
    movie_id: (data.movie_id as string | number | null) ?? null,
    imdb_id: (data.imdb_id as string | null) ?? null,
    tmdb_id: typeof data.tmdb_id === 'number' ? data.tmdb_id : null,
    published_at: (data.published_at as string | null) ?? null,
    seo_title: (data.seo_title as string | null) ?? null,
    seo_description: (data.seo_description as string | null) ?? null,
    body: body.trim() + '\n',
  };
  // carry extras through
  for (const [k, v] of Object.entries(data)) {
    if (!(k in review)) review[k] = v;
  }
  return { review, warnings };
}

export function validatePortableReview(r: PortableReview): string[] {
  const errors: string[] = [];
  if (!r.title?.trim()) errors.push('title required');
  if (!r.slug?.trim()) errors.push('slug required');
  if (r.rating !== undefined && (typeof r.rating !== 'number' || r.rating < 0 || r.rating > 10)) {
    errors.push('rating must be 0..10');
  }
  if (!r.body?.trim()) errors.push('body required');
  return errors;
}

// ------------------------------------------------------- markdown render

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Minimal Markdown -> HTML. Supports headings, bold/italic/inline-code,
 * links, images, blockquote, ul/ol, hr, fenced code, paragraphs.
 * All raw HTML in source is escaped (safe by default, no framework lock).
 */
export function renderMarkdownSafe(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let listTag: string | null = null;

  const inline = (s: string): string => {
    let e = escapeHtml(s);
    e = e.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '<img alt="$1" src="$2" loading="lazy">');
    e = e.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '<a href="$2" rel="noopener">$1</a>');
    e = e.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    e = e.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    e = e.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    return e;
  };

  const closeList = () => {
    if (listTag) {
      out.push(`</${listTag}>`);
      listTag = null;
    }
  };

  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      if (inCode) {
        out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }
    const t = line.trim();
    if (!t) {
      closeList();
      continue;
    }
    if (/^---+$/.test(t) || /^\*\*\*+$/.test(t)) {
      closeList();
      out.push('<hr>');
      continue;
    }
    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      const level = h[1]?.length ?? 1;
      out.push(`<h${level}>${inline(h[2] ?? '')}</h${level}>`);
      continue;
    }
    const bq = t.match(/^&gt;|^>/);
    if (/^>\s?/.test(t)) {
      closeList();
      out.push(`<blockquote><p>${inline(t.replace(/^>\s?/, ''))}</p></blockquote>`);
      void bq;
      continue;
    }
    const ul = t.match(/^[-*]\s+(.*)$/);
    if (ul) {
      if (listTag !== 'ul') {
        closeList();
        out.push('<ul>');
        listTag = 'ul';
      }
      out.push(`<li>${inline(ul[1] ?? '')}</li>`);
      continue;
    }
    const ol = t.match(/^\d+[.)]\s+(.*)$/);
    if (ol) {
      if (listTag !== 'ol') {
        closeList();
        out.push('<ol>');
        listTag = 'ol';
      }
      out.push(`<li>${inline(ol[1] ?? '')}</li>`);
      continue;
    }
    closeList();
    out.push(`<p>${inline(t)}</p>`);
  }
  closeList();
  if (inCode) out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
  return out.join('\n');
}

// ------------------------------------------------------------------- SEO

export interface SeoMeta {
  title: string;
  description: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  ogType: string;
  twitterCard: string;
}

export function buildSeoMeta(input: {
  title: string;
  slug: string;
  siteUrl: string;
  siteName: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  excerpt?: string | null;
}): SeoMeta {
  const base = (input.siteUrl || '').replace(/\/$/, '');
  const canonical = `${base}/${input.slug.replace(/^\//, '')}`;
  const title = (input.seoTitle?.trim() || `${input.title} — ${input.siteName}`).slice(0, 70);
  const description = (input.seoDescription?.trim() || input.excerpt?.trim() || `${input.title} review.`)
    .slice(0, 155);
  return {
    title,
    description,
    canonical,
    ogTitle: title,
    ogDescription: description,
    ogType: 'article',
    twitterCard: 'summary_large_image',
  };
}

/** Schema.org JSON-LD: Movie + Review pair. Pure data, no DOM. */
export function buildJsonLd(input: {
  title: string;
  slug: string;
  siteUrl: string;
  rating?: number | null;
  publishedAt?: string | null;
  director?: string | null;
  year?: number | string | null;
  genres?: string[] | null;
  excerpt?: string | null;
}): Record<string, unknown>[] {
  const base = (input.siteUrl || '').replace(/\/$/, '');
  const url = `${base}/${input.slug.replace(/^\//, '')}`;
  const movie: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Movie',
    name: input.title,
    url,
  };
  if (input.director) movie.director = { '@type': 'Person', name: input.director };
  if (input.year) movie.datePublished = String(input.year);
  if (input.genres?.length) movie.genre = input.genres;
  const review: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Review',
    itemReviewed: { '@type': 'Movie', name: input.title, url },
    author: { '@type': 'Person', name: 'Editor' },
    reviewBody: input.excerpt ?? '',
    url,
  };
  if (input.publishedAt) review.datePublished = input.publishedAt;
  if (typeof input.rating === 'number') {
    review.reviewRating = { '@type': 'Rating', ratingValue: input.rating, bestRating: 10, worstRating: 0 };
  }
  return [movie, review];
}

export function buildSitemapXml(
  entries: Array<{ slug: string; updatedAt?: string | null }>,
  siteUrl: string,
): string {
  const base = (siteUrl || '').replace(/\/$/, '');
  const urls = entries
    .map((e) => {
      const loc = `${base}/${e.slug.replace(/^\//, '')}`;
      const lastmod = e.updatedAt ? `\n    <lastmod>${escapeHtml(e.updatedAt)}</lastmod>` : '';
      return `  <url>\n    <loc>${escapeHtml(loc)}</loc>${lastmod}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function buildRssXml(
  entries: Array<{
    title: string;
    slug: string;
    excerpt?: string | null;
    publishedAt?: string | null;
    updatedAt?: string | null;
  }>,
  opts: { siteUrl: string; siteName: string },
): string {
  const base = (opts.siteUrl || '').replace(/\/$/, '');
  const items = entries
    .map((e) => {
      const link = `${base}/${e.slug.replace(/^\//, '')}`;
      const pub = e.publishedAt ? new Date(e.publishedAt).toUTCString() : new Date().toUTCString();
      const desc = e.excerpt ?? '';
      return [
        '    <item>',
        `      <title>${escapeHtml(e.title)}</title>`,
        `      <link>${escapeHtml(link)}</link>`,
        `      <guid>${escapeHtml(link)}</guid>`,
        `      <pubDate>${escapeHtml(pub)}</pubDate>`,
        `      <description>${escapeHtml(desc)}</description>`,
        '    </item>',
      ].join('\n');
    })
    .join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    `    <title>${escapeHtml(opts.siteName)}</title>`,
    `    <link>${escapeHtml(base)}</link>`,
    `    <description>${escapeHtml(opts.siteName)} — movie reviews</description>`,
    items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}

// ------------------------------------------------------------------ search

export function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length > 1);
}

/** Tiny FTS: AND-match with prefix support, title weighted 3x. */
export function searchReviews<T extends { title: string; slug: string; body?: string; excerpt?: string }>(
  docs: T[],
  query: string,
  limit = 20,
): T[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const scored = docs
    .map((d) => {
      const titleT = new Set(tokenize(d.title));
      const textT = new Set([...tokenize(d.excerpt ?? ''), ...tokenize(d.body ?? '')]);
      let score = 0;
      for (const t of tokens) {
        const inTitle = [...titleT].some((w) => w === t || w.startsWith(t));
        const inText = [...textT].some((w) => w === t || w.startsWith(t));
        if (!inTitle && !inText) return { doc: d, score: -1 };
        if (inTitle) score += 3;
        if (inText) score += 1;
      }
      return { doc: d, score };
    })
    .filter((s) => s.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.doc);
  return scored;
}

// --------------------------------------------------------------- redirects

/** Resolve a slug through a redirects map. Returns canonical slug or null. */
export function resolveRedirect(
  slug: string,
  lookup: (slug: string) => { slug: string } | null | undefined,
): { slug: string; redirected: boolean } | null {
  const s = slug.trim().toLowerCase();
  if (!s) return null;
  const hit = lookup(s);
  if (!hit) return null;
  return { slug: hit.slug, redirected: hit.slug.toLowerCase() !== s };
}

// --------------------------------------------------------------- migration

export interface MigrationResult {
  review: PortableReview;
  migrated: boolean;
  notes: string[];
}

/**
 * Migrate legacy shapes (v0: {headline, permalink, text}) to the
 * portable contract. Idempotent: already-portable input passes through.
 */
export function migrateLegacyReview(input: Record<string, unknown>): MigrationResult {
  const notes: string[] = [];
  const get = (k: string) => input[k];
  const title = (get('title') as string) ?? (get('headline') as string) ?? 'Untitled';
  if (get('headline') && !get('title')) notes.push('headline -> title');
  const slugRaw = (get('slug') as string) ?? (get('permalink') as string) ?? title;
  if (get('permalink') && !get('slug')) notes.push('permalink -> slug');
  const body = (get('body') as string) ?? (get('text') as string) ?? (get('markdown') as string) ?? '';
  if (get('text') && !get('body')) notes.push('text -> body');
  const review: PortableReview = {
    title: String(title),
    slug: slugify(String(slugRaw)),
    rating: typeof get('rating') === 'number' ? (get('rating') as number) : undefined,
    movie_id: (get('movie_id') as string | null) ?? null,
    imdb_id: (get('imdb_id') as string | null) ?? null,
    tmdb_id: (typeof get('tmdb_id') === 'number' ? get('tmdb_id') : null) as number | null,
    published_at: (get('published_at') as string | null) ?? (get('publishedAt') as string | null) ?? null,
    seo_title: (get('seo_title') as string | null) ?? null,
    seo_description: (get('seo_description') as string | null) ?? null,
    body: String(body),
  };
  const migrated = notes.length > 0;
  return { review, migrated, notes };
}

// ------------------------------------------------------------- db snapshot

/** Serialize a reviews array to a stable JSON snapshot (backup format). */
export function serializeDb(reviews: unknown[]): string {
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), reviews }, null, 2) + '\n';
}

/** Parse a backup snapshot. Never throws — returns error string on failure. */
export function deserializeDb(raw: string): { reviews: Record<string, unknown>[]; error?: string } {
  try {
    const parsed = JSON.parse(raw) as { reviews?: unknown };
    if (!parsed || !Array.isArray(parsed.reviews)) {
      return { reviews: [], error: 'snapshot missing reviews[]' };
    }
    return { reviews: parsed.reviews as Record<string, unknown>[] };
  } catch (e) {
    return { reviews: [], error: e instanceof Error ? e.message : 'invalid JSON' };
  }
}
