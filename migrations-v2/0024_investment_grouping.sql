-- How the cover of Inversión groups its positions (#562): account, instrument
-- or type. NULL is the default, by account.
ALTER TABLE user_settings ADD COLUMN investment_grouping TEXT;
