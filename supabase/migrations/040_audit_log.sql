-- ============================================================
-- 040_audit_log.sql — general-purpose user-action audit trail
--
-- `automation_logs` (006) records what a *workflow* did. Nothing
-- records what a *person* did: who removed a teammate, who changed a
-- role, who edited the WhatsApp credentials, who deleted a contact.
-- That gap matters once this stops being a single-operator tool — a
-- commercial multi-tenant product needs to answer "who did this, and
-- when" without grepping server logs that do not survive a redeploy.
--
-- Design notes
--   - Account-scoped, one row per action. `actor_id` is nullable and
--     ON DELETE SET NULL: the row must outlive the user (a departed
--     employee's actions stay auditable), and some actions have no
--     human actor at all (a webhook-triggered automation, a cron job).
--   - `action` is a free-text namespaced string ('member.role_changed',
--     'contact.deleted', 'whatsapp_config.updated'), validated in the
--     app layer against `src/lib/audit/actions.ts` — a new action type
--     is a code change, not a migration, mirroring the webhook events[]
--     pattern in 028.
--   - `target_type` + `target_id` identify what was acted on, without a
--     foreign key: the target may be deleted (that is often exactly
--     what is being audited), and a single log table spanning contacts,
--     deals, members, config rows etc. cannot FK to all of them anyway.
--   - `before`/`after` are JSONB snapshots of the changed fields only,
--     not the whole row — keeps rows small and avoids ever storing a
--     credential column verbatim. Callers are responsible for
--     redacting secrets before logging; see the writer helper.
--   - `ip_address` and `user_agent` are nullable metadata for the
--     account's own investigation of suspicious activity, not intended
--     as a security boundary on their own.
--
-- RLS
--   Read-only for members. Any account member (viewer+) may read the
--   log — visibility into "what happened" is not itself sensitive, and
--   restricting it to admins only would stop a viewer noticing their
--   own account was compromised. No UPDATE or DELETE policy for
--   anyone: an audit log a normal user can edit is not an audit log.
--   All writes go through the service-role client from server-side
--   action handlers, mirroring automation_pending_executions (006).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  actor_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Denormalised at write time so the row still identifies who acted
  -- even after the user (and their profile.full_name) is gone.
  actor_label  text,
  action       text NOT NULL,
  target_type  text NOT NULL,
  target_id    text,
  target_label text,
  before       jsonb,
  after        jsonb,
  ip_address   text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- The dashboard view: this account's log, newest first.
CREATE INDEX IF NOT EXISTS idx_audit_log_account_created
  ON audit_log (account_id, created_at DESC);

-- "Show everything that happened to this contact/deal/etc."
CREATE INDEX IF NOT EXISTS idx_audit_log_target
  ON audit_log (account_id, target_type, target_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_select ON audit_log;
CREATE POLICY audit_log_select ON audit_log FOR SELECT
  USING (is_account_member(account_id));

-- No INSERT/UPDATE/DELETE policy for authenticated users at all.
-- Writes are service-role only (see src/lib/audit/log.ts), which is
-- what makes this tamper-evident: no client-held credential, however
-- privileged, can alter or remove a row through the API.

COMMENT ON TABLE audit_log IS
  'General user-action audit trail — who did what, to what, and when. '
  'Distinct from automation_logs (006), which records workflow '
  'execution rather than human/administrative actions. Read-only via '
  'RLS; all writes go through the service-role client.';
