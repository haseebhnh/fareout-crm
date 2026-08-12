-- ============================================================
-- Ootrix Core — product subscription state.
--
-- Foundation for the multi-product platform (crm.ootrix.com,
-- hr.ootrix.com, etc.): which products a given account can reach.
-- `enabled_products` is a plain text array rather than a join table —
-- there is no per-product metadata to normalize yet (no plan tiers,
-- no per-seat limits), just a whitelist an account either has a
-- product on or doesn't. If/when billing (rule #30) needs richer
-- state (trial expiry, seat counts, feature flags per product), this
-- becomes the natural place to add a `product_subscriptions` table
-- FK'd to `accounts` rather than reshaping this column.
--
-- 'crm' ships enabled by default for every existing and new account —
-- it's the only product with a real implementation today. Every other
-- product id is reserved (see src/lib/products/registry.ts) but not
-- granted to anyone until it actually exists, so a stray product id
-- in this array can never unlock a page that doesn't exist yet.
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS enabled_products text[] NOT NULL DEFAULT ARRAY['crm'];

COMMENT ON COLUMN accounts.enabled_products IS
  'Product ids this account may access (see src/lib/products/registry.ts). Server-side gate — never trust a client-side product switcher alone.';
