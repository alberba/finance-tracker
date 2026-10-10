CREATE TABLE auth_user (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "email_verified" INTEGER NOT NULL,
  "image" TEXT,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "invitation_id" TEXT
);
--> statement-breakpoint
CREATE TABLE auth_session (
  "id" TEXT PRIMARY KEY,
  "expires_at" INTEGER NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "user_id" TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE auth_account (
  "id" TEXT PRIMARY KEY,
  "account_id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  "access_token" TEXT,
  "refresh_token" TEXT,
  "id_token" TEXT,
  "access_token_expires_at" INTEGER,
  "refresh_token_expires_at" INTEGER,
  "scope" TEXT,
  "password" TEXT,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE auth_verification (
  "id" TEXT PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expires_at" INTEGER NOT NULL,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE auth_passkey (
  "id" TEXT PRIMARY KEY,
  "name" TEXT,
  "public_key" TEXT NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  "credential_id" TEXT NOT NULL UNIQUE,
  "counter" INTEGER NOT NULL,
  "device_type" TEXT NOT NULL,
  "backed_up" INTEGER NOT NULL,
  "transports" TEXT,
  "created_at" INTEGER,
  "aaguid" TEXT
);
--> statement-breakpoint
CREATE TABLE auth_rate_limit (
  "id" TEXT PRIMARY KEY,
  "key" TEXT NOT NULL UNIQUE,
  "count" INTEGER NOT NULL,
  "last_request" INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE auth_invitation (
  "id" TEXT PRIMARY KEY,
  "token_hash" TEXT NOT NULL UNIQUE,
  "max_uses" INTEGER NOT NULL CHECK (max_uses > 0),
  "uses" INTEGER NOT NULL CHECK (uses >= 0 AND uses <= max_uses),
  "expires_at" INTEGER NOT NULL,
  "revoked" INTEGER NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE auth_admission (
  "user_id" TEXT PRIMARY KEY NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  "invitation_id" TEXT,
  "created_at" INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE auth_role (
  "user_id" TEXT PRIMARY KEY NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  "role" TEXT NOT NULL CHECK (role = 'admin')
);
--> statement-breakpoint
CREATE TABLE auth_policy (
  "id" TEXT PRIMARY KEY,
  "public_registration" INTEGER NOT NULL
);
--> statement-breakpoint
INSERT INTO auth_policy VALUES ('registration', 0);
--> statement-breakpoint
CREATE TRIGGER auth_admit BEFORE INSERT ON auth_admission
WHEN NOT EXISTS (SELECT 1 FROM auth_admission WHERE user_id = NEW.user_id)
BEGIN
 SELECT RAISE(ABORT, 'EMAIL_NOT_VERIFIED')
 WHERE NOT EXISTS (SELECT 1 FROM auth_user WHERE id = NEW.user_id AND email_verified = 1);
 SELECT RAISE(ABORT, 'INVITATION_UNAVAILABLE')
 WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id)
 AND (
 (NEW.invitation_id IS NULL AND NOT EXISTS (SELECT 1 FROM auth_policy WHERE id = 'registration' AND public_registration = 1))
 OR (NEW.invitation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth_invitation WHERE id = NEW.invitation_id AND revoked = 0 AND expires_at > NEW.created_at AND uses < max_uses))
 );
 UPDATE auth_invitation SET uses = uses + 1
 WHERE id = NEW.invitation_id AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id);
 INSERT INTO users(id, email, display_name, is_legacy_owner, created_at, updated_at)
 SELECT id, email, name, 0, strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at / 1000.0, 'unixepoch'), strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at / 1000.0, 'unixepoch')
 FROM auth_user WHERE id = NEW.user_id AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id);
END;
--> statement-breakpoint
INSERT INTO auth_user(id, name, email, email_verified, created_at, updated_at)
 SELECT u.id, COALESCE(u.display_name, u.email), lower(trim(u.email)), 1,
 CAST(strftime('%s', u.created_at) AS INTEGER) * 1000, CAST(strftime('%s', u.updated_at) AS INTEGER) * 1000
 FROM users u WHERE EXISTS (
 SELECT 1 FROM user_identities i WHERE i.user_id = u.id AND i.provider = 'cf-access' AND lower(trim(i.email)) = lower(trim(u.email))
 );
--> statement-breakpoint
INSERT INTO auth_admission(user_id, created_at)
 SELECT id, created_at FROM auth_user;
