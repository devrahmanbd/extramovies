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

