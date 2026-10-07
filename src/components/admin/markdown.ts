/** Minimal dependency-free Markdown renderer for the admin editor.
 * Supports: headings, bold, italic, links, images, lists, blockquotes, hr.
 * HTML is escaped first, so raw HTML in the draft never executes.
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inline(md: string): string {
  let s = escapeHtml(md);
  // images ![alt](src)
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '<img alt="$1" src="$2" loading="lazy" />');
  // links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '<a href="$2" rel="noopener">$1</a>');
  // bold **text** and __text__
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/__([^_]+)__/g, "<strong>$1</strong>");
  // italic *text* and _text_ (avoid mangling bold output)
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*/g, "$1<em>$2</em>").replace(/(^|[^_\w])_([^_\n]+)_/g, "$1<em>$2</em>");
  return s;
}

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let listOpen: "ul" | "ol" | null = null;
  let quote: string[] = [];

  const closeList = () => {
    if (listOpen) {
      out.push(listOpen === "ul" ? "</ul>" : "</ol>");
      listOpen = null;
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      out.push(`<blockquote>${quote.map(inline).join("<br />")}</blockquote>`);
      quote = [];
    }
  };

  for (const line of lines) {
    const t = line.trim();
    if (/^---+$/.test(t) || /^\*\*\*+$/.test(t)) {
      closeList(); flushQuote();
      out.push("<hr />");
      continue;
    }
    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList(); flushQuote();
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }
    if (/^&gt;/.test(inline(t)) || /^>/.test(t)) {
      closeList();
      quote.push(t.replace(/^>\s?/, ""));
      continue;
    }
    const ul = t.match(/^[-*+]\s+(.*)$/);
    if (ul) {
      flushQuote();
      if (listOpen !== "ul") { closeList(); out.push("<ul>"); listOpen = "ul"; }
      out.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }
    const ol = t.match(/^(\d+)[.)]\s+(.*)$/);
    if (ol) {
      flushQuote();
      if (listOpen !== "ol") { closeList(); out.push("<ol>"); listOpen = "ol"; }
      out.push(`<li>${inline(ol[2])}</li>`);
      continue;
    }
    if (t === "") { closeList(); flushQuote(); continue; }
    closeList(); flushQuote();
    out.push(`<p>${inline(t)}</p>`);
  }
  closeList(); flushQuote();
  return out.join("\n");
}
