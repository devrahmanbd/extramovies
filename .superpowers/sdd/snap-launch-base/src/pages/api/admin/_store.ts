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
  /** Owner-curated "Platform Pick" badge shown on public title/review cards. */
  platformPick?: boolean;
  /** Manual watch links (custom free sites + paid options), edited in the dashboard. */
  customWatch?: CustomWatch;
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
