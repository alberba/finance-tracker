ALTER TABLE goals ADD COLUMN category_id TEXT REFERENCES categories(id);
