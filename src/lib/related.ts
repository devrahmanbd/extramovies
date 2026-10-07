/** Related-review scoring: shared genres first, same director bonus, newest wins ties. */
import type { PublicReview } from "./seo/content";

export function relatedReviews(
  current: PublicReview,
  all: PublicReview[],
  limit = 3
): PublicReview[] {
  const currentGenres = new Set(current.genres.map((g) => g.toLowerCase()));
  const scored = all
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
    .map((x) => x.r);
  if (scored.length >= limit) return scored.slice(0, limit);
  // Small-corpus fallback: top up with latest reviews so the strip (and its
  // internal links) never renders empty. Scored matches always come first.
  const picked = new Set([current.slug, ...scored.map((r) => r.slug)]);
  const fallback = [...all]
    .filter((r) => !picked.has(r.slug))
    .sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
  return [...scored, ...fallback].slice(0, limit);
}
