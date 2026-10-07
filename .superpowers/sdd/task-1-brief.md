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

