ALTER TABLE `subscriptions` ADD `start_date` text;
--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `next_charge_date` text;
--> statement-breakpoint
UPDATE `subscriptions`
SET `start_date` = CASE
  WHEN `billing_day` BETWEEN 1 AND 31 THEN printf(
    '%s-%02d',
    substr(`created_at`, 1, 7),
    min(
      `billing_day`,
      CAST(strftime('%d', date(substr(`created_at`, 1, 7) || '-01', '+1 month', '-1 day')) AS integer)
    )
  )
  ELSE substr(`created_at`, 1, 10)
END
WHERE `start_date` IS NULL;
