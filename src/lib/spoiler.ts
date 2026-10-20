/**
 * Spoiler-gate block syntax.
 *
 * A spoiler block collapses the passage it wraps behind a native
 * <details>/<summary> gate, so a reader who has not watched the film does
 * not get the ending for free. One shared module so the public renderer
 * (src/lib/markdown.ts) and the admin live preview
 * (src/components/admin/markdown.ts) read exactly the same syntax and can
 * never drift: both call renderSpoilerBlock() below for the wrapping and
 * for the fail-soft decision.
 *
 * Long form — the summary is the first `## ` heading inside the block, and
 * that heading is not repeated in the body:
 *
 *   ::: spoiler
 *   ## Spoiler warning: the ending of Masaan
 *   Everything below describes the final act.
 *   :::
 *
 * Shorthand form — the summary is written on the fence line:
 *
 *   ::: spoiler The ending of Masaan
 *   Everything below describes the final act.
 *   :::
 *
 * Rules:
 *  - a block holds at most ONE top-level heading (the summary heading) plus
 *    body paragraphs. More than one `## ` heading makes the block malformed:
 *    it then renders as literal markdown with no <details>, so nothing is
 *    ever hidden behind a gate that spans more than one section
 *  - one level only: a bare `:::` closes the block, and a `::: spoiler` line
 *    inside an open block is literal text
 *  - a `:::` inside a fenced code block never closes the block, and a `## `
 *    inside a fenced code block is code, not a heading
 *  - an unclosed fence never swallows the rest of the document: the fence
 *    line degrades to literal text and the following lines keep rendering
 *    as normal markdown
 *  - a bare `:::` with no open block is literal text
 */

/** Fence that opens a spoiler block: `::: spoiler` or `::: spoiler <summary>`. */
const OPEN_RE = /^:::[ \t]*spoilers?\b[ \t]*(.*)$/i;

/** Fence that closes a spoiler block: a bare `:::`. */
const CLOSE_RE = /^:::[ \t]*$/;

/**
 * A top-level heading inside a block: `## ` at the very start of a line.
 * `# `, `### `, an indented heading and a quoted heading are NOT top-level
 * headings here, so they never act as the summary and never make a block
 * malformed.
 */
const TOP_HEADING_RE = /^##[ \t]+(.*)$/;

/** A fenced code block marker (``` or ```lang). */
const CODE_FENCE_RE = /^```/;

/** Summary used when a block carries neither a fence hint nor a heading. */
export const DEFAULT_SPOILER_SUMMARY = "Spoilers";

export interface SpoilerOpen {
  /** Text written after `spoiler` on the fence line (shorthand form). */
  hint: string;
}

/** Match a `::: spoiler` opener. Returns null for every other line. */
export function matchSpoilerOpen(line: string): SpoilerOpen | null {
  const m = OPEN_RE.exec(line.trim());
  if (!m) return null;
  return { hint: (m[1] ?? "").trim() };
}

/** True when the line is a bare `:::` closer. */
export function isSpoilerClose(line: string): boolean {
  return CLOSE_RE.test(line.trim());
}

/** True when the line opens or closes a fenced code block. */
export function isCodeFence(line: string): boolean {
  return CODE_FENCE_RE.test(line.trimStart());
}

/**
 * Find the closing fence of a spoiler block.
 *
 * A `:::` inside a fenced code block never closes the block (it is code,
 * not a fence), so the scan tracks code fences while it walks the lines.
 */
export function findSpoilerClose(
  lines: string[],
  from: number,
): { index: number; inCode: boolean } {
  let inCode = false;
  for (let i = from; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    if (isCodeFence(raw)) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    if (isSpoilerClose(raw)) return { index: i, inCode };
  }
  return { index: -1, inCode };
}

export interface TopHeading {
  /** Index of the heading line inside the body. */
  index: number;
  /** The heading text, without the `## ` markers. */
  text: string;
}

/**
 * The top-level (`## `) headings of a block body, skipping lines inside
 * fenced code blocks: a `## ` in a code fence is code, not a heading, so it
 * never counts (and never makes the block malformed).
 */
