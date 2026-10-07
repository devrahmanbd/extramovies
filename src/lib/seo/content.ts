/**
 * Public content contract for the magazine frontend.
 *
 * Foundation data lives here as clearly-marked DEMO rows so every page
 * renders, builds, and proves its design + SEO before the DB lands.
 *
 * TODO(db-owner): replace each loader body with the real query —
 *   - published reviews: SELECT … FROM reviews JOIN movies … WHERE status='published' ORDER BY published_at DESC
 *   - platform pick: add platform_pick BOOLEAN to that SELECT (badges read it via getLatestReviews)
 *   - single review: same + WHERE slug = ? ; on miss, check `redirects(old_slug)` → 301 (see resolveSlug)
 *   - search: SQLite FTS5 over (title, review_title, genre, year); this file's
 *     searchReviews() already matches that field set with LIKE fallback.
 *   - watch providers: cached TMDB/JustWatch snapshot per movie+region
 * Keep all exported signatures stable — pages depend on them.
 */

export interface ProviderEntry {
  name: string;
  logoUrl: string | null;
}

export interface WatchProviders {
  streaming: ProviderEntry[];
  rent: ProviderEntry[];
  buy: ProviderEntry[];
  free: ProviderEntry[];
  /** ISO timestamp of the snapshot; UI must show it. */
  fetchedAt: string;
  /** True when the region has no data — UI hides the section. */
  hideSection: boolean;
  /** Deep link to TMDB/JustWatch watch page, if known. */
  link: string | null;
}

import type { CustomWatch } from "../watch-links";

export interface PublicReview {
  slug: string;
  reviewTitle: string;
  movieTitle: string;
  year: number | null;
  genres: string[];
  runtimeMinutes: number | null;
  /** Author's own score, 0–10. Never an aggregate. */
  rating: number;
  /** One-line verdict shown under the score. */
  verdict: string;
  /** 1–2 sentence lede for cards + meta descriptions. */
  excerpt: string;
  bodyMarkdown: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  director: string | null;
  cast: string[];
  publishedAt: string;
  updatedAt: string;
  authorName: string;
  featured?: boolean;
  /** Owner-curated "Platform Pick" badge (title cards + review cards). */
  platformPick?: boolean;
  providers: WatchProviders | null;
  /** Manual editor links (custom free sites + paid watch). Null when none. */
  customWatch?: CustomWatch | null;
  tmdbId: number | null;
}

// ---------------------------------------------------------------------------
// DEMO corpus (sample content — replaced by DB rows, same shape).
// Films are real (TMDB-verified artwork + metadata); review prose is sample
// placeholder writing in the owner's voice. Providers on Dune are a real
// US snapshot; other rows carry no availability rather than invented data.
// ---------------------------------------------------------------------------

const DUNE_PROVIDERS: WatchProviders = {
  streaming: [
    { name: "HBO Max", logoUrl: "https://image.tmdb.org/t/p/w92/skypuy7SXuugIQeYg0IglmzoKaS.png" },
    { name: "TNT", logoUrl: "https://image.tmdb.org/t/p/w92/6cgMswJ1yXtJLP1uJhM476h2WTH.png" },
    { name: "TBS", logoUrl: "https://image.tmdb.org/t/p/w92/8MX4rbkjJUf2NMb2ZVwHq0IATJf.png" },
  ],
  rent: [
    { name: "Amazon Video", logoUrl: "https://image.tmdb.org/t/p/w92/jn6TLbtaTZntTRX9UYucHJvpQx1.png" },
    { name: "Apple TV Store", logoUrl: "https://image.tmdb.org/t/p/w92/qdEGArH3lKfFnAtYXMkSYk5wxuG.png" },
  ],
  buy: [{ name: "Amazon Video", logoUrl: "https://image.tmdb.org/t/p/w92/jn6TLbtaTZntTRX9UYucHJvpQx1.png" }],
  free: [],
  fetchedAt: "2026-10-06T00:00:00.000Z",
  hideSection: false,
  link: "https://www.themoviedb.org/movie/693134-dune-part-two/watch?locale=US",
};

const BATMAN_PROVIDERS: WatchProviders = {
  streaming: [
    { name: "HBO Max", logoUrl: "https://image.tmdb.org/t/p/w92/skypuy7SXuugIQeYg0IglmzoKaS.png" },
    { name: "TNT", logoUrl: "https://image.tmdb.org/t/p/w92/6cgMswJ1yXtJLP1uJhM476h2WTH.png" },
    { name: "TBS", logoUrl: "https://image.tmdb.org/t/p/w92/8MX4rbkjJUf2NMb2ZVwHq0IATJf.png" },
  ],
  rent: [
    { name: "Amazon Video", logoUrl: "https://image.tmdb.org/t/p/w92/jn6TLbtaTZntTRX9UYucHJvpQx1.png" },
    { name: "Apple TV Store", logoUrl: "https://image.tmdb.org/t/p/w92/qdEGArH3lKfFnAtYXMkSYk5wxuG.png" },
  ],
  buy: [{ name: "Amazon Video", logoUrl: "https://image.tmdb.org/t/p/w92/jn6TLbtaTZntTRX9UYucHJvpQx1.png" }],
  free: [],
  fetchedAt: "2026-10-06T00:00:00.000Z",
  hideSection: false,
  link: "https://www.themoviedb.org/movie/414906-the-batman/watch?locale=US",
};

