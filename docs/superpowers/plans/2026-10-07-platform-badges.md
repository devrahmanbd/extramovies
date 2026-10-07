# Plan: Platform Badges (sub-project A)

Spec: `docs/superpowers/specs/2026-10-07-platform-badges-design.md`
Approved 2026-10-07. Build via subagent-driven development (user-approved).
Repo has **no git** — no commit steps; verification = tests + build + visual QA.

## Goal

- Title cards show a `Reviewed` pill when a published review exists for the
  tile's `tmdbId`; review cards show an amber `Platform Pick` pill when the
  review carries the owner-curated flag.
- Movie-page section heading `From the journal` → `From The Platform`.
- Flag persists through the admin editor (`data/reviews.json`). **No SQL
  migration, no `schema.ts` edit.**

## Global constraints (apply to every task)

- Labels verbatim: `Reviewed`, `Platform Pick`. Heading verbatim: `From The Platform`.
- CSS is **append-only** at end of `src/styles/global.css`; OKLCH only; reuse
  existing tokens (`--color-rule`, `--color-paper-2`, `--color-ink-2`,
  `--space-1`, `--radius-input`, `--font-sans`). Never edit rules above the
  append point; never change existing selectors/ids (`d-review-heading`, `d-journal-slot`).
- Badge logic lives only in `src/lib/badges.ts` — `getTitleBadges(tmdbId)`
  never throws; invalid/unknown ids → `{ reviewed: false, platformPick: false }`.
- Badges key on `tmdbId`. Public flag: `PublicReview.platformPick?: boolean`.
  Admin flag: `_store.Review.platformPick?: boolean`.
- Do not touch `src/lib/db/schema.ts` or `migrations/`.
- Keep files under 500 lines; no new docs; no comments except where shown.

## File map

| File | Change |
|---|---|
| `src/lib/seo/content.ts` | `platformPick?: boolean` on `PublicReview`; Dune row flag; TODO(db-owner) line |
| `src/lib/badges.ts` | **new** — `TitleBadges`, `getTitleBadges` |
| `tests/platform-pick.test.ts` | **new** — helper unit tests + store round-trip |
| `src/pages/api/admin/_store.ts` | `platformPick?: boolean` on `Review` |
| `src/pages/api/admin/save-draft.ts` | explicit `platformPick` pickup (both branches) |
| `src/components/admin/ReviewEditor.tsx` | state + checkbox in Metadata card + payload field |
| `src/components/discover/MovieTile.astro` | self-resolved badge cluster over poster |
| `src/components/public/ReviewCard.astro` | `platform-pick` pill in `glam-meta` (7 identical lines, replaceAll) |
| `src/pages/movies/[tmdbId].astro` | heading rename (L205) |
| `src/styles/global.css` | append-only badge block |
| `ROADMAP.md` | tick sub-project A (task 5) |

`RelatedReviews.astro` and `movies/index.astro` inherit automatically
(they render `ReviewCard` / `MovieTile`). `publish.ts` preserves the flag
(mutates the fetched row, spreads nothing that drops it) — no edit.

---

## Task 1 — Data contract + `getTitleBadges` helper + unit tests (TDD)

**Files:** `src/lib/seo/content.ts`, `src/lib/badges.ts` (new), `tests/platform-pick.test.ts` (new)

### Step 1.1 — Write the failing test first

Create `tests/platform-pick.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getTitleBadges } from "../src/lib/badges";

describe("getTitleBadges", () => {
  it("returns reviewed + platformPick for the flagged Dune demo row", () => {
    expect(getTitleBadges(693134)).toEqual({ reviewed: true, platformPick: true });
  });

  it("returns reviewed-only for reviewed but unflagged titles", () => {
    expect(getTitleBadges(414906)).toEqual({ reviewed: true, platformPick: false });
  });

  it("returns no badges for unknown tmdb ids", () => {
    expect(getTitleBadges(999999999)).toEqual({ reviewed: false, platformPick: false });
  });

  it("never throws on invalid ids", () => {
    for (const id of [0, -1, Number.NaN]) {
      expect(getTitleBadges(id)).toEqual({ reviewed: false, platformPick: false });
    }
  });
});

describe("platformPick store round-trip", () => {
  it("persists and clears platformPick through the admin store", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "platform-pick-"));
    process.env.REVIEWS_DB_PATH = path.join(dir, "reviews.json");
    try {
      const store = await import("../src/pages/api/admin/_store");
      const now = "2026-10-07T00:00:00.000Z";
      await store.upsertReview({
        id: "pp-1",
        title: "Dune: Part Two",
        slug: "dune-part-two-pp",
        excerpt: "excerpt",
        markdown: "body",
        status: "published",
        platformPick: true,
        createdAt: now,
        updatedAt: now,
      });
      expect((await store.getReviewById("pp-1"))?.platformPick).toBe(true);

      const plain = await store.upsertReview({
        id: "pp-2",
        title: "Plain",
        slug: "plain-pp",
        excerpt: "e",
        markdown: "b",
        status: "draft",
        createdAt: now,
        updatedAt: now,
      }).then(() => store.getReviewById("pp-2"));
      expect(plain?.platformPick).toBeUndefined();
    } finally {
      delete process.env.REVIEWS_DB_PATH;
    }
  });
});
```

