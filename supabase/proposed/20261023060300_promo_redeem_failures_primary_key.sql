-- DB-05 (proposed): give private.promo_redeem_failures a primary key.
--
-- It is the one table without a primary key. Its natural columns
-- (user_id, failed_at) can repeat when two failures share a timestamp, so a
-- key on them could fail on existing rows. A surrogate identity column cannot
-- fail: it fills every existing row. redeem_promo_code_atomic inserts only
-- user_id, so it needs no change. The table is rewritten while it holds an
-- ACCESS EXCLUSIVE lock; it holds only failed promo attempts, pruned per user
-- after a day, so that is brief. If the table already has an id column,
-- IF NOT EXISTS skips the whole statement, primary key included; check with
-- `\d private.promo_redeem_failures` first.

ALTER TABLE private.promo_redeem_failures
  ADD COLUMN IF NOT EXISTS id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
