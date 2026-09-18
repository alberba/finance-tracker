-- Months become canonical 1-12 in the database (spec #136).
--
-- Every row written before this migration carries v1's 0-11 index, and nothing
-- else in the v2 path converts it: the command schemas validate 1-12, the
-- projection indexes the UI's 0-11 array with `month - 1`, and the repair's
-- backup loader adds 1 to the export's own 0-based month. Left unshifted, every
-- budget cell and every snapshot reads one month early, January falls into the
-- -1 slot of the array and so disappears, and December lands in November.
--
-- This runs before `0004_close_schema.sql` on purpose: the UNIQUE indexes that
-- migration creates would reject the shift, because each destination month is
-- already occupied by the row one month later.
UPDATE `budget_entries` SET `month` = `month` + 1;--> statement-breakpoint
UPDATE `wealth_snapshots` SET `month` = `month` + 1;
