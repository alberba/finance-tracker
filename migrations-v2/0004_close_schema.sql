DROP INDEX `user_identities_provider_subject_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `user_identities_provider_subject_idx` ON `user_identities` (`provider`, `subject`);--> statement-breakpoint
DROP INDEX `accounts_user_id_legacy_id_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_user_id_legacy_id_idx` ON `accounts` (`user_id`, `legacy_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_user_id_legacy_id_idx` ON `categories` (`user_id`, `legacy_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `twr_liquidity_accounts_user_id_legacy_id_idx` ON `twr_liquidity_accounts` (`user_id`, `legacy_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_user_id_legacy_id_idx` ON `transactions` (`user_id`, `legacy_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_user_id_legacy_id_idx` ON `subscriptions` (`user_id`, `legacy_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `recurring_rules_user_id_legacy_id_idx` ON `recurring_rules` (`user_id`, `legacy_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pending_movements_user_id_legacy_id_idx` ON `pending_movements` (`user_id`, `legacy_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `budget_entries_user_id_legacy_id_idx` ON `budget_entries` (`user_id`, `legacy_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `budget_entries_user_id_category_year_month_idx` ON `budget_entries` (`user_id`, `category_id`, `year`, `month`);--> statement-breakpoint
CREATE UNIQUE INDEX `goals_user_id_legacy_id_idx` ON `goals` (`user_id`, `legacy_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `goals_user_id_key_idx` ON `goals` (`user_id`, `key`);--> statement-breakpoint
CREATE UNIQUE INDEX `wealth_snapshots_user_id_legacy_id_idx` ON `wealth_snapshots` (`user_id`, `legacy_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `wealth_snapshots_user_id_year_month_idx` ON `wealth_snapshots` (`user_id`, `year`, `month`);--> statement-breakpoint
CREATE UNIQUE INDEX `contributions_user_id_legacy_id_idx` ON `contributions` (`user_id`, `legacy_id`);--> statement-breakpoint
DROP INDEX `integration_credentials_user_id_provider_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `integration_credentials_user_id_provider_idx` ON `integration_credentials` (`user_id`, `provider`);--> statement-breakpoint
CREATE UNIQUE INDEX `stockevents_symbol_mappings_user_id_legacy_id_idx` ON `stockevents_symbol_mappings` (`user_id`, `legacy_id`);--> statement-breakpoint
DROP INDEX `stockevents_symbol_mappings_user_id_symbol_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `stockevents_symbol_mappings_user_id_symbol_idx` ON `stockevents_symbol_mappings` (`user_id`, `stockevents_symbol`);--> statement-breakpoint
DROP INDEX `user_instruments_user_id_instrument_id_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `user_instruments_user_id_instrument_id_idx` ON `user_instruments` (`user_id`, `instrument_id`);--> statement-breakpoint
DROP INDEX `market_instruments_provider_symbol_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `market_instruments_provider_symbol_idx` ON `market_instruments` (`provider`, `normalized_symbol`);--> statement-breakpoint

CREATE TABLE `__new_investment_trade_details` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`instrument_id` text,
	`side` text NOT NULL,
	`quantity` text NOT NULL,
	`price_minor` integer NOT NULL,
	`fee_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`symbol` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`instrument_id`) REFERENCES `market_instruments`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_investment_trade_details` SELECT * FROM `investment_trade_details`;--> statement-breakpoint
DROP TABLE `investment_trade_details`;--> statement-breakpoint
ALTER TABLE `__new_investment_trade_details` RENAME TO `investment_trade_details`;--> statement-breakpoint
CREATE UNIQUE INDEX `investment_trade_details_transaction_id_unique` ON `investment_trade_details` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `investment_trade_details_user_id_idx` ON `investment_trade_details` (`user_id`);--> statement-breakpoint

CREATE TABLE `__new_snapshot_balances` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`account_id` text,
	`balance_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`snapshot_id`) REFERENCES `wealth_snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_snapshot_balances` SELECT * FROM `snapshot_balances`;--> statement-breakpoint
DROP TABLE `snapshot_balances`;--> statement-breakpoint
ALTER TABLE `__new_snapshot_balances` RENAME TO `snapshot_balances`;--> statement-breakpoint
CREATE INDEX `snapshot_balances_user_id_idx` ON `snapshot_balances` (`user_id`);--> statement-breakpoint
CREATE INDEX `snapshot_balances_user_id_snapshot_id_idx` ON `snapshot_balances` (`user_id`, `snapshot_id`);--> statement-breakpoint

CREATE TABLE `__new_contribution_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`contribution_id` text NOT NULL,
	`account_id` text,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contribution_id`) REFERENCES `contributions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_contribution_allocations` SELECT * FROM `contribution_allocations`;--> statement-breakpoint
DROP TABLE `contribution_allocations`;--> statement-breakpoint
ALTER TABLE `__new_contribution_allocations` RENAME TO `contribution_allocations`;--> statement-breakpoint
CREATE INDEX `contribution_allocations_user_id_idx` ON `contribution_allocations` (`user_id`);--> statement-breakpoint
CREATE INDEX `contribution_allocations_user_id_contribution_id_idx` ON `contribution_allocations` (`user_id`, `contribution_id`);--> statement-breakpoint

CREATE TABLE `__new_pending_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`legacy_id` text,
	`recurring_rule_id` text NOT NULL,
	`account_id` text,
	`category_id` text,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`due_date` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`type` text,
	`description` text,
	`symbol` text,
	`side` text,
	`units` text,
	`unit_price_minor` integer,
	`fee_minor` integer,
	`time` text,
	`transaction_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recurring_rule_id`) REFERENCES `recurring_rules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_pending_movements` SELECT * FROM `pending_movements`;--> statement-breakpoint
DROP TABLE `pending_movements`;--> statement-breakpoint
ALTER TABLE `__new_pending_movements` RENAME TO `pending_movements`;--> statement-breakpoint
CREATE INDEX `pending_movements_user_id_idx` ON `pending_movements` (`user_id`);--> statement-breakpoint
CREATE INDEX `pending_movements_user_id_status_due_date_idx` ON `pending_movements` (`user_id`, `status`, `due_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `pending_movements_user_id_legacy_id_idx` ON `pending_movements` (`user_id`, `legacy_id`);