Run `npm test` — expect failure (`badges.ts` missing, `platformPick` not on
`Review`). The store test compiles only after task 2's interface edit, so if
you run task 1 tests in isolation, expect exactly one failing suite
(`platformPick` excess property / missing module) and proceed; full green
comes at task 2.

### Step 1.2 — Flag the Dune demo row + extend the TODO

In `src/lib/seo/content.ts`:

1. `PublicReview` interface — after `featured?: boolean;` add:

```ts
  /** Owner-curated "Platform Pick" badge (title cards + review cards). */
  platformPick?: boolean;
```

2. Dune row — after `featured: true,` (L160, the only `featured: true`) add:

```ts
    platformPick: true,
```

3. `TODO(db-owner)` block — after the `published reviews:` bullet add:

```ts
 *   - platform pick: add platform_pick BOOLEAN to that SELECT (badges read it via getLatestReviews)
```

### Step 1.3 — Create the helper

Create `src/lib/badges.ts`:

```ts
/**
 * Title-card badges (platform badges, 2026-10-07).
 * Derived from the public review contract — never throws; missing data
 * degrades to "no badges".
 */
import { getLatestReviews } from "./seo/content";

export interface TitleBadges {
  reviewed: boolean;
  platformPick: boolean;
}

const NONE: TitleBadges = { reviewed: false, platformPick: false };

export function getTitleBadges(tmdbId: number): TitleBadges {
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return NONE;
  try {
    const match = getLatestReviews(1000).find((r) => r.tmdbId === tmdbId);
    if (!match) return NONE;
    return { reviewed: true, platformPick: match.platformPick === true };
  } catch {
    return NONE;
  }
}
```

### Verify Task 1

```bash
npx vitest run tests/platform-pick.test.ts   # helper tests green; store test fails until Task 2
npm run build                                 # green (badges.ts is tree-shaken in)
```

---

## Task 2 — Admin persistence: store, save-draft, editor checkbox (TDD)

**Files:** `src/pages/api/admin/_store.ts`, `src/pages/api/admin/save-draft.ts`, `src/components/admin/ReviewEditor.tsx`

### Step 2.1 — `Review` interface

In `src/pages/api/admin/_store.ts`, inside `export interface Review`, after
`region?: string;` (L37) add:

```ts
  /** Owner-curated "Platform Pick" badge shown on public title/review cards. */
  platformPick?: boolean;
```

Run `npx vitest run tests/platform-pick.test.ts` → all 5 tests green.

### Step 2.2 — `save-draft.ts` pickup (both branches)

In `save-draft.ts` update branch — after the `region:` line inside the
`review = { ...existing, ... }` object add:

```ts
      platformPick: body.platformPick === true ? true : undefined,
```

In the new-draft branch — after the `region:` line add the same:

```ts
      platformPick: body.platformPick === true ? true : undefined,
```

Rationale: explicit key after the spread so unchecked (`false`/absent) clears
a previously stored flag; `undefined` drops out of `JSON.stringify` on write.
`publish.ts` needs no change (it mutates the row from `getReviewById`).

### Step 2.3 — Editor checkbox

In `src/components/admin/ReviewEditor.tsx`:

1. State — after the `region` state line (L78) add:

```tsx
  const [platformPick, setPlatformPick] = React.useState(initial?.platformPick ?? false);
```

2. `collectPayload()` — after `region: region.trim(),` add:

```ts
      platformPick: platformPick || undefined,
```

3. UI — in the Metadata card (`aria-label="Metadata"`), after the
   `Slug/Excerpt` `.row` div, before `</section>` add:

```tsx
        <label className="check-row" style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem" }}>
          <input type="checkbox" checked={platformPick} onChange={(e) => setPlatformPick(e.target.checked)} />
          <span>Platform Pick — show badge on title cards</span>
        </label>
```

### Verify Task 2

```bash
npx vitest run tests/platform-pick.test.ts   # 5/5 green
npm run build                                # green (TS picks up new field)
```

Manual (deferred to Task 5): open an admin draft → checkbox toggles →
Save Draft → `data/reviews.json` row contains `"platformPick": true`.

---

## Task 3 — Title-card badges on `MovieTile` + CSS

**Files:** `src/components/discover/MovieTile.astro`, `src/styles/global.css` (append)

### Step 3.1 — Resolve + render in the tile

In `MovieTile.astro` frontmatter — after the `Props` destructure line add:

```ts
import { getTitleBadges } from "../../lib/badges";
const badges = getTitleBadges(tmdbId);
```

