/**
 * Minimal server-side Markdown renderer (no client JS, no dependencies).
 * Supports: headings (##/###), paragraphs, bold, italic, inline code,
 * links (http/https/relative only), blockquotes, ul/ol lists, hr.
 * All raw HTML is escaped first — safe to render untrusted drafts.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isSafeUrl(url: string): boolean {
  const u = url.trim();
  return (
    u.startsWith("/") ||
    u.startsWith("#") ||
    /^https?:\/\/[^\s"'<>]+$/i.test(u)
  );
}

function renderInline(s: string): string {
  let out = escapeHtml(s);
  // inline code first (protect contents from further transforms)
  const codes: string[] = [];
  out = out.replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(c);
    return `\u0000CODE${codes.length - 1}\u0000`;
  });
  // links
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text: string, href: string) => {
    if (!isSafeUrl(href)) return text;
    return `<a href="${href}">${text}</a>`;
  });
  // bold + italic
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  // restore code
  out = out.replace(/\u0000CODE(\d+)\u0000/g, (_m, i: string) => `<code>${codes[Number(i)] ?? ""}</code>`);
  return out;
}

/** Render Markdown to an HTML string (server only). */
export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let para: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  let quote: string[] = [];

  const flushPara = () => {
    if (para.length > 0) {
      html.push(`<p>${renderInline(para.join(" "))}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const tag = list.type;
      html.push(`<${tag}>${list.items.map((i) => `<li>${renderInline(i)}</li>`).join("")}</${tag}>`);
      list = null;
    }
  };
  const flushQuote = () => {
    if (quote.length > 0) {
      html.push(`<blockquote><p>${quote.map(renderInline).join(" ")}</p></blockquote>`);
      quote = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*$/.test(line)) {
      flushPara();
      flushList();
      flushQuote();
      continue;
    }
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) {
      flushPara(); flushList(); flushQuote();
      html.push(`<h2>${renderInline(h2[1] ?? "")}</h2>`);
      continue;
    }
    const h3 = line.match(/^###\s+(.+)/);
    if (h3) {
      flushPara(); flushList(); flushQuote();
      html.push(`<h3>${renderInline(h3[1] ?? "")}</h3>`);
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flushPara(); flushList(); flushQuote();
      html.push("<hr />");
      continue;
    }
    const q = line.match(/^&gt;|^>/);
    void q;
    if (/^>\s?/.test(line)) {
      flushPara(); flushList();
      quote.push(line.replace(/^>\s?/, ""));
      continue;
    }
    const ul = line.match(/^\s*[-*]\s+(.+)/);
    if (ul) {
      flushPara(); flushQuote();
      if (!list || list.type !== "ul") { flushList(); list = { type: "ul", items: [] }; }
      list.items.push(ul[1] ?? "");
      continue;
    }
    const ol = line.match(/^\s*\d+[.)]\s+(.+)/);
    if (ol) {
      flushPara(); flushQuote();
      if (!list || list.type !== "ol") { flushList(); list = { type: "ol", items: [] }; }
      list.items.push(ol[1] ?? "");
      continue;
    }
    flushList(); flushQuote();
    para.push(line.trim());
  }
  flushPara(); flushList(); flushQuote();
  return html.join("\n");
}

/** Rough reading-time estimate for article meta. */
export function readingMinutes(md: string): number {
  const words = md.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
