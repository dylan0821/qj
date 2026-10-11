CREATE TABLE invitations (id TEXT PRIMARY KEY, code_hash TEXT UNIQUE NOT NULL, hint TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('once','long')), note TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1, uses INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE reader_sessions (token_hash TEXT PRIMARY KEY, invite_id TEXT NOT NULL REFERENCES invitations(id), created_at INTEGER NOT NULL);
CREATE INDEX reader_invite ON reader_sessions(invite_id);
CREATE TABLE admin_sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE TABLE auth_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
