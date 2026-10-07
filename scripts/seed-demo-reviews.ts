/**
 * Seed the admin store (data/reviews.json) from the embedded DEMO corpus.
 *
 * Why: public pages render DEMO_REVIEWS from src/lib/seo/content.ts while
 * /admin reads the file store — on a fresh deploy the admin list is empty
 * even though the public site shows reviews. This materializes the demos as
 * editable store rows (idempotent: existing slugs are skipped).
 *
 * NOTE: public pages merge published store rows over the embedded DEMO rows
 * by slug (store-unification in src/lib/seo/content.ts) — admin edits go
 * live. Store rows carry no provider snapshots or backdrop art, so merged
 * rows render those sections from live TMDB data or empty.
 *
 * Usage:
 *   npx tsx scripts/seed-demo-reviews.ts
 *   REVIEWS_DB_PATH=/path/to/reviews.json npx tsx scripts/seed-demo-reviews.ts
 */
import { DEMO_REVIEWS } from "../src/lib/seo/content";
import { findBySlug, upsertReview, type Review } from "../src/pages/api/admin/_store";

async function main(): Promise<void> {
  let created = 0;
  let skipped = 0;
  for (const demo of DEMO_REVIEWS) {
    const existing = await findBySlug(demo.slug);
    if (existing) {
      skipped += 1;
      continue;
    }
    const now = new Date().toISOString();
    const row: Review = {
      id: `seed-${demo.slug}`,
      title: demo.reviewTitle,
      slug: demo.slug,
      excerpt: demo.excerpt,
      markdown: demo.bodyMarkdown,
      status: "published",
      rating: demo.rating,
      movie: {
        title: demo.movieTitle,
        ...(demo.tmdbId ? { movieId: String(demo.tmdbId) } : {}),
        ...(demo.year ? { year: String(demo.year) } : {}),
        ...(demo.genres.length > 0 ? { genres: demo.genres } : {}),
        ...(demo.director ? { director: demo.director } : {}),
        ...(demo.cast.length > 0 ? { cast: demo.cast } : {}),
        ...(demo.posterUrl ? { poster: demo.posterUrl } : {}),
      },
      ...(demo.platformPick === true ? { platformPick: true } : {}),
      ...(demo.customWatch ? { customWatch: demo.customWatch } : {}),
      createdAt: demo.publishedAt,
      updatedAt: now,
      publishedAt: demo.publishedAt,
    };
    await upsertReview(row);
    created += 1;
    console.log(`seeded ${demo.slug} (${demo.movieTitle})`);
  }
  console.log(`done: ${created} created, ${skipped} skipped (already present)`);
}

main().catch((err) => {
  console.error("seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
