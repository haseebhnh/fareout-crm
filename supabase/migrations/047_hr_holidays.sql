-- ============================================================
-- HR — Holidays.
--
-- Configuration data (like leave_types) rather than personal data —
-- any member reads, admin+ manages. `recurring` means "same
-- month/day every year" (e.g. a national holiday); the row still
-- carries a concrete `date` for the next/current occurrence rather
-- than a separate recurrence rule, since recomputing "next Jan 1"
-- from a rule is more machinery than an admin re-adding a row once a
-- year is worth right now — this can grow a recurrence engine later
-- without a breaking schema change (recurring rows would just gain a
-- generated "next occurrence" instead of being hand-maintained).
-- ============================================================

CREATE TABLE IF NOT EXISTS holidays (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name        text NOT NULL,
  date        date NOT NULL,
  recurring   boolean NOT NULL DEFAULT false,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_holidays_account_date ON holidays (account_id, date);

ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS holidays_select ON holidays;
DROP POLICY IF EXISTS holidays_insert ON holidays;
DROP POLICY IF EXISTS holidays_update ON holidays;
DROP POLICY IF EXISTS holidays_delete ON holidays;
CREATE POLICY holidays_select ON holidays FOR SELECT USING (is_account_member(account_id));
CREATE POLICY holidays_insert ON holidays FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY holidays_update ON holidays FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY holidays_delete ON holidays FOR DELETE USING (is_account_member(account_id, 'admin'));
