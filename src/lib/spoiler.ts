/**
 * Spoiler-gate block syntax.
 *
 * A spoiler block collapses the passage it wraps behind a native
 * <details>/<summary> gate, so a reader who has not watched the film does
 * not get the ending for free. One shared module so the public renderer
 * (src/lib/markdown.ts) and the admin live preview
 * (src/components/admin/markdown.ts) read exactly the same syntax.
 *
 * Long form — the summary is the first heading inside the block, and that
 * heading is not repeated in the body:
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
 *  - one level only: a bare `:::` closes the block, and a `::: spoiler` line
 *    inside an open block is literal text
 *  - an unclosed fence never swallows the rest of the document: the fence
 *    line degrades to literal text and the following lines keep rendering
 *    as normal markdown
 *  - a bare `:::` with no open block is literal text
 */

/** Fence that opens a spoiler block: `::: spoiler` or `::: spoiler <summary>`. */
const OPEN_RE = /^:::[ \t]*spoilers?\b[ \t]*(.*)$/i;

/** Fence that closes a spoiler block: a bare `:::`. */
const CLOSE_RE = /^:::[ \t]*$/;

/** ATX heading — the long form's summary source. */
const HEADING_RE = /^#{1,6}[ \t]+(.*)$/;

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

/**
 * Index of the closing fence at or after `from`, or -1 when the block is
 * never closed (the caller then degrades to literal text, fail soft).
 */
export function findSpoilerClose(lines: string[], from: number): number {
  for (let i = from; i < lines.length; i++) {
    if (isSpoilerClose(lines[i] ?? "")) return i;
  }
  return -1;
}

/**
 * Resolve the summary and the body of a spoiler block.
 *  - shorthand (`::: spoiler <text>`): the fence text is the summary
 *  - long form: the first heading inside becomes the summary and is removed
 *    from the body (it is not repeated inside the gate)
 *  - neither: DEFAULT_SPOILER_SUMMARY
 */
export function resolveSpoilerSummary(
  hint: string,
  body: string[],
): { summary: string; body: string[] } {
  const text = hint.trim();
  if (text) return { summary: text, body };
  for (let i = 0; i < body.length; i++) {
    const h = HEADING_RE.exec((body[i] ?? "").trim());
    if (h) {
      const summary = (h[1] ?? "").trim();
      return {
        summary: summary || DEFAULT_SPOILER_SUMMARY,
        body: body.slice(0, i).concat(body.slice(i + 1)),
      };
    }
  }
  return { summary: DEFAULT_SPOILER_SUMMARY, body };
}
