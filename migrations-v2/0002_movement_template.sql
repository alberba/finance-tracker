ALTER TABLE `pending_movements` ADD `type` text;--> statement-breakpoint
ALTER TABLE `pending_movements` ADD `description` text;--> statement-breakpoint
ALTER TABLE `pending_movements` ADD `symbol` text;--> statement-breakpoint
ALTER TABLE `pending_movements` ADD `side` text;--> statement-breakpoint
ALTER TABLE `pending_movements` ADD `units` text;--> statement-breakpoint
ALTER TABLE `pending_movements` ADD `unit_price_minor` integer;--> statement-breakpoint
ALTER TABLE `pending_movements` ADD `fee_minor` integer;--> statement-breakpoint
ALTER TABLE `pending_movements` ADD `time` text;--> statement-breakpoint
ALTER TABLE `pending_movements` ADD `transaction_id` text;--> statement-breakpoint
ALTER TABLE `recurring_rules` ADD `interval` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `recurring_rules` ADD `start_date` text;--> statement-breakpoint
ALTER TABLE `recurring_rules` ADD `end_date` text;--> statement-breakpoint
ALTER TABLE `recurring_rules` ADD `last_execution_date` text;--> statement-breakpoint
ALTER TABLE `recurring_rules` ADD `symbol` text;--> statement-breakpoint
ALTER TABLE `recurring_rules` ADD `side` text;--> statement-breakpoint
ALTER TABLE `recurring_rules` ADD `units` text;--> statement-breakpoint
ALTER TABLE `recurring_rules` ADD `unit_price_minor` integer;--> statement-breakpoint
ALTER TABLE `recurring_rules` ADD `fee_minor` integer;--> statement-breakpoint
ALTER TABLE `recurring_rules` ADD `time` text;