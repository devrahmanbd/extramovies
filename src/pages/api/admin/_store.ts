import { promises as fs } from "node:fs";
import path from "node:path";
import type { CustomWatch } from "../../../lib/watch-links";

export type ReviewStatus = "draft" | "published";

export interface ReviewMovie {
  imdbId?: string;
  movieId?: string;
  title: string;
  year?: string;
  genres?: string[];
  runtime?: string;
  /** Film release date (ISO, YYYY-MM-DD) when the editor records one. */
  releaseDate?: string;
  director?: string;
  cast?: string[];
  overview?: string;
  poster?: string;
  streaming?: string[];
}

export interface ReviewSeo {
  seoTitle?: string;
  metaDesc?: string;
  primaryTopic?: string;
  searchIntent?: string;
}

export interface Review {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  markdown: string;
  status: ReviewStatus;
  movie?: ReviewMovie;
  rating?: number;
  region?: string;
  /**
   * TMDB id carried on the row itself (seed imports put it here: the
   * frontmatter key is `tmdb_id`, not the movie record's `movie_id`).
   * Used as the fallback when the linked movie record has no id.
   */
  tmdbId?: number | string | null;
  /** Owner-curated "Platform Pick" badge shown on public title/review cards. */
  platformPick?: boolean;
  /**
   * Owner-curated "featured review" flag (the homepage cover slot).
   * A seed may set it through its `featured` frontmatter; the import
   * writes it and the public loader prefers a flagged store row.
   */
  featured?: boolean;
  /**
   * Media type of the subject: "movie" or "tv" (series).
   *
   * Optional, and never guessed at write time. When it is absent the public
   * loader resolves the media type from TMDB (src/lib/tmdb/media-type.ts),
   * so a row without the tag still lands on the right index. When it IS
   * set it wins: the editor pinned the answer, no lookup overrules it.
   */
  mediaType?: "movie" | "tv";
  /** Manual watch links (custom free sites + paid options), edited in the dashboard. */
  customWatch?: CustomWatch;
  /**
   * Site namespaces allowed to display this review (SITE_ID values).
   * Missing/empty = shared starter content shown everywhere.
   */
  sites?: string[];
  seo?: ReviewSeo;
  redirects?: string[]; // old slugs that should 308 to current slug
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

const DB_PATH =
  process.env.REVIEWS_DB_PATH ?? path.join(process.cwd(), "data", "reviews.json");

async function readAll(): Promise<Review[]> {
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Review[]) : [];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw err;
  }
}

async function writeAll(reviews: Review[]): Promise<void> {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(reviews, null, 2), "utf8");
}

export async function listReviews(): Promise<Review[]> {
  const all = await readAll();
  return all.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

export async function getReviewById(id: string): Promise<Review | null> {
  const all = await readAll();
  return all.find((r) => r.id === id) ?? null;
}

export async function findBySlug(slug: string): Promise<Review | null> {
  const all = await readAll();
  const s = slug.trim().toLowerCase();
  return (
    all.find((r) => r.slug.toLowerCase() === s) ??
    all.find((r) => (r.redirects ?? []).some((old) => old.toLowerCase() === s)) ??
    null
  );
}

export async function upsertReview(review: Review): Promise<Review> {
  const all = await readAll();
  const i = all.findIndex((r) => r.id === review.id);
  if (i >= 0) all[i] = review;
  else all.push(review);
  await writeAll(all);
  return review;
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "review"
  );
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
