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