const JOKER_PROVIDERS: WatchProviders = {
  streaming: [
    { name: "HBO Max", logoUrl: "https://image.tmdb.org/t/p/w92/skypuy7SXuugIQeYg0IglmzoKaS.png" },
    { name: "TNT", logoUrl: "https://image.tmdb.org/t/p/w92/6cgMswJ1yXtJLP1uJhM476h2WTH.png" },
    { name: "TBS", logoUrl: "https://image.tmdb.org/t/p/w92/8MX4rbkjJUf2NMb2ZVwHq0IATJf.png" },
  ],
  rent: [
    { name: "Amazon Video", logoUrl: "https://image.tmdb.org/t/p/w92/jn6TLbtaTZntTRX9UYucHJvpQx1.png" },
    { name: "Apple TV Store", logoUrl: "https://image.tmdb.org/t/p/w92/qdEGArH3lKfFnAtYXMkSYk5wxuG.png" },
  ],
  buy: [{ name: "Amazon Video", logoUrl: "https://image.tmdb.org/t/p/w92/jn6TLbtaTZntTRX9UYucHJvpQx1.png" }],
  free: [],
  fetchedAt: "2026-10-06T00:00:00.000Z",
  hideSection: false,
  link: "https://www.themoviedb.org/movie/475557-joker/watch?locale=US",
};

export const DEMO_REVIEWS: PublicReview[] = [
  {
    slug: "dune-part-two",
    reviewTitle: "Dune: Part Two Earns Every Minute of Its Desert",
    movieTitle: "Dune: Part Two",
    year: 2024,
    genres: ["Science Fiction", "Adventure"],
    runtimeMinutes: 167,
    rating: 8.8,
    verdict: "Blockbuster filmmaking with actual weight — loud, strange, and sincere.",
    excerpt:
      "Villeneuve turns sand, faith, and giant worms into the rare sequel that outgrows its setup.",
    bodyMarkdown: [
      "The sandworm ride alone justifies the ticket. When Paul finally stands astride one, the theater I sat in went completely silent — not the polite kind, the held-breath kind.",
      "",
      "## Scale with a pulse",
      "",
      "What separates this from every other franchise entry is that the spectacle keeps serving the story. Zendaya gets a real arc this time, and the film is better for trusting her with it. Chalamet sells the turn from boy to prophet without winking.",
      "",
      "> A blockbuster that trusts silence more than most dramas trust dialogue.",
      "",
      "The middle sags for twenty minutes around the southern campaign. Then the duel arrives and none of it matters anymore.",
      "",
      "## Verdict in context",
      "",
      "See it on the biggest screen available to you. This is what the format is for.",
      "",
      "- Sandworm sequences: best in class",
      "- Sound design: felt in the sternum",
      "- Patience required: some, and worth it",
    ].join("\n"),
    posterUrl: "https://image.tmdb.org/t/p/w500/6izwz7rsy95ARzTR3poZ8H6c5pp.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/w780/eZ239CUp1d6OryZEBPnO2n87gMG.jpg",
    director: "Denis Villeneuve",
    cast: ["Timothée Chalamet", "Zendaya", "Rebecca Ferguson"],
    publishedAt: "2026-09-28T10:00:00.000Z",
    updatedAt: "2026-09-28T10:00:00.000Z",
    authorName: "The Editor",
    featured: true,
    platformPick: true,
    providers: DUNE_PROVIDERS,
    customWatch: null,
    tmdbId: 693134,
  },
  {
    slug: "the-batman",
    reviewTitle: "The Batman Finds the Detective in the Costume",
    movieTitle: "The Batman",
    year: 2022,
    genres: ["Crime", "Mystery", "Thriller"],
    runtimeMinutes: 177,
    rating: 7.9,
    verdict: "A rain-soaked procedural that finally lets Batman detect.",
    excerpt:
      "Reeves shoots Gotham like a crime scene and Pattinson plays the world's grumpiest detective.",
    bodyMarkdown: [
      "Three hours sounds punishing until the Riddler's first crime scene lands and you realize this is a serial-killer procedural wearing a cape.",
      "",
      "## What works",
      "",
      "Pattinson's emo-garage-band Bruce shouldn't work and completely does. Kravitz matches him beat for beat. Greig Fraser's Gotham is all sodium light and wet asphalt — you can smell it.",
      "",
      "## What wobbles",
      "",
      "The third act has two endings too many. Trim twenty minutes and this sits with the best of the character.",
    ].join("\n"),
    posterUrl: "https://image.tmdb.org/t/p/w500/74xTEgt7R36Fpooo50r9T25onhq.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/w780/rvtdN5XkWAfGX6xDuPL6yYS2seK.jpg",
    director: "Matt Reeves",
    cast: ["Robert Pattinson", "Zoë Kravitz", "Jeffrey Wright"],
    publishedAt: "2026-09-20T10:00:00.000Z",
    updatedAt: "2026-09-20T10:00:00.000Z",
    authorName: "The Editor",
    providers: BATMAN_PROVIDERS,
    customWatch: null,
    tmdbId: 414906,
  },
  {
    slug: "joker",
    reviewTitle: "Joker Is Craft in Search of a Reason",
    movieTitle: "Joker",
    year: 2019,
    genres: ["Crime", "Thriller", "Drama"],
    runtimeMinutes: 122,
    rating: 6.4,
    verdict: "Phoenix is undeniable; the film around him borrows more than it says.",
    excerpt:
      "A powerhouse performance wrapped around a tribute act that never quite becomes its own movie.",
    bodyMarkdown: [
      "Let's start with what nobody disputes: Phoenix is fully committed, physically transformative, impossible to look away from.",
      "",
      "## The failure, specifically",
      "",
      "Every scene reminds you of a better film — Taxi Driver here, The King of Comedy there. Homage curdles into homework. By the final act the movie is gesturing at ideas about spectacle and violence without earning any of them.",
      "",
      "> Craft without conviction is just expensive mimicry.",
      "",
      "Worth one watch for the performance. Not the coronation it was sold as.",
    ].join("\n"),
    posterUrl: "https://image.tmdb.org/t/p/w500/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/w780/rlay2M5QYvi6igbGcFjq8jxeusY.jpg",
    director: "Todd Phillips",
    cast: ["Joaquin Phoenix", "Robert De Niro", "Zazie Beetz"],
    publishedAt: "2026-09-12T10:00:00.000Z",
    updatedAt: "2026-09-12T10:00:00.000Z",
    authorName: "The Editor",
    providers: JOKER_PROVIDERS,
    customWatch: null,
    tmdbId: 475557,
  },
];

