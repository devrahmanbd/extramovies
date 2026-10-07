-- 0006_sessions: D1-backed sessions (replaces the in-memory Map in
-- src/lib/auth/session.ts so logins survive across Workers isolates).
-- Additive-only: no changes to existing tables.
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  user_id TEXT NULL,
  role TEXT NOT NULL,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
