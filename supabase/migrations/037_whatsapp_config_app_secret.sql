-- Per-account Meta App Secret.
--
-- Until now the webhook verified Meta's x-hub-signature-256 against a
-- single global META_APP_SECRET env var. That is correct only when every
-- tenant's WhatsApp number lives under *one* Meta app (the operator's).
-- Once each company brings its own Meta app, their payloads are signed
-- with their own secret and a single global value cannot verify them.
--
-- Stored AES-256-GCM-encrypted with ENCRYPTION_KEY, exactly like
-- access_token and verify_token on this table — it is a credential that
-- can forge webhook traffic, so it must never sit in plaintext.
--
-- Nullable on purpose: accounts that connect under the operator's Meta
-- app leave it empty and keep falling back to META_APP_SECRET. This
-- migration is therefore backwards compatible — existing deployments
-- behave identically until an account fills the field in.

alter table public.whatsapp_config
  add column if not exists app_secret text;

comment on column public.whatsapp_config.app_secret is
  'AES-256-GCM encrypted Meta App Secret (Meta → App Settings → Basic). '
  'Used to verify x-hub-signature-256 on inbound webhooks for this '
  'account. NULL means fall back to the global META_APP_SECRET env var.';
