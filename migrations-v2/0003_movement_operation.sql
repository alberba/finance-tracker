ALTER TABLE `investment_trade_details` ADD `symbol` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `time` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `declared` integer DEFAULT false NOT NULL;