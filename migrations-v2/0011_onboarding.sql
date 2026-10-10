ALTER TABLE user_settings ADD COLUMN onboarding_presented INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE user_settings ADD COLUMN onboarding_dismissed INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE user_settings ADD COLUMN onboarding_account_completed INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE user_settings ADD COLUMN onboarding_movement_completed INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE user_settings ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0;