(imports go at the top of the frontmatter block, above `interface Props` is
also acceptable — keep the file's existing style: doc comment, interface,
destructure; put the import directly under the `---` opening.)

Template — between the poster/fallback JSX and `<span class="d-tile-text">`
insert:

```jsx
    {badges.reviewed || badges.platformPick ? (
      <span class="title-badges">
        {badges.reviewed ? <span class="title-reviewed">Reviewed</span> : null}
        {badges.platformPick ? <span class="platform-pick">Platform Pick</span> : null}
      </span>
    ) : null}
```

`.d-tile a` is `display: grid` — the badge span is absolutely positioned, so
it leaves flow; no layout impact.

### Step 3.2 — CSS (append block, end of `src/styles/global.css`)

Append exactly:

```css

/* === Platform badges (sub-project A) 2026-10-07 — APPEND-ONLY === */
.d-tile a { position: relative; }

.title-badges {
  position: absolute;
  top: var(--space-1);
  left: var(--space-1);
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  z-index: 1;
  pointer-events: none;
}

.title-reviewed,
.platform-pick {
  font-family: var(--font-sans);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border-radius: var(--radius-input);
  padding: 2px var(--space-1);
  white-space: nowrap;
  line-height: 1.4;
}

.title-reviewed {
  color: var(--color-ink-2);
  background: var(--color-paper-2);
  border: 1px solid var(--color-rule);
}

.platform-pick {
  color: oklch(0.28 0.06 75);
  background: oklch(0.76 0.10 80);
  border: 1px solid oklch(0.65 0.10 80);
}

.glam-meta .platform-pick { margin-right: var(--space-1); }
```

### Verify Task 3

```bash
npm test          # full suite still green
npm run build     # green
```

Visual QA deferred to Task 5 (homepage rails, `movies/index`).

---

## Task 4 — Review-card pills + heading rename

**Files:** `src/components/public/ReviewCard.astro`, `src/pages/movies/[tmdbId].astro`

### Step 4.1 — Pill in every card variant

In `ReviewCard.astro` — the file contains 7 byte-identical lines:

```
      <p class="glam-meta tnum">{review.movieTitle}{meta ? ` — ${meta}` : ""}</p>
```

(L80, L112, L144, L161, L188, L216, L245). One Edit with `replaceAll: true`:

oldString:

```
      <p class="glam-meta tnum">{review.movieTitle}{meta ? ` — ${meta}` : ""}</p>
```

newString:

```
      <p class="glam-meta tnum">{review.platformPick ? <span class="platform-pick">Platform Pick</span> : null}{review.movieTitle}{meta ? ` — ${meta}` : ""}</p>
```

Confirm with `rg -c 'platform-pick' src/components/public/ReviewCard.astro`
→ `7`.

### Step 4.2 — Heading rename

In `src/pages/movies/[tmdbId].astro` L205:

```
<h2 id="d-review-heading">From the journal</h2>
```
→
```
<h2 id="d-review-heading">From The Platform</h2>
```

Keep `id` and the `d-journal-slot` wiring unchanged. `rg -n 'From the journal'
src/` must return no hits after the edit.

### Verify Task 4

```bash
npm test && npm run build   # green
```

---

## Task 5 — Full verification (evidence required)

1. **Unit + build**
   ```bash
   npm test        # baseline 183 + 5 new = 188+ green
   npm run build   # green
   ```

2. **Visual QA (chrome-devtools MCP)** — start server first:
   ```bash
   pkill -f "astro dev"; set -a; source .env; export SITE_THEME=discovery
   npm run dev -- --port 4321 --host 127.0.0.1 > /tmp/astro-dev.log &
   ```
   - `http://127.0.0.1:4321/` — Dune tile(s) show **both** pills; Batman/Joker
     tiles show **Reviewed** only; no badges on unreviewed titles.
   - `http://127.0.0.1:4321/movies/693134` — heading reads **From The
     Platform**; Dune review card shows the amber **Platform Pick** pill.
   - `http://127.0.0.1:4321/reviews` — Dune card pill; unflagged cards clean.
   - Widths 1200 / 692 / 400 (`resize_page` or `emulate "400x900x1"`): pill
     must not overflow — `document.documentElement.scrollWidth ===
     innerWidth` on each page; `take_screenshot` at 400 as proof.
   - `list_console_messages` → no new errors.

3. **Admin round-trip (manual)** — login `editor@example.com` / `preview1234`
   at `/admin`, open a draft, tick **Platform Pick**, Save Draft, confirm
   `"platformPick": true` in `data/reviews.json`; untick + save → field absent.

4. **Subagent QA pass** — dispatch a `general` subagent with this plan +
   spec path, read-only brief: verify each "Verify Task" block, re-run
   `npm test` + `npm run build`, spot-check the CSS append point is at file
   tail, confirm no `schema.ts`/`migrations` diff.

5. **ROADMAP.md** — mark sub-project A (two-badge system) complete.

No evidence → not done. Record test output + screenshots in the final report.
