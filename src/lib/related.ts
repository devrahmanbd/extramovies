/**
 * Related-review scoring: shared genres first, same director next, shared cast
 * last, newest wins ties. Only a review that shares at least one of those axes
 * is related; the strip returns fewer than `limit` rows (or none) rather than
 * topping up with unrelated latest reviews. An honest empty state beats a
 * recency-filled block that teaches a crawler the wrong internal-link graph.
 */
import type { PublicReview } from "./seo/content";

export function relatedReviews(
  current: PublicReview,
  all: PublicReview[],
  limit = 3
): PublicReview[] {
  const currentGenres = new Set(current.genres.map((g) => g.toLowerCase()));
  const currentCast = new Set(current.cast.map((c) => c.toLowerCase()));
  const scored = all
    .filter((r) => r.slug !== current.slug)
    .map((r) => {
      const shared = r.genres.filter((g) => currentGenres.has(g.toLowerCase())).length;
      const directorBonus =
        current.director && r.director === current.director ? 3 : 0;
      const sharedCast = r.cast.filter((c) => currentCast.has(c.toLowerCase())).length;
      return { r, score: shared * 2 + directorBonus + sharedCast };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return +new Date(b.r.publishedAt) - +new Date(a.r.publishedAt);
    })
    .map((x) => x.r);
  return scored.slice(0, limit);
}
