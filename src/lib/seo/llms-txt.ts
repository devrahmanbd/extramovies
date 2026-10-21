/**
 * llms.txt renderer — the llms.txt convention (https://llms.txt/).
 *
 * Plain text, markdown-ish, no HTML: who the site is (one line), the
 * canonical content types with their URL patterns, the newest reviews with
 * their canonical URLs and one-line verdicts, the generation date, and the
 * sitemap pointer.
 *
 * Pure function: the caller passes the reviews, the origin, and the
 * generation date, so a fixed store always renders the same bytes. The
 * endpoint (src/pages/llms.txt.ts) reads the published reviews at request
 * time, which is why the newest list is never stale.
 */

export interface LlmsReviewEntry {
  /** Published review headline. */
  title: string;
  /** Canonical review URL, absolute. */
  url: string;
  /** One-line verdict. */
  verdict: string;
}

export interface LlmsTxtInput {
  /** Publication name (brand-aware, never hardcoded). */
  siteName: string;
  /** One line describing the site. */
  summary?: string;
  /** Canonical origin, no trailing slash. */
  origin: string;
  /** Published reviews, newest first. */
  reviews: LlmsReviewEntry[];
  /** Generation date, YYYY-MM-DD. */
  generatedAt: string;
  /** How many reviews to list. */
  limit?: number;
}

/** Reviews listed in the file. */
export const LLMS_REVIEW_LIMIT = 20;

/** Collapse whitespace so a title or verdict never breaks the file's shape. */
function oneLine(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/**
 * The site's own one-liner for llms.txt. Written here (not in a page) so
 * the file has one source of truth. No em-dashes, no marketing language.
 */
export function llmsSummary(siteName: string): string {
  const name = oneLine(siteName) || "This site";
  return (
    `${name} is an independent film-review magazine. Every published review carries ` +
    "our own rating, a one-line verdict, the runtime, the credits, and where to watch, " +
    "with the date the availability was checked."
  );
}

/**
 * Render llms.txt. Deterministic: the same input always produces the same
 * bytes, line for line.
 */
export function renderLlmsTxt(input: LlmsTxtInput): string {
  const origin = oneLine(input.origin).replace(/\/+$/, "");
  const lines: string[] = [];

  lines.push(`# ${oneLine(input.siteName) || "Film review magazine"}`);
  lines.push("");
  const summary = oneLine(input.summary);
  if (summary) {
    lines.push(`> ${summary}`);
    lines.push("");
  }
  lines.push(`Generated ${oneLine(input.generatedAt)}. Sitemap: ${origin}/sitemap.xml`);
  lines.push("");
  lines.push("## Content types");
  lines.push("");
  lines.push(
    `- [Review](${origin}/reviews/<slug>): one long-form review with our rating, our verdict, the runtime, the credits, and where to watch.`,
  );
  lines.push(
    `- [Title hub](${origin}/movies/<tmdbId>): streaming options, full credits, and member reviews for one film.`,
  );
  lines.push(`- [Review archive](${origin}/reviews): every published review, newest first.`);
  lines.push(
    `- [About](${origin}/about): what this magazine is, how the ratings work, and the editorial standards it runs on.`,
  );
  lines.push(`- [Contact](${origin}/contact): how to reach the editor.`);
  lines.push("");
  lines.push("## Latest reviews");
  lines.push("");

  const limit = input.limit ?? LLMS_REVIEW_LIMIT;
  for (const review of input.reviews.slice(0, limit)) {
    const title = oneLine(review.title);
    const url = oneLine(review.url);
    if (!title || !url) continue;
    const verdict = oneLine(review.verdict);
    lines.push(`- [${title}](${url})${verdict ? `: ${verdict}` : ""}`);
  }

  return `${lines.join("\n")}\n`;
}
