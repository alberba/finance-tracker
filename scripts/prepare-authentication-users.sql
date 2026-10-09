-- Run after 0007 and again at the end of the scoped Access migration window.
-- Only trusted Access identities with the same email may establish this mapping.
INSERT OR IGNORE INTO auth_user(id, name, email, email_verified, created_at, updated_at)
SELECT u.id, COALESCE(u.display_name, u.email), lower(trim(u.email)), 1,
  CAST(strftime('%s', u.created_at) AS INTEGER) * 1000,
  CAST(strftime('%s', u.updated_at) AS INTEGER) * 1000
FROM users u WHERE EXISTS (
  SELECT 1 FROM user_identities i WHERE i.user_id = u.id
  AND i.provider = 'cf-access' AND lower(trim(i.email)) = lower(trim(u.email))
);
INSERT OR IGNORE INTO auth_admission(user_id, created_at)
SELECT a.id, a.created_at FROM auth_user a INNER JOIN users u ON u.id = a.id
WHERE a.email_verified = 1;
