/** Related-review scoring: shared genres first, same director bonus, newest wins ties. */
import type { PublicReview } from "./seo/content";

export function relatedReviews(
  current: PublicReview,
  all: PublicReview[],
  limit = 3
): PublicReview[] {
  const currentGenres = new Set(current.genres.map((g) => g.toLowerCase()));
  return all
    .filter((r) => r.slug !== current.slug)
    .map((r) => {
      const shared = r.genres.filter((g) => currentGenres.has(g.toLowerCase())).length;
      const directorBonus =
        current.director && r.director === current.director ? 3 : 0;
      return { r, score: shared * 2 + directorBonus };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return +new Date(b.r.publishedAt) - +new Date(a.r.publishedAt);
    })
    .slice(0, limit)
    .map((x) => x.r);
}
