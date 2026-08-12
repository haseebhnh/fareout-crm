-- ============================================================
-- HR — settings.
--
-- One row per account. Deliberately narrow: only settings that
-- actually change behavior somewhere in the code belong here. A
-- toggle with no consumer (e.g. "require location for check-in" when
-- no geofencing exists yet) would be a fake feature — worse than not
-- having a settings page at all, since it implies a capability that
-- isn't real. Attendance/shift/branch/recruitment configuration
-- already lives on their own real pages (/hr/shifts, /hr/branches,
-- /hr/holidays) — this table is for the settings that don't have an
-- obvious home of their own.
-- ============================================================

CREATE TABLE IF NOT EXISTS hr_settings (
  account_id                    uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  -- Consumed by /hr/documents' expiry banner (was hardcoded to 30).
  document_expiry_reminder_days integer NOT NULL DEFAULT 30 CHECK (document_expiry_reminder_days > 0),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at ON hr_settings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON hr_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE hr_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_settings_select ON hr_settings;
DROP POLICY IF EXISTS hr_settings_insert ON hr_settings;
DROP POLICY IF EXISTS hr_settings_update ON hr_settings;
-- Any member reads (the reminder threshold affects what they see on
-- /hr/documents); only admin+ changes it. No DELETE policy — a
-- missing row just means "defaults", deleting one is never useful.
CREATE POLICY hr_settings_select ON hr_settings FOR SELECT USING (is_account_member(account_id));
CREATE POLICY hr_settings_insert ON hr_settings FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY hr_settings_update ON hr_settings FOR UPDATE USING (is_account_member(account_id, 'admin'));

-- ============================================================
-- leave_types.requires_approval (046) has existed since the Leave
-- module shipped but was never actually consumed anywhere — every
-- request landed as 'pending' regardless. Now that Settings exposes
-- it as an editable toggle, wire it to real behavior: auto-approve on
-- submit when the type doesn't require approval. This has to be a
-- trigger, not app code — leave_requests_insert's WITH CHECK (046)
-- forces status='pending' at insert time for a self-submitted
-- request, so an employee's own client literally cannot insert an
-- already-approved row. A SECURITY DEFINER trigger runs after the
-- row exists and isn't subject to that INSERT check.
-- ============================================================

CREATE OR REPLACE FUNCTION auto_approve_leave_if_not_required()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requires_approval boolean;
BEGIN
  SELECT requires_approval INTO v_requires_approval
  FROM leave_types WHERE id = NEW.leave_type_id;

  IF v_requires_approval IS FALSE AND NEW.status = 'pending' THEN
    UPDATE leave_requests SET status = 'approved' WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_approve_leave ON leave_requests;
CREATE TRIGGER trg_auto_approve_leave
  AFTER INSERT ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION auto_approve_leave_if_not_required();
