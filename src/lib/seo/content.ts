/**
 * Public content contract for the magazine frontend.
 *
 * Foundation data lives here as clearly-marked DEMO rows so every page
 * renders, builds, and proves its design + SEO before the DB lands.
 *
 * Store-unification (implemented 2026-10-07): published admin-store rows
 * (data/reviews.json, see src/pages/api/admin/_store.ts) override the DEMO
 * rows by slug — admin edits go live. DEMO rows remain the fallback when the
 * store file is missing/unreadable. Store rows carry no watch-provider
 * snapshots or backdrop art, so merged rows render those sections empty
 * (movie hubs still fetch live TMDB data).
 *
 * TODO(db-owner): replace each loader body with the real query —
 *   - published reviews: SELECT … FROM reviews JOIN movies … WHERE status='published' ORDER BY published_at DESC
 *   - platform pick: add platform_pick BOOLEAN to that SELECT (badges read it via getLatestReviews)
 *   - single review: same + WHERE slug = ? ; on miss, check `redirects(old_slug)` → 301 (see resolveSlug)
 *   - search: SQLite FTS5 over (title, review_title, genre, year); this file's
 *     searchReviews() already matches that field set with LIKE fallback.
 *   - watch providers: cached TMDB snapshot per movie+region
 * Keep all exported signatures stable — pages depend on them.
 */
import fs from "node:fs";
import path from "node:path";
import type { Review } from "../../pages/api/admin/_store";

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
  /** Deep link to TMDB watch page, if known. */
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
    verdict: "The rare blockbuster that earns its scale. See it on the biggest screen available.",
    excerpt:
      "Villeneuve's sequel finds weight in myth and spectacle, built for the biggest screen.",
    bodyMarkdown: [
      "Verdict first. See this on the biggest screen you can find. It holds 92% with critics and 95% with audiences because the spectacle finally serves a story about faith and power.",
      "",
      "## Scale with a pulse",
      "",
      "The sandworm ride earns its reputation. Villeneuve stages it almost without dialogue. Sound and scale carry stakes that other blockbusters hand to quips. The smarter decision sits around that sequence. Chani gets doubt the book only implies. Zendaya plays it as clear eyed resistance to Paul's myth, which gives Chalamet something harder to play in return. His shift from boy to prophet lands because someone on screen refuses to buy it.",
      "",
      "> Silence does more work here than dialogue does in most blockbusters.",
      "",
      "## The cost",
      "",
      "The southern campaign drags for about twenty minutes in the middle. At 167 minutes the cut is generous. Then the duel starts and the sag stops mattering.",
      "",
      "## Verdict in context",
      "",
      "It plays as the strongest sci-fi sequel since The Empire Strikes Back. Sound design does the heaviest lifting, especially around the sandworm sequences. If Part One felt slow, this will not convert you. It doubles down on pace and scale, and that commitment is the point.",
    ].join("\n"),
    posterUrl: "https://image.tmdb.org/t/p/w780/6izwz7rsy95ARzTR3poZ8H6c5pp.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/eZ239CUp1d6OryZEBPnO2n87gMG.jpg",
    director: "Denis Villeneuve",
    cast: ["Timothée Chalamet", "Zendaya", "Rebecca Ferguson"],
    publishedAt: "2026-09-28T10:00:00.000Z",
    updatedAt: "2026-10-07T10:00:00.000Z",
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
    verdict: "A rain-soaked procedural that finally lets Batman detect. Long, but it earns most of it.",
    excerpt:
      "Reeves shoots Gotham like a crime scene and Pattinson plays the world's grumpiest detective.",
    bodyMarkdown: [
      "Worth watching, especially if you prefer crime films to superhero films. This is a serial killer procedural that happens to wear a cape. The cape feels incidental for long stretches. Three hours sounds punishing. Then the Riddler's first crime scene arrives and Reeves shows he means the detective part. The victim staging reads as a riddle in itself, and the film never winks at it.",
      "",
      "## What works",
      "",
      "Pattinson's emo garage band Bruce should not work. It does, because the film treats Batman as a strange armored loner instead of a billionaire fantasy. Kravitz holds every shared scene without forcing it. Dano stays unnerving by staying small, which lands scarier than theatrical tics would allow. Fraser shoots Gotham in sodium light and wet asphalt that makes the city feel damp to the touch. The Nirvana cue places its comic book allegiance without a speech.",
      "",
      "## What wobbles",
      "",
      "The cut runs 177 minutes and keeps two endings too many. The third act peaks, settles, then tries to peak again. Twenty minutes less would put it with the best of the character. Even untrimmed, it remains the most committed detective story filmed with this character.",
    ].join("\n"),
    posterUrl: "https://image.tmdb.org/t/p/w780/74xTEgt7R36Fpooo50r9T25onhq.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/rvtdN5XkWAfGX6xDuPL6yYS2seK.jpg",
    director: "Matt Reeves",
    cast: ["Robert Pattinson", "Zoë Kravitz", "Jeffrey Wright"],
    publishedAt: "2026-09-20T10:00:00.000Z",
    updatedAt: "2026-10-07T10:00:00.000Z",
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
      "You will probably disagree with this score. Audiences adored the film at 89% and 8.4 on IMDb while critics stopped at 68%. Phoenix won the Oscar and earned it. His body and timing hold scenes that give him almost nothing on the page. That split between performance and film never closes.",
      "",
      "## The failure, specifically",
      "",
      "Every homage points to a better film. Taxi Driver hangs over the streets. The King of Comedy shapes the talk show plot down to De Niro sitting in the host chair. At some point homage turns into homework. Hildur Guðnadóttir's score and Lawrence Sher's sickly Gotham build real dread. The final act still gestures at violence and spectacle without deciding what it believes. Ask what the point is and the provocation thins fast.",
      "",
      "> The craft is real. The conviction behind it never arrives.",
      "",
      "See it once for Phoenix. Time has not softened the seams. What played as coronation now looks like a tribute act with an extraordinary lead.",
    ].join("\n"),
    posterUrl: "https://image.tmdb.org/t/p/w780/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/rlay2M5QYvi6igbGcFjq8jxeusY.jpg",
    director: "Todd Phillips",
    cast: ["Joaquin Phoenix", "Robert De Niro", "Zazie Beetz"],
    publishedAt: "2026-09-12T10:00:00.000Z",
    updatedAt: "2026-10-07T10:00:00.000Z",
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
// Store-unification: published admin rows override DEMO rows by slug.
// Sync file read (server-only module); missing/corrupt file → DEMO only.
// ---------------------------------------------------------------------------

