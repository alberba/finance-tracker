ALTER TABLE user_instruments ADD COLUMN quote_config TEXT
  CHECK (quote_config IS NULL OR json_valid(quote_config));
