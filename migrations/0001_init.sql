-- 0001_init: minimal review CMS. Markdown canonical in reviews.body_markdown.
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS movies (
  id TEXT PRIMARY KEY,
  tmdb_id INTEGER UNIQUE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  year INTEGER,
  directors TEXT,
  poster TEXT,
  synopsis TEXT,
  runtime_min INTEGER,
  genres TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  movie_id TEXT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  dek TEXT,
  body_markdown TEXT NOT NULL,
  rating_100 INTEGER CHECK (rating_100 IS NULL OR (rating_100 >= 0 AND rating_100 <= 100)),
  verdict TEXT,
  author TEXT NOT NULL DEFAULT 'Staff',
  published_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  featured INTEGER NOT NULL DEFAULT 0,
  noindex INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_reviews_movie ON reviews(movie_id);
CREATE INDEX IF NOT EXISTS idx_reviews_published ON reviews(published_at DESC);

CREATE TABLE IF NOT EXISTS streaming_availability (
  movie_id TEXT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  region TEXT NOT NULL DEFAULT 'US',
  provider TEXT NOT NULL,
  url TEXT,
  quality TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (movie_id, region, provider)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_user (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS research_sources (
  id TEXT PRIMARY KEY,
  movie_id TEXT REFERENCES movies(id) ON DELETE CASCADE,
  review_id TEXT REFERENCES reviews(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  url TEXT,
  snippet TEXT,
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS redirects (
  from_path TEXT PRIMARY KEY,
  to_path TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 301
);

-- FTS5 full-text index over the canonical markdown.
CREATE VIRTUAL TABLE IF NOT EXISTS reviews_fts USING fts5(
  title, dek, body_markdown,
  content='reviews', content_rowid='rowid',
  tokenize='porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS reviews_ai AFTER INSERT ON reviews BEGIN
  INSERT INTO reviews_fts(rowid, title, dek, body_markdown)
  VALUES (new.rowid, new.title, new.dek, new.body_markdown);
END;
CREATE TRIGGER IF NOT EXISTS reviews_ad AFTER DELETE ON reviews BEGIN
  INSERT INTO reviews_fts(reviews_fts, rowid, title, dek, body_markdown)
  VALUES ('delete', old.rowid, old.title, old.dek, old.body_markdown);
END;
CREATE TRIGGER IF NOT EXISTS reviews_au AFTER UPDATE ON reviews BEGIN
  INSERT INTO reviews_fts(reviews_fts, rowid, title, dek, body_markdown)
  VALUES ('delete', old.rowid, old.title, old.dek, old.body_markdown);
  INSERT INTO reviews_fts(rowid, title, dek, body_markdown)
  VALUES (new.rowid, new.title, new.dek, new.body_markdown);
END;
