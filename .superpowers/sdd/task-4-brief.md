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

