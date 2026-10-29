-- Rolls back supabase/migrations/20261029120000_app_store_debateowl_products.sql.
-- Not a migration: `supabase db push` never reads this directory. To apply it,
-- copy it into supabase/migrations under a new timestamp (a forward corrective
-- migration) and ship that like any other migration.
--
-- Removes the DebateOwl product ids again, but only while no App Store
-- subscription uses them; once one does, the subscription's foreign key keeps
-- the row and this deletes nothing.
DELETE FROM public.app_store_products AS product
WHERE product.product_id IN ('com.pistack.debateowl.basic.monthly', 'com.pistack.debateowl.pro.monthly')
  AND NOT EXISTS (
    SELECT 1 FROM public.app_store_subscriptions AS subscription
    WHERE subscription.product_id = product.product_id
  );
