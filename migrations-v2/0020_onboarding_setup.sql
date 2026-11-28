-- The setup wizard replaces the welcome (#452): it remembers the step to
-- resume at, and no longer tracks the account and movement milestones.
ALTER TABLE user_settings ADD COLUMN onboarding_step INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
-- Whoever already has an account is set up: the wizard does not open for them.
UPDATE user_settings
SET onboarding_presented = 1, onboarding_completed = 1
WHERE EXISTS (SELECT 1 FROM accounts WHERE accounts.user_id = user_settings.user_id);
--> statement-breakpoint
ALTER TABLE user_settings DROP COLUMN onboarding_account_completed;
--> statement-breakpoint
ALTER TABLE user_settings DROP COLUMN onboarding_movement_completed;
