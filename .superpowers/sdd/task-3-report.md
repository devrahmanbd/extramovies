# Task 3 Report — Title-card badges on MovieTile + CSS

**Status: DONE**

## What I implemented

### Step 3.1 — `src/components/discover/MovieTile.astro`
- Added `import { getTitleBadges } from "../../lib/badges";` directly under the `---` opening (brief's permitted placement).
- Added `const badges = getTitleBadges(tmdbId);` immediately after the `Props` destructure line.
- Inserted the badge JSX between the poster/fallback branch and `<span class="d-tile-text">`, verbatim from the brief:
  - Outer `<span class="title-badges">` only renders when `badges.reviewed || badges.platformPick`.
  - `Reviewed` pill only when `badges.reviewed`; `Platform Pick` pill only when `badges.platformPick`.
  - Empty (no span at all) otherwise — guard exactly as specified.

Because the tile resolves badges itself, all three surfaces are covered with zero prop threading: TMDB rails, the "Reviewed by us" grid, and `movies/index`.

### Step 3.2 — `src/styles/global.css`
- Appended the brief's CSS block verbatim at end-of-file using shell append (`>>`), so **no existing rule was touched**.
- Block includes: `.d-tile a { position: relative; }`, `.title-badges` (absolute, top/left `var(--space-1)`, flex, `z-index: 1`, `pointer-events: none`), shared pill type rules, neutral `.title-reviewed` (`--color-ink-2` / `--color-paper-2` / `--color-rule`), amber `.platform-pick` (`oklch(0.28 0.06 75)` text, `oklch(0.76 0.10 80)` bg, `oklch(0.65 0.10 80)` border), and `.glam-meta .platform-pick` margin.
- OKLCH-only colors confirmed for the new amber pill; neutral pill uses existing design tokens.

## Verification

| Check | Result |
|---|---|
| `npm test` (full suite) | ✅ 20 files, **188/188 passed** (baseline preserved; no tests changed) |
| `npm run build` | ✅ Complete, no errors/warnings |
| `npx vitest run tests/platform-pick.test.ts` | ✅ 5/5 passed |

(Both run with `set -a; source .env; set +a` as instructed.)

## Files changed
1. `src/components/discover/MovieTile.astro` — 57 → 65 lines
2. `src/styles/global.css` — 5410 → 5451 lines (append-only, +41)

No other files, no tests, no docs, no git commands.

## Self-review findings
- ✅ Every brief step executed in order; JSX and CSS match the brief verbatim.
- ✅ Guard correct: badge markup absent entirely when both flags are false.
- ✅ Append-only: existing CSS untouched (verified junction at line ~5410 — clean single blank line before the new comment block).
- ✅ Exact colors (OKLCH amber trio + token-based neutral) and exact labels `Reviewed` / `Platform Pick`.
- ✅ `.d-tile a` is `display: grid` — badges are `position: absolute` out of flow; no `> img` selector changes made.
- ✅ `MovieTile.astro` well under 500 lines.

## Concerns
- Minor/pre-existing: `global.css` is 5451 lines (far over the general 500-line file guideline). This predates Task 3 (was 5410) and the brief explicitly mandates appending to this file, so I followed the brief. Flagging only for awareness — splitting it is out of scope for this task.
- Visual QA (badge placement on homepage rails and `movies/index`) deferred to Task 5 as instructed.
