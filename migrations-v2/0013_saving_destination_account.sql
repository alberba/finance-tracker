ALTER TABLE transactions ADD COLUMN destination_account_id TEXT REFERENCES accounts(id);
--> statement-breakpoint
ALTER TABLE recurring_rules ADD COLUMN destination_account_id TEXT REFERENCES accounts(id);
--> statement-breakpoint
ALTER TABLE pending_movements ADD COLUMN destination_account_id TEXT REFERENCES accounts(id);
