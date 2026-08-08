CREATE TABLE `user_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`subject` text NOT NULL,
	`email` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `user_identities_user_id_idx` ON `user_identities` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_identities_provider_subject_idx` ON `user_identities` (`provider`,`subject`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`locale` text,
	`theme` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_settings_user_id_unique` ON `user_settings` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_settings_user_id_idx` ON `user_settings` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`is_legacy_owner` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`legacy_id` text,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`currency` text NOT NULL,
	`opening_balance_minor` integer NOT NULL,
	`is_archived` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `accounts_user_id_idx` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `accounts_user_id_legacy_id_idx` ON `accounts` (`user_id`,`legacy_id`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`legacy_id` text,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `categories_user_id_idx` ON `categories` (`user_id`);--> statement-breakpoint
CREATE INDEX `categories_user_id_kind_idx` ON `categories` (`user_id`,`kind`);--> statement-breakpoint
CREATE TABLE `twr_liquidity_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`legacy_id` text,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `twr_liquidity_accounts_user_id_idx` ON `twr_liquidity_accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `investment_trade_details` (
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
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`instrument_id`) REFERENCES `market_instruments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `investment_trade_details_transaction_id_unique` ON `investment_trade_details` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `investment_trade_details_user_id_idx` ON `investment_trade_details` (`user_id`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`legacy_id` text,
	`account_id` text NOT NULL,
	`category_id` text,
	`type` text NOT NULL,
	`date` text NOT NULL,
	`description` text,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `transactions_user_id_idx` ON `transactions` (`user_id`);--> statement-breakpoint
CREATE INDEX `transactions_user_id_date_idx` ON `transactions` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `transactions_user_id_account_id_date_idx` ON `transactions` (`user_id`,`account_id`,`date`);--> statement-breakpoint
CREATE TABLE `pending_movements` (
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
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recurring_rule_id`) REFERENCES `recurring_rules`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pending_movements_user_id_idx` ON `pending_movements` (`user_id`);--> statement-breakpoint
CREATE INDEX `pending_movements_user_id_status_due_date_idx` ON `pending_movements` (`user_id`,`status`,`due_date`);--> statement-breakpoint
CREATE TABLE `recurring_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`legacy_id` text,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`account_id` text,
	`category_id` text,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`frequency` text NOT NULL,
	`next_run_date` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `recurring_rules_user_id_idx` ON `recurring_rules` (`user_id`);--> statement-breakpoint
CREATE INDEX `recurring_rules_user_id_status_next_run_date_idx` ON `recurring_rules` (`user_id`,`status`,`next_run_date`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`legacy_id` text,
	`name` text NOT NULL,
	`category_id` text,
	`account_id` text,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`billing_day` integer,
	`frequency` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `subscriptions_user_id_idx` ON `subscriptions` (`user_id`);--> statement-breakpoint
CREATE TABLE `budget_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`legacy_id` text,
	`category_id` text NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `budget_entries_user_id_idx` ON `budget_entries` (`user_id`);--> statement-breakpoint
CREATE INDEX `budget_entries_user_id_year_month_idx` ON `budget_entries` (`user_id`,`year`,`month`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`legacy_id` text,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`target_year` integer,
	`target_amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `goals_user_id_idx` ON `goals` (`user_id`);--> statement-breakpoint
CREATE TABLE `contribution_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`contribution_id` text NOT NULL,
	`account_id` text,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contribution_id`) REFERENCES `contributions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `contribution_allocations_user_id_idx` ON `contribution_allocations` (`user_id`);--> statement-breakpoint
CREATE INDEX `contribution_allocations_user_id_contribution_id_idx` ON `contribution_allocations` (`user_id`,`contribution_id`);--> statement-breakpoint
CREATE TABLE `contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`legacy_id` text,
	`date` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`portfolio_date` text,
	`portfolio_value_minor` integer,
	`flow_minor` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `contributions_user_id_idx` ON `contributions` (`user_id`);--> statement-breakpoint
CREATE INDEX `contributions_user_id_date_idx` ON `contributions` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `snapshot_balances` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`account_id` text,
	`balance_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`snapshot_id`) REFERENCES `wealth_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `snapshot_balances_user_id_idx` ON `snapshot_balances` (`user_id`);--> statement-breakpoint
CREATE INDEX `snapshot_balances_user_id_snapshot_id_idx` ON `snapshot_balances` (`user_id`,`snapshot_id`);--> statement-breakpoint
CREATE TABLE `wealth_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`legacy_id` text,
	`snapshot_date` text NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `wealth_snapshots_user_id_idx` ON `wealth_snapshots` (`user_id`);--> statement-breakpoint
CREATE INDEX `wealth_snapshots_user_id_snapshot_date_idx` ON `wealth_snapshots` (`user_id`,`snapshot_date`);--> statement-breakpoint
CREATE TABLE `market_instruments` (
	`id` text PRIMARY KEY NOT NULL,
	`legacy_id` text,
	`symbol` text NOT NULL,
	`normalized_symbol` text NOT NULL,
	`provider` text NOT NULL,
	`name` text,
	`asset_class` text,
	`currency` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `market_instruments_provider_symbol_idx` ON `market_instruments` (`provider`,`normalized_symbol`);--> statement-breakpoint
CREATE TABLE `market_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`instrument_id` text NOT NULL,
	`price_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`quoted_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`instrument_id`) REFERENCES `market_instruments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `market_quotes_instrument_id_quoted_at_idx` ON `market_quotes` (`instrument_id`,`quoted_at`);--> statement-breakpoint
CREATE TABLE `user_instruments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`instrument_id` text NOT NULL,
	`category_id` text,
	`alias` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`instrument_id`) REFERENCES `market_instruments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `user_instruments_user_id_idx` ON `user_instruments` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_instruments_user_id_instrument_id_idx` ON `user_instruments` (`user_id`,`instrument_id`);--> statement-breakpoint
CREATE TABLE `integration_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`ciphertext` text NOT NULL,
	`key_version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `integration_credentials_user_id_idx` ON `integration_credentials` (`user_id`);--> statement-breakpoint
CREATE INDEX `integration_credentials_user_id_provider_idx` ON `integration_credentials` (`user_id`,`provider`);--> statement-breakpoint
CREATE TABLE `stockevents_symbol_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`legacy_id` text,
	`category_id` text,
	`stockevents_symbol` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `stockevents_symbol_mappings_user_id_idx` ON `stockevents_symbol_mappings` (`user_id`);--> statement-breakpoint
CREATE INDEX `stockevents_symbol_mappings_user_id_symbol_idx` ON `stockevents_symbol_mappings` (`user_id`,`stockevents_symbol`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event_type` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`metadata` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_events_user_id_idx` ON `audit_events` (`user_id`);--> statement-breakpoint
CREATE INDEX `audit_events_user_id_created_at_idx` ON `audit_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sync_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`revision` integer NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`change_type` text NOT NULL,
	`payload` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sync_changes_user_id_idx` ON `sync_changes` (`user_id`);--> statement-breakpoint
CREATE INDEX `sync_changes_user_id_revision_idx` ON `sync_changes` (`user_id`,`revision`);--> statement-breakpoint
CREATE TABLE `sync_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`command_type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'applied' NOT NULL,
	`result` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sync_commands_user_id_idx` ON `sync_commands` (`user_id`);--> statement-breakpoint
CREATE INDEX `sync_commands_user_id_created_at_idx` ON `sync_commands` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `user_revisions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `user_revisions_user_id_idx` ON `user_revisions` (`user_id`);