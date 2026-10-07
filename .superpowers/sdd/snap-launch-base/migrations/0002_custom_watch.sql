-- 0002_custom_watch: manual watch links per review (D1 parity for file-store customWatch).
CREATE TABLE IF NOT EXISTS custom_watch_links (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('free', 'paid')),
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_custom_watch_review ON custom_watch_links(review_id, kind, position);
