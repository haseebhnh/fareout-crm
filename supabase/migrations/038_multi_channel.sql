-- ============================================================
-- 038_multi_channel.sql — conversations stop being WhatsApp-only
--
-- Until now a conversation was implicitly a WhatsApp thread: a contact
-- was keyed by phone number, and one contact had exactly one
-- conversation. Every other channel (Instagram, Messenger, website
-- chat, email) was blocked on that assumption rather than on the
-- channel integration itself.
--
-- This migration introduces the channel dimension underneath the
-- existing model. It is additive and backwards compatible: every
-- existing row is WhatsApp, the app keeps working unchanged, and each
-- channel can then be switched on independently.
--
-- Four changes:
--
--   1. conversations.channel — which channel the thread belongs to.
--      Defaults to 'whatsapp' so existing rows are correct without a
--      backfill pass.
--
--   2. The (account_id, contact_id) unique index becomes
--      (account_id, contact_id, channel). One person messaging you on
--      both WhatsApp and Instagram is two threads, not a collision.
--      Migration 036 added the two-column version to stop duplicate
--      conversations; this preserves that guarantee per channel.
--
--   3. contacts.phone becomes nullable. An Instagram DM gives you a
--      scoped user id and a handle, never a phone number. The unique
--      index from migration 022 is already partial
--      (WHERE phone_normalized <> ''), so contacts without a phone do
--      not collide with each other.
--
--   4. channel_identities — how an external account maps to a contact.
--      A person is one contact with several identities (a phone, an
--      Instagram-scoped id, a Page-scoped id), which is what lets the
--      timeline show every channel against one customer.
--
--   5. channel_connections — per-account, per-channel credentials.
--      whatsapp_config stays where it is: it carries WhatsApp-specific
--      columns (waba_id, registration state, PIN) that do not
--      generalise, and moving it would be a risky rewrite of working
--      code for no functional gain. New channels use this table.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ---- 1. Channel on conversations -------------------------------------

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversations_channel_check'
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT conversations_channel_check
      CHECK (channel IN ('whatsapp', 'instagram', 'messenger', 'website', 'email'));
  END IF;
END $$;

-- ---- 2. Uniqueness is per channel, not per contact --------------------

DROP INDEX IF EXISTS idx_conversations_account_contact;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_account_contact_channel
  ON conversations (account_id, contact_id, channel);

-- Inbox queries filter by channel once more than one is connected.
CREATE INDEX IF NOT EXISTS idx_conversations_account_channel
  ON conversations (account_id, channel);

-- ---- 3. A contact no longer requires a phone number --------------------

ALTER TABLE contacts ALTER COLUMN phone DROP NOT NULL;

-- ---- 4. External identity -> contact ----------------------------------

CREATE TABLE IF NOT EXISTS channel_identities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id  uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel     text NOT NULL,
  -- The channel's own id for this person: an IGSID, a Page-scoped id,
  -- a visitor uuid, an email address. Opaque to us.
  external_id text NOT NULL,
  -- Whatever the channel gives us to show a human: @handle, display
  -- name. Nullable — some channels give nothing until the first reply.
  display_name text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channel_identities_channel_check
    CHECK (channel IN ('whatsapp', 'instagram', 'messenger', 'website', 'email'))
);

-- The lookup every inbound webhook performs: "who is this?". Unique so
-- a retried delivery cannot create a second contact for one person —
-- the same duplicate-under-concurrency bug migrations 022 and 036 had
-- to clean up after, avoided here from the start.
CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_identities_lookup
  ON channel_identities (account_id, channel, external_id);

CREATE INDEX IF NOT EXISTS idx_channel_identities_contact
  ON channel_identities (contact_id);

ALTER TABLE channel_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS channel_identities_select ON channel_identities;
CREATE POLICY channel_identities_select ON channel_identities FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS channel_identities_insert ON channel_identities;
CREATE POLICY channel_identities_insert ON channel_identities FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS channel_identities_update ON channel_identities;
CREATE POLICY channel_identities_update ON channel_identities FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS channel_identities_delete ON channel_identities;
CREATE POLICY channel_identities_delete ON channel_identities FOR DELETE
  USING (is_account_member(account_id, 'admin'));

-- ---- 5. Per-account channel credentials -------------------------------

CREATE TABLE IF NOT EXISTS channel_connections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  channel     text NOT NULL,
  -- The channel's own id for the *business* side: an IG business
  -- account id, a Facebook Page id, an inbound email address.
  external_id text NOT NULL,
  display_name text,
  -- AES-256-GCM encrypted, same as whatsapp_config.access_token. Never
  -- store a channel credential in plaintext: it can read and send as
  -- the customer's business account.
  access_token text,
  -- Per-connection webhook verification secret, encrypted. Same role
  -- as whatsapp_config.app_secret (migration 037).
  app_secret  text,
  status      text NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('connected', 'disconnected', 'error')),
  last_error  text,
  connected_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channel_connections_channel_check
    CHECK (channel IN ('instagram', 'messenger', 'website', 'email'))
);

-- One connection per channel per account.
CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_connections_account_channel
  ON channel_connections (account_id, channel);

-- Inbound webhooks resolve the account from the external id, exactly
-- as the WhatsApp webhook resolves it from phone_number_id. Unique so
-- two accounts cannot claim the same Page or IG account — the
-- ambiguity that silently dropped inbound messages in issue #136.
CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_connections_external
  ON channel_connections (channel, external_id);

ALTER TABLE channel_connections ENABLE ROW LEVEL SECURITY;

-- Settings-class, mirroring webhook_endpoints: any member may see what
-- is connected; only admin+ may change it.
DROP POLICY IF EXISTS channel_connections_select ON channel_connections;
CREATE POLICY channel_connections_select ON channel_connections FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS channel_connections_insert ON channel_connections;
CREATE POLICY channel_connections_insert ON channel_connections FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS channel_connections_update ON channel_connections;
CREATE POLICY channel_connections_update ON channel_connections FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS channel_connections_delete ON channel_connections;
CREATE POLICY channel_connections_delete ON channel_connections FOR DELETE
  USING (is_account_member(account_id, 'admin'));

COMMENT ON TABLE channel_identities IS
  'Maps a channel-specific external id (IGSID, Page-scoped id, email, '
  'visitor uuid) to a contact, so one person messaging on several '
  'channels is one customer with one timeline.';

COMMENT ON TABLE channel_connections IS
  'Per-account credentials for non-WhatsApp channels. WhatsApp keeps '
  'its own whatsapp_config table, which carries WABA-specific columns '
  'that do not generalise.';
