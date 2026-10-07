-- 0003_series_import: TV series catalog + resumable bulk TMDB import state.
-- HONEST LIMITS: importing ALL of TMDB (millions of titles) via the public API
-- is infeasible (~40 req/10s rate limits, paginated discover caps ~500 pages,
-- and ToS). This migration supports CURATED bulk import only
-- (trending/popular/top-rated + genre discover, movies AND tv,
-- via scripts/import-tmdb.ts with rate-limiting + resume).
-- streaming_availability is intentionally NOT altered here: series rows reuse
-- it by storing tmdb:{id} ids in movie_id (documented reuse).

CREATE TABLE IF NOT EXISTS series (
  id TEXT PRIMARY KEY,
  tmdb_id INTEGER UNIQUE,
  media_type TEXT NOT NULL DEFAULT 'tv',
  title TEXT NOT NULL,
  original_title TEXT,
  overview TEXT,
  first_air_date TEXT,
  year INTEGER,
  runtime_min INTEGER,
  seasons INTEGER,
  episodes INTEGER,
  status TEXT,
  genres TEXT,
  poster TEXT,
  backdrop TEXT,
  creators TEXT,
  cast TEXT,
  vote_average REAL,
  vote_count INTEGER,
  popularity REAL,
  imdb_id TEXT,
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_series_tmdb ON series(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_series_year ON series(year DESC);

CREATE TABLE IF NOT EXISTS import_state (
  source TEXT PRIMARY KEY,
  page INTEGER NOT NULL DEFAULT 0,
  total_pages INTEGER,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
