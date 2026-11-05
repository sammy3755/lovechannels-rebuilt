-- Separate administrator and member session privileges.
ALTER TABLE lovechannels.sessions ADD COLUMN IF NOT EXISTS access_scope TEXT NOT NULL DEFAULT 'member';
