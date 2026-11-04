
CREATE TABLE IF NOT EXISTS lovechannels.oauth_challenges(state TEXT PRIMARY KEY,binding TEXT NOT NULL,nonce TEXT NOT NULL,verifier TEXT NOT NULL,link_user_id BIGINT REFERENCES lovechannels.users(id) ON DELETE CASCADE,expires BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS lovechannels.auth_identities(subject TEXT PRIMARY KEY,user_id BIGINT NOT NULL UNIQUE REFERENCES lovechannels.users(id) ON DELETE CASCADE);
ALTER TABLE lovechannels.oauth_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE lovechannels.auth_identities ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS oauth_challenges_expiry ON lovechannels.oauth_challenges(expires);

REVOKE ALL ON SCHEMA lovechannels FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA lovechannels FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA lovechannels FROM PUBLIC;
GRANT USAGE ON SCHEMA lovechannels TO lovechannels_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA lovechannels TO lovechannels_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA lovechannels TO lovechannels_app;
DO $$ DECLARE t record; BEGIN
FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='lovechannels' LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='lovechannels' AND tablename=t.tablename AND policyname='server_access') THEN
  EXECUTE format('CREATE POLICY server_access ON lovechannels.%I TO lovechannels_app USING (true) WITH CHECK (true)',t.tablename);
 END IF;
END LOOP;
END $$;
