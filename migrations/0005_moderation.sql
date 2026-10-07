-- 0005_moderation: member-review content moderation (reports + hide/unhide).
-- Extends 0004_social member_reviews with a visibility flag; reports table
-- lets members flag reviews for admin triage. Admin page + APIs only.
PRAGMA journal_mode=WAL;

ALTER TABLE member_reviews ADD COLUMN status TEXT NOT NULL DEFAULT 'visible';

CREATE TABLE IF NOT EXISTS review_reports (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES member_reviews(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (review_id, reporter_id)
);
CREATE INDEX IF NOT EXISTS idx_review_reports_review ON review_reports(review_id);
CREATE INDEX IF NOT EXISTS idx_review_reports_reporter ON review_reports(reporter_id);
