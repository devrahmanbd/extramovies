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

