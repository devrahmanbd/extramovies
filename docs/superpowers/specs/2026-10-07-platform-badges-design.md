# Design — Platform badges ("Reviewed" + "Platform Pick")

Date: 2026-10-07 · Status: approved (user: "write then proceed building it";
store-flow decision: public-contract flag + admin checkbox)
Scope: ROADMAP sub-project A (originally: author badge + Author's Note)

## Problem

The platform owner wants dynamic, per-title recognition: every published
review should mark its title as **Reviewed**, and the owner should be able to
hand-pick standouts as **Platform Pick**. With 30–40 movies/month, a single
unconditional badge would be wallpaper — the pick must be selective and
admin-controlled. An earlier idea (one badge on every card, a free-text
"Author's Note") was rejected: the note dissolved into a movie-page section
rename, and the badge split into two.

## Decisions (from brainstorm)

| Question | Decision |
|---|---|
| Badge labels | `Reviewed` and `Platform Pick` — two separate badges |
| Coexistence | Yes — a title can show both (e.g. Dune 2) |
| `Reviewed` trigger | Automatic when a review is published for the title |
| `Platform Pick` trigger | Manual — admin checkbox, "dynamic" per review |
| Title-card surface | Yes: movie/series/anime title cards ("whatever TMDB has") |
| Review-card surface | `Platform Pick` pill on all journal review cards |
| Movie-page section | Rename "From the journal" → **"From The Platform"** |
| Surfaces rejected | Review byline, watchlist/profile badges |
| Implementation | Approach A: derived `Reviewed` + explicit pick flag |
| Flag store (2026-10-07) | **Public-contract flag + admin checkbox** — no SQL migration |

## Store reality (why no migration)

The repo has two disconnected review stores:

- **Public site** renders only `content.ts` demo rows (`getLatestReviews`,
  static slugs) — review pages, movie pages, rails, rss, sitemap all read this.
- **Admin editor** (`ReviewEditor` → `save-draft`/`publish`) writes
  `data/reviews.json` via `src/pages/api/admin/_store.ts` — **no public page
  reads it today**. `content.ts` carries an explicit `TODO(db-owner)` to swap
  loaders to a real SQL query later; that unification (and the shape gaps in
  `_store.Review` — no `verdict`, no `authorName`) is a separate sub-project.

The earlier draft's SQL column on the drizzle `reviews` table was dropped:
that table has no writers, so a migration there would be dead weight. The
flag's interim homes are the public contract (display now) and
`reviews.json` (admin control, ready for the merge).

## 1. Surfaces

- **Title cards** (`src/components/discover/MovieTile.astro` — poster rails on
  the discovery homepage): badge cluster overlaid on the poster corner.
  - `Reviewed` pill when a published review exists for the tile's `tmdbId`.
  - `Platform Pick` pill additionally when that review is flagged.
  - Both pills may render side by side.
- **Review cards** (`ReviewCard.astro` on `/reviews` + homepage grids;
  related strip): `Platform Pick` pill only, near title/meta, when flagged.
- **Movie page** (`/movies/[tmdbId]`): heading rename only — the
  `d-journal-slot` section `<h2>` becomes **"From The Platform"** (element id
  `d-review-heading` unchanged; no badges there).
- Badges key on review ↔ `tmdbId`, so they work for any TMDB media type as
  soon as reviews exist for it (series table already in schema; sub-project D
  inherits).

## 2. Data model & flow

- **Public contract** (`src/lib/seo/content.ts`): add
  `platformPick?: boolean` to `PublicReview`; set it on the Dune: Part Two
  demo row (tmdbId 693134) so both pills are visibly provable today.
  Extend the file's `TODO(db-owner)` comment: the future SQL must select
  `platform_pick` alongside `featured`.
- **Admin** (`src/components/admin/ReviewEditor.tsx`): a **"Platform Pick"**
  checkbox in the editor form; `src/pages/api/admin/_store.ts` adds
  `platformPick?: boolean` to its `Review` interface so save-draft/publish
  persist it into `data/reviews.json`.
- **Known limitation (documented, accepted):** the checkbox starts affecting
  the public site only when the db-owner merge lands. Until then the demo-row
  flag is the visible control.
- Helper — new `src/lib/badges.ts`:

  ```ts
  export type TitleBadges = { reviewed: boolean; platformPick: boolean };
  export function getTitleBadges(tmdbId: number): TitleBadges
  ```

  - Reads the **public contract** (`getLatestReviews` — the same source the
    movie page and related strip use), so badges never disagree with review
    pages.
  - Best-effort, never throws (guard pattern copied from member-reviews
    usage on the movie page).
- `MovieTile.astro` resolves badges itself — `getTitleBadges(tmdbId)` called
  once in the component frontmatter. Covers every tile context (TMDB rails,
  "Reviewed by us" grid, `movies/index`) with zero prop threading; the lookup
  is a pure in-memory scan of the review list, so per-tile calls are trivial.
- Review cards take the pill straight off `review.platformPick` (the card
  already holds the review; the pill renders in the `glam-meta` line, which
  every card variant has).

## 3. Visuals

- Appended CSS only (`src/styles/global.css` append blocks — repo convention);
  OKLCH tokens only (design.md lock).
- `.platform-pick` — amber pill: `oklch(0.76 0.10 80)` accent, reusing the
  `.editor-badge` pill language (small caps, tight padding, radius).
- `.title-reviewed` — quieter neutral pill: ink-2 text, `--color-rule` border,
  paper-2 background.
- Cluster: `.title-badges` wrapper; on `MovieTile` positioned as an overlay
  on the poster corner (rails are box-less); on review cards rendered inline
  near the title/meta line.
- Both themes: discovery (`MovieTile`) and publication (`ReviewCard`).

## 4. Edge cases

- No published review for title → no pills.
- Review exists, not flagged → `Reviewed` only.
- Flagged → both pills on the title card; `Platform Pick` on review cards.
- Demo reviews (Dune/Batman/Joker in `content.ts`) get `Reviewed` via the
  existing `findReviewForTmdbId` path; only the Dune row carries
  `platformPick: true`.
- Member reviews (sub-project B) render on separate surfaces and never
  receive these pills.
- Helper failure → treated as "no badges"; page never breaks.

## 5. Testing & verification

- Unit: `getTitleBadges` (missing review / review without flag / flagged);
  `platformPick` flows through `ReviewEditor` save payload → `_store`
  round-trip (save-draft + publish).
- `npm run build && npm test` green (baseline: 183 passing).
- Visual QA via chrome-devtools MCP at 1200 / 692 / 400:
  - Rails show `Reviewed` on reviewed titles, nothing on unreviewed.
  - Dune title card shows both pills together.
  - Dune review card shows `Platform Pick` pill; unflagged cards show none.
  - Movie page heading reads "From The Platform".
  - `scrollWidth === viewport` (no horizontal overflow).
- Subagent QA pass (task tool) before calling it done.

## Amendment 2026-10-07 (exclusive tile badge)

Title cards show a single pill: `Platform Pick` when flagged, else `Reviewed`
(`getTileBadge` in `src/lib/badges.ts`). Review cards show the `Platform Pick`
pill only, never `Reviewed` (already the case — verified zero occurrences).

## Out of scope

- ROADMAP B (community reviews), C (social signals), D (series/manga/anime
  content types) — badges merely key on `tmdbId` so D inherits for free.
- db-owner store unification / SQL schema work (note in `content.ts` only).
- Badge on movie page / review byline / watchlist / profile.
- Any non-`tmdbId` titles (manual/custom-only movies without TMDB id).