export function topHeadings(body: string[]): TopHeading[] {
  const found: TopHeading[] = [];
  let inCode = false;
  for (let i = 0; i < body.length; i++) {
    const line = body[i] ?? "";
    if (isCodeFence(line)) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const h = TOP_HEADING_RE.exec(line.trimEnd());
    if (h) found.push({ index: i, text: (h[1] ?? "").trim() });
  }
  return found;
}

/** How many top-level (`## `) headings a block body carries (fences skipped). */
export function countTopHeadings(body: string[]): number {
  return topHeadings(body).length;
}

/**
 * Resolve the summary and the body of a spoiler block.
 *  - the first `## ` heading inside the block is the summary, and it is
 *    removed from the body (it is not repeated inside the gate)
 *  - otherwise the shorthand text after `spoiler` on the fence line
 *  - otherwise DEFAULT_SPOILER_SUMMARY
 */
export function resolveSpoilerSummary(
  hint: string,
  body: string[],
): { summary: string; body: string[] } {
  const first = topHeadings(body)[0];
  if (first) {
    return {
      summary: first.text || DEFAULT_SPOILER_SUMMARY,
      body: body.slice(0, first.index).concat(body.slice(first.index + 1)),
    };
  }
  const text = hint.trim();
  if (text) return { summary: text, body };
  return { summary: DEFAULT_SPOILER_SUMMARY, body };
}

export interface SpoilerBlock {
  /** Rendered HTML for the block: a <details> gate, or literal markdown. */
  html: string;
  /** Index of the last line the block consumed; the caller resumes at nextIndex + 1. */
  nextIndex: number;
  /** Code-fence state after the consumed lines, so the caller stays in sync. */
  inCode: boolean;
}

/**
 * Render the spoiler block that starts at `startIndex`.
 *
 * Returns null when the line is not a spoiler opener (the caller then keeps
 * its normal rendering). Otherwise this function owns the whole block: it
 * finds the closing fence, judges the block, and returns the HTML.
 *
 *  - well formed → a <details> gate whose summary is the block's first
 *    `## ` heading, or the fence hint when the block has no heading
 *  - malformed (more than one `## ` heading before the closer) → literal
 *    markdown, no <details>: a gate must never span more than one section,
 *    and nothing may be hidden by a malformed block
 *  - unclosed → the fence line as literal text; the caller keeps rendering
 *    the rest of the document as normal markdown
 *
 * `inline` renders one line of text, `renderBody` renders the block body as
 * markdown (never opening a nested gate).
 */
export function renderSpoilerBlock(
  lines: string[],
  startIndex: number,
  inline: (text: string) => string,
  renderBody: (body: string[]) => string,
): SpoilerBlock | null {
  const openerLine = lines[startIndex] ?? "";
  const opener = matchSpoilerOpen(openerLine);
  if (!opener) return null;

  const close = findSpoilerClose(lines, startIndex + 1);
  if (close.index === -1) {
    // FAIL SOFT: an unclosed fence never swallows the document.
    return {
      html: `<p>${inline(openerLine.trim())}</p>`,
      nextIndex: startIndex,
      inCode: false,
    };
  }

  const body = lines.slice(startIndex + 1, close.index);

  // A block holds at most one top-level heading (the summary) plus body
  // paragraphs. More than one means the writer used the fence across two
  // sections: the gate would then hide a section the reader never asked to
  // hide. A heading inside a code fence is code, so it does not count.
  if (countTopHeadings(body) > 1) {
    // MALFORMED: render the block as literal markdown, no <details>.
    return {
      html: [
        `<p>${inline(openerLine.trim())}</p>`,
        renderBody(body),
        `<p>${inline((lines[close.index] ?? "").trim())}</p>`,
      ].join("\n"),
      nextIndex: close.index,
      inCode: close.inCode,
    };
  }

  const { summary, body: gated } = resolveSpoilerSummary(opener.hint, body);
  return {
    html: `<details><summary>${inline(summary)}</summary>\n${renderBody(gated)}\n</details>`,
    nextIndex: close.index,
    inCode: close.inCode,
  };
}
