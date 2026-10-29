-- The App Store products the DebateOwl app sells (apps/mobile/src/lib/purchases.ts),
-- under its bundle id com.pistack.debateowl. Additive: the placeholder ids from
-- 20261014123154_app_store_entitlements.sql stay, because no real transaction
-- can carry them (app-store-purchase and app-store-notifications check the
-- bundle id first) and the database tests still use them.
INSERT INTO public.app_store_products (product_id, tier) VALUES
  ('com.pistack.debateowl.basic.monthly', 'basic'),
  ('com.pistack.debateowl.pro.monthly', 'pro')
ON CONFLICT (product_id) DO NOTHING;