function storeDbPath(): string {
  return (
    process.env.REVIEWS_DB_PATH ?? path.join(process.cwd(), "data", "reviews.json")
  );
}

interface StoreCache {
  file: string;
  mtimeMs: number;
  rows: Review[];
}

let storeCache: StoreCache | null = null;

function readStoreRows(): Review[] {
  const file = storeDbPath();
  try {
    const stat = fs.statSync(file);
    if (storeCache && storeCache.file === file && storeCache.mtimeMs === stat.mtimeMs) {
      return storeCache.rows;
    }
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    const rows = Array.isArray(parsed) ? (parsed as Review[]) : [];
    storeCache = { file, mtimeMs: stat.mtimeMs, rows };
    return rows;
  } catch {
    return [];
  }
}

function toFiniteNumber(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Map an admin-store row onto the public contract. Null when unusable. */
function storeToPublic(r: Review): PublicReview | null {
  if (!r || r.status !== "published") return null;
  const slug = typeof r.slug === "string" ? r.slug.trim() : "";
  const title = typeof r.title === "string" ? r.title.trim() : "";
  const markdown = typeof r.markdown === "string" ? r.markdown : "";
  const excerpt = typeof r.excerpt === "string" && r.excerpt.trim() ? r.excerpt.trim() : "";
  if (!slug || !title || !markdown || !excerpt) return null;
  const movie = r.movie ?? {};
  const tmdbId = toFiniteNumber(movie.movieId);
  return {
    slug,
    reviewTitle: title,
    movieTitle: typeof movie.title === "string" && movie.title.trim() ? movie.title.trim() : title,
    year: toFiniteNumber(movie.year),
    genres: Array.isArray(movie.genres) ? movie.genres.filter((g): g is string => typeof g === "string") : [],
    runtimeMinutes: null,
    rating: typeof r.rating === "number" && Number.isFinite(r.rating) ? r.rating : 0,
    verdict: excerpt,
    excerpt,
    bodyMarkdown: markdown,
    posterUrl: typeof movie.poster === "string" ? movie.poster : null,
    backdropUrl: null,
    director: typeof movie.director === "string" ? movie.director : null,
    cast: Array.isArray(movie.cast) ? movie.cast.filter((c): c is string => typeof c === "string") : [],
    publishedAt: r.publishedAt ?? r.updatedAt,
    updatedAt: r.updatedAt,
    authorName: "The Editor",
    ...(r.platformPick === true ? { platformPick: true as const } : {}),
    providers: null,
    ...(r.customWatch ? { customWatch: r.customWatch } : {}),
    tmdbId: tmdbId !== null && Number.isInteger(tmdbId) && tmdbId > 0 ? tmdbId : null,
  };
}

/**
 * Merge a store row over its DEMO counterpart, per field. The store wins
 * everywhere it has a value (title, excerpt, body, rating, dates, movie
 * metadata, platformPick incl. explicit false); the DEMO fills fields the
 * store shape cannot carry (verdict, backdrop, providers, author, featured).
 * Without this, admin-managed rows render visibly poorer than the demos
 * they replaced (no backdrop art, no watch data, excerpt-as-verdict).
 */
function mergeDemo(demo: PublicReview, r: Review): PublicReview {
  const movie = r.movie ?? {};
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const strs = (v: unknown): string[] | null =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : null;
  const tmdbId = toFiniteNumber(movie.movieId);
  return {
    ...demo,
    reviewTitle: str(r.title) ?? demo.reviewTitle,
    movieTitle: str(movie.title) ?? demo.movieTitle,
    year: toFiniteNumber(movie.year) ?? demo.year,
    genres: strs(movie.genres) ?? demo.genres,
    rating: num(r.rating) ?? demo.rating,
    verdict: str(r.excerpt) ? (str(r.excerpt) as string) : demo.verdict,
    excerpt: str(r.excerpt) ?? demo.excerpt,
    bodyMarkdown: str(r.markdown) ?? demo.bodyMarkdown,
    posterUrl: str(movie.poster) ?? demo.posterUrl,
    director: str(movie.director) ?? demo.director,
    cast: strs(movie.cast) ?? demo.cast,
    publishedAt: r.publishedAt ?? demo.publishedAt,
    updatedAt: r.updatedAt ?? demo.updatedAt,
    platformPick:
      "platformPick" in r && typeof r.platformPick === "boolean"
        ? r.platformPick
        : (demo.platformPick ?? false),
    ...(r.customWatch ? { customWatch: r.customWatch } : {}),
    tmdbId:
      tmdbId !== null && Number.isInteger(tmdbId) && tmdbId > 0
        ? tmdbId
        : demo.tmdbId,
  };
}

// ---------------------------------------------------------------------------
// Loaders (signatures stable; bodies go DB-backed later)
// ---------------------------------------------------------------------------

function published(): PublicReview[] {
  const bySlug = new Map<string, PublicReview>();
  for (const demo of DEMO_REVIEWS) bySlug.set(demo.slug, demo);
  for (const row of readStoreRows()) {
    if (!row || row.status !== "published") continue;
    const slug = typeof row.slug === "string" ? row.slug.trim() : "";
    if (!slug) continue;
    const base = bySlug.get(slug);
    if (base) {
      bySlug.set(slug, mergeDemo(base, row));
    } else {
      const pub = storeToPublic(row);
      if (pub) bySlug.set(pub.slug, pub);
    }
  }
  return [...bySlug.values()].sort(
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
  for (const r of published()) for (const g of r.genres) set.add(g);
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