/** Demo redirect map: old slug → current slug. Real table: `redirects(old_slug, new_slug)` → 301. */
export const DEMO_REDIRECTS: Record<string, string> = {
  "the-night-projectionist": "dune-part-two",
  "night-projectionist-review": "dune-part-two",
  "salt-and-static": "the-batman",
  "harbor-of-small-hours": "joker",
};

// ---------------------------------------------------------------------------
// Loaders (signatures stable; bodies go DB-backed later)
// ---------------------------------------------------------------------------

function published(): PublicReview[] {
  return [...DEMO_REVIEWS].sort(
    (a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt)
  );
}

export function getLatestReviews(limit = 10): PublicReview[] {
  return published().slice(0, limit);
}

export function getFeaturedReview(): PublicReview | null {
  const all = published();
  return all.find((r) => r.featured) ?? all[0] ?? null;
}

export function getReviewBySlug(slug: string): PublicReview | null {
  return published().find((r) => r.slug === slug) ?? null;
}

export type SlugResolution =
  | { type: "review"; review: PublicReview }
  | { type: "redirect"; to: string }
  | { type: "not-found" };

export function resolveSlug(slug: string): SlugResolution {
  const review = getReviewBySlug(slug);
  if (review) return { type: "review", review };
  const target = DEMO_REDIRECTS[slug];
  if (target) return { type: "redirect", to: `/reviews/${target}` };
  return { type: "not-found" };
}

export function listGenres(): string[] {
  const set = new Set<string>();
  for (const r of DEMO_REVIEWS) for (const g of r.genres) set.add(g);
  return [...set].sort();
}

export function getReviewsByGenre(genre: string): PublicReview[] {
  const g = genre.toLowerCase();
  return published().filter((r) => r.genres.some((x) => x.toLowerCase() === g));
}

/** "My ratings" — curated by author's own score, highest first. */
export function getTopRated(limit = 3): PublicReview[] {
  return [...published()].sort((a, b) => b.rating - a.rating).slice(0, limit);
}

/**
 * Simple search over title, review title, genre, year (LIKE-level).
 * DB upgrade path: SQLite FTS5 virtual table over the same four fields.
 */
export function searchReviews(query: string, limit = 20): PublicReview[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/);
  return published()
    .map((r) => {
      const hay = `${r.movieTitle} ${r.reviewTitle} ${r.genres.join(" ")} ${r.year ?? ""}`.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (r.movieTitle.toLowerCase().includes(t)) score += 3;
        else if (r.reviewTitle.toLowerCase().includes(t)) score += 2;
        else if (hay.includes(t)) score += 1;
        else return null;
      }
      return { r, score };
    })
    .filter((x): x is { r: PublicReview; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.r);
}

export function formatRuntime(minutes: number | null): string | null {
  if (minutes === null || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
