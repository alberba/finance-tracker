CREATE INDEX auth_session_user_idx ON auth_session(user_id);
--> statement-breakpoint
CREATE INDEX auth_session_expiry_idx ON auth_session(expires_at);
--> statement-breakpoint
CREATE UNIQUE INDEX auth_account_provider_identity_idx ON auth_account(provider_id, account_id);
--> statement-breakpoint
CREATE INDEX auth_account_user_idx ON auth_account(user_id);
--> statement-breakpoint
CREATE INDEX auth_passkey_user_idx ON auth_passkey(user_id);
--> statement-breakpoint
CREATE INDEX auth_verification_identifier_idx ON auth_verification(identifier);
--> statement-breakpoint
CREATE INDEX auth_proof_expiry_idx ON auth_proof(expires_at);
