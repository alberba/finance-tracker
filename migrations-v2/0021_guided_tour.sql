-- The guided tour (#527): one flag per platform, since the desktop and the
-- mobile frame lay the app out differently and each one has its own tour.
ALTER TABLE user_settings ADD COLUMN tour_desktop_seen INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE user_settings ADD COLUMN tour_mobile_seen INTEGER NOT NULL DEFAULT 0;
