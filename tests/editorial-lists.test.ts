import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Editorial lists (TM-3, QS-3) — hermetic tests.
 *
 * The list definitions are code; the resolved entries are the site's own
 * published reviews. These tests drive a fixture store so they never depend
 * on the production corpus, and they pin the fail-soft rules: a missing,
 * draft or unscored slug is dropped, never replaced or invented.
 */

const savedEnv = { ...process.env };

/** A published store row (src/pages/api/admin/_store.ts Review shape). */
function row(opts: {
  id: string;
  slug: string;
  title: string;
  rating: number;
  publishedAt: string;
  status?: "published" | "draft";
}) {
  return {
    id: opts.id,
    title: opts.title,
    slug: opts.slug,
    excerpt: `${opts.title} summary.`,
    markdown: `Body of ${opts.title}.`,
    status: opts.status ?? "published",
    rating: opts.rating,
    createdAt: opts.publishedAt,
    updatedAt: opts.publishedAt,
    publishedAt: opts.publishedAt,
    movie: {
      title: opts.title,
      year: "2026",
    },
  };
}

function useFixtureStore(rows: unknown[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lists-store-"));
  const file = path.join(dir, "reviews.json");
  fs.writeFileSync(file, JSON.stringify(rows));
  process.env.REVIEWS_DB_PATH = file;
  return file;
}

beforeEach(() => {
  delete process.env.SITE_ID;
  delete process.env.SITE_THEME;
  delete process.env.SITE_URL;
});

afterEach(() => {
  process.env = { ...savedEnv };
});

describe("editorial lists: definitions", () => {
  it("resolves a known slug case-insensitively and rejects unknown slugs", async () => {
    const { getEditorialList } = await import("../src/lib/seo/lists");
    expect(getEditorialList("best-films-2026")?.slug).toBe("best-films-2026");
    expect(getEditorialList("  BEST-FILMS-2026 ")?.slug).toBe("best-films-2026");
    expect(getEditorialList("not-a-list")).toBeNull();
    expect(getEditorialList("")).toBeNull();
  });

  it("keeps the starter copy brand-neutral and each list's slugs unique", async () => {
    const { EDITORIAL_LISTS } = await import("../src/lib/seo/lists");
    for (const list of EDITORIAL_LISTS) {
      const copy = [
        list.title,
        list.seoTitle,
        list.description,
        list.method,
        ...list.intro,
      ].join(" ");
      expect(copy, list.slug).not.toMatch(/extramovies|cinemavilla/i);
      expect(new Set(list.items.map((item) => item.slug)).size).toBe(
        list.items.length,
      );
    }
  });
});

describe("editorial lists: resolution", () => {
  it("sorts by rating and drops missing, draft and unscored slugs", async () => {
    useFixtureStore([
      row({
        id: "a",
        slug: "list-a",
        title: "A",
        rating: 6,
        publishedAt: "2026-01-01T00:00:00.000Z",
      }),
      row({
        id: "b",
        slug: "list-b",
        title: "B",
        rating: 8,
        publishedAt: "2026-02-01T00:00:00.000Z",
      }),
      row({
        id: "c",
        slug: "list-c",
        title: "C",
        rating: 0,
        publishedAt: "2026-03-01T00:00:00.000Z",
      }),
      row({
        id: "d",
        slug: "list-d",
        title: "D",
        rating: 7,
        publishedAt: "2026-04-01T00:00:00.000Z",
        status: "draft",
      }),
    ]);
    const { getEditorialList, resolveListItems } = await import(
      "../src/lib/seo/lists"
    );
    const base = getEditorialList("best-films-2026")!;
    const list = {
      ...base,
      items: [
        { slug: "list-a" },
        { slug: "list-b" },
        { slug: "list-c" },
        { slug: "list-d" },
        { slug: "missing" },
      ],
    };
    const items = resolveListItems(list);
    expect(items.map((item) => item.review.slug)).toEqual(["list-b", "list-a"]);
    expect(items.map((item) => item.review.rating)).toEqual([8, 6]);
  });

  it("uses the supplied review array instead of reading the store again", async () => {
    const { getEditorialList, resolveListItems } = await import(
      "../src/lib/seo/lists"
    );
    const base = getEditorialList("best-films-2026")!;
    const list = { ...base, items: [{ slug: "x" }] };
    const supplied = [
      {
        slug: "x",
        rating: 9,
        updatedAt: "2026-01-01T00:00:00.000Z",
        movieTitle: "X",
      },
    ];
    const items = resolveListItems(list, supplied as never);
    expect(items).toHaveLength(1);
    expect(items[0]!.review.slug).toBe("x");
  });
});

describe("editorial lists: indexing policy", () => {
  it("requires three resolved reviews", async () => {
    const { listIsIndexable } = await import("../src/lib/seo/lists");
    expect(listIsIndexable([])).toBe(false);
    expect(listIsIndexable([{}, {}] as never)).toBe(false);
    expect(listIsIndexable([{}, {}, {}] as never)).toBe(true);
  });
});

describe("editorial lists: JSON-LD", () => {
  it("emits BreadcrumbList + CollectionPage + ItemList with positions", async () => {
    const { getEditorialList, listJsonLd } = await import("../src/lib/seo/lists");
    const list = getEditorialList("best-films-2026")!;
    const items = [
      { review: { slug: "a", movieTitle: "A" } },
      { review: { slug: "b", movieTitle: "B" } },
    ] as never;
    const graph = listJsonLd(list, items, "https://example.test");
    const types = graph.map((node) => node["@type"]);
    expect(types).toContain("BreadcrumbList");
    expect(types).toContain("CollectionPage");
    const collection = graph.find(
      (node) => node["@type"] === "CollectionPage",
    ) as Record<string, never>;
    expect(collection.url).toBe("https://example.test/lists/best-films-2026");
    const mainEntity = collection.mainEntity as Record<string, never>;
    expect(mainEntity["@type"]).toBe("ItemList");
    expect(mainEntity.numberOfItems).toBe(2);
    const first = (mainEntity.itemListElement as Record<string, never>[])[0]!;
    expect(first).toMatchObject({
      "@type": "ListItem",
      position: 1,
      name: "A",
      url: "https://example.test/reviews/a",
    });
  });
});
