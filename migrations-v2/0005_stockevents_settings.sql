ALTER TABLE `user_settings` ADD `stockevents_enabled` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `stockevents_symbol_mappings` ADD `sync` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `stockevents_symbol_mappings` ADD `watchlist_id` text;--> statement-breakpoint
ALTER TABLE `stockevents_symbol_mappings` ADD `hidden` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `stockevents_symbol_mappings` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE TABLE `stockevents_cash_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text,
	`watchlist_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX `stockevents_cash_mappings_user_id_idx` ON `stockevents_cash_mappings` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `stockevents_cash_mappings_user_id_account_idx` ON `stockevents_cash_mappings` (`user_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `stockevents_cash_sync_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`contribution_date` text NOT NULL,
	`account_id` text,
	`watchlist_id` text NOT NULL,
	`synced_amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX `stockevents_cash_sync_entries_user_id_idx` ON `stockevents_cash_sync_entries` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `stockevents_cash_sync_entries_user_id_date_account_watchlist_idx` ON `stockevents_cash_sync_entries` (`user_id`,`contribution_date`,`account_id`,`watchlist_id`);--> statement-breakpoint
