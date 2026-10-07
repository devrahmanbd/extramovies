/**
 * Minimal Drizzle schema — SQLite (local) + D1 (production) compatible.
 * Markdown (`reviews.body_markdown`) is the canonical body; HTML is derived.
 */
import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';

export const movies = sqliteTable('movies', {
  id: text('id').primaryKey(),
  tmdbId: integer('tmdb_id').unique(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  year: integer('year'),
  directors: text('directors', { mode: 'json' }).$type<string[]>(),
  poster: text('poster'),
  synopsis: text('synopsis'),
  runtimeMin: integer('runtime_min'),
  genres: text('genres', { mode: 'json' }).$type<string[]>(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString())
});

export const reviews = sqliteTable('reviews', {
  id: text('id').primaryKey(),
  movieId: text('movie_id')
    .notNull()
    .references(() => movies.id),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  dek: text('dek'),
  /** Canonical body — Markdown only. Render to HTML at request/build time. */
  bodyMarkdown: text('body_markdown').notNull(),
  rating100: integer('rating_100'),
  verdict: text('verdict'),
  author: text('author').notNull().default('Staff'),
  publishedAt: text('published_at'),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  featured: integer('featured').notNull().default(0),
  noindex: integer('noindex').notNull().default(0)
});

export const streamingAvailability = sqliteTable(
  'streaming_availability',
  {
    movieId: text('movie_id')
      .notNull()
      .references(() => movies.id),
    region: text('region').notNull().default('US'),
    provider: text('provider').notNull(),
    url: text('url'),
    quality: text('quality'),
    updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString())
  },
  (t) => [primaryKey({ columns: [t.movieId, t.region, t.provider] })]
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  /** JSON-encoded value. Keys: brand.preset, site.name, site.url, region.default */
  value: text('value').notNull()
});

export const adminUser = sqliteTable('admin_user', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  /** argon2/bcrypt hash — never plaintext. */
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString())
});

export const researchSources = sqliteTable('research_sources', {
  id: text('id').primaryKey(),
  movieId: text('movie_id').references(() => movies.id),
  reviewId: text('review_id').references(() => reviews.id),
  kind: text('kind').notNull().$type<'tmdb' | 'omdb' | 'openrouter' | 'manual'>(),
  url: text('url'),
  snippet: text('snippet'),
  fetchedAt: text('fetched_at').notNull().$defaultFn(() => new Date().toISOString())
});

export const redirects = sqliteTable('redirects', {
  fromPath: text('from_path').primaryKey(),
  toPath: text('to_path').notNull(),
  status: integer('status').notNull().default(301)
});

/**
 * Manual watch links per review (D1 parity for the file-store `customWatch`).
 * kind: 'free' (custom free sites) | 'paid' (paid watch / sponsor links).
 * File store (reviews.json) is the runtime source of truth; this table lets
 * D1 deployments query the same data with SQL.
 */
export const customWatchLinks = sqliteTable(
  'custom_watch_links',
  {
    id: text('id').primaryKey(),
    reviewId: text('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().$type<'free' | 'paid'>(),
    label: text('label').notNull(),
    url: text('url').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString())
  }
);

export type Movie = typeof movies.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;

/**
 * TV series catalog (curated TMDB import, NOT "all of TMDB").
 * HONEST LIMITS: importing ALL of TMDB (millions of titles) via the public
 * API is infeasible (~40 req/10s rate limits, paginated discover caps,
 * ToS). This table stores curated bulk-import rows only
 * (trending/popular/top-rated + genre discover, via scripts/import-tmdb.ts).
 * id uses the same `tmdb:{id}` shape as movies so the existing
 * `streaming_availability.movie_id` table can store series rows too
 * (documented reuse — that table is NOT altered here).
 */
export const series = sqliteTable('series', {
  id: text('id').primaryKey(),
  tmdbId: integer('tmdb_id').unique(),
  mediaType: text('media_type').notNull().default('tv'),
  title: text('title').notNull(),
  originalTitle: text('original_title'),
  overview: text('overview'),
  firstAirDate: text('first_air_date'),
  year: integer('year'),
  /** Episode runtime average (mean of episode_run_time[]), nullable. */
  runtimeMin: integer('runtime_min'),
  seasons: integer('seasons'),
  episodes: integer('episodes'),
  status: text('status'),
  genres: text('genres', { mode: 'json' }).$type<string[]>(),
  poster: text('poster'),
  backdrop: text('backdrop'),
  /** TV creators (from details.created_by) — mirrors movies.directors. */
  creators: text('creators', { mode: 'json' }).$type<string[]>(),
  /** Top-billed cast names (from /tv/{id}/credits, capped at 10). */
  cast: text('cast', { mode: 'json' }).$type<string[]>(),
  voteAverage: real('vote_average'),
  voteCount: integer('vote_count'),
  popularity: real('popularity'),
  imdbId: text('imdb_id'),
  fetchedAt: text('fetched_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString())
});

/**
 * Resumable bulk-import cursor per source (e.g. 'movie:popular', 'tv:trending',
 * 'movie:genre:28'). `page` = last COMPLETED page; resume starts at page+1.
 */
export const importState = sqliteTable('import_state', {
  source: text('source').primaryKey(),
  page: integer('page').notNull().default(0),
  totalPages: integer('total_pages'),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString())
});

export type Series = typeof series.$inferSelect;
export type NewSeries = typeof series.$inferInsert;
export type ImportState = typeof importState.$inferSelect;
