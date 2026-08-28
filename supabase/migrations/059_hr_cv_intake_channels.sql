-- ============================================================
-- HR — CV intake automation config (WhatsApp + inbound email).
--
-- Two new intake channels for the EXISTING recruitment pipeline
-- (candidates/candidate_applications, 049/055) — no new pipeline, no
-- new candidate table. Both channels funnel through the same
-- ingestion path: upload to the existing `candidate-cvs` bucket,
-- find-or-create a candidate by phone/email, optionally attach a
-- candidate_applications row against a default job opening.
--
-- WhatsApp: the existing webhook (already receiving real messages
-- per-account via whatsapp_config) gets a hook that fires when an
-- inbound document looks like a resume and this flag is on.
--
-- Email: a generic inbound webhook (/api/email/inbound) that any
-- mail-forwarding source can call — including a Microsoft 365 Power
-- Automate flow or mail rule the tenant admin sets up themselves,
-- since actually registering an Azure app / OAuth grant is something
-- only the tenant's own admin can authorize, not something this
-- migration or any server-side code can fabricate. The token below
-- is how that inbound call authenticates.
-- ============================================================

ALTER TABLE hr_settings
  ADD COLUMN IF NOT EXISTS whatsapp_cv_intake_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_cv_default_job_opening_id uuid REFERENCES job_openings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_cv_intake_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_cv_default_job_opening_id uuid REFERENCES job_openings(id) ON DELETE SET NULL,
  -- Bearer token the inbound email webhook checks. Generated once per
  -- account on first read (see application code) rather than here, so
  -- existing rows aren't forced to share one predictable default.
  ADD COLUMN IF NOT EXISTS email_intake_token text UNIQUE;
