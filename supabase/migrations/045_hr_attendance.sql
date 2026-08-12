-- ============================================================
-- HR — Attendance.
--
-- One row per (employee, date). Check-in/out are timestamps within
-- that row rather than separate event rows — a day's attendance is
-- naturally a single record that gets filled in over the day
-- (check-in now, check-out later, an admin correction after that),
-- and the unique (employee_id, date) constraint is what makes
-- "did they already check in today" a single indexed lookup instead
-- of a scan-and-aggregate.
--
-- RLS is intentionally NOT the same "any member reads" shape as
-- employees/departments — attendance is exactly the kind of personal
-- HR data the platform spec calls out by name ("Employee A must not
-- automatically see Employee B's restricted HR data"). A member sees
-- their own rows; admin+ sees every row in the account. There is no
-- branch/region/manager-scoped tier here — that hierarchy was an
-- explicit locked decision this session (flat Account -> Users,
-- revisit only when a real multi-branch customer needs it) and
-- inventing one just for HR would contradict that decision. Until
-- then "admin+" is the only manager-equivalent tier.
-- ============================================================

CREATE TABLE IF NOT EXISTS attendance_records (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  employee_id      uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date             date NOT NULL,
  check_in_at      timestamptz,
  check_out_at     timestamptz,
  status           text NOT NULL DEFAULT 'present'
                     CHECK (status IN ('present', 'absent', 'late', 'half_day', 'leave', 'holiday', 'week_off')),
  notes            text,
  -- Set only when an admin creates/edits a row on someone else's
  -- behalf (manual entry or correction) rather than the employee's
  -- own check-in/out — the audit trail already covers "what changed
  -- and by whom" (via audit_log), this column is what the UI reads
  -- to show "corrected" without an extra join.
  corrected_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  corrected_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_employee_date
  ON attendance_records (employee_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_account_date
  ON attendance_records (account_id, date);

DROP TRIGGER IF EXISTS set_updated_at ON attendance_records;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_select ON attendance_records;
DROP POLICY IF EXISTS attendance_insert_self ON attendance_records;
DROP POLICY IF EXISTS attendance_insert_admin ON attendance_records;
DROP POLICY IF EXISTS attendance_update_self ON attendance_records;
DROP POLICY IF EXISTS attendance_update_admin ON attendance_records;
DROP POLICY IF EXISTS attendance_delete ON attendance_records;

-- Read: your own rows, or every row if you're admin+.
CREATE POLICY attendance_select ON attendance_records FOR SELECT USING (
  is_account_member(account_id, 'admin')
  OR EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = attendance_records.employee_id AND e.user_id = auth.uid()
  )
);

-- Self check-in: any member may insert a row for their own linked
-- employee record, un-corrected (corrected_by must be null — an
-- employee cannot self-mark their own row as admin-corrected).
CREATE POLICY attendance_insert_self ON attendance_records FOR INSERT WITH CHECK (
  is_account_member(account_id)
  AND corrected_by IS NULL
  AND EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = attendance_records.employee_id AND e.user_id = auth.uid()
  )
);

-- Manual entry (any employee, corrected or not): admin+ only.
CREATE POLICY attendance_insert_admin ON attendance_records FOR INSERT WITH CHECK (
  is_account_member(account_id, 'admin')
);

-- Self check-out: an employee may update their own row's check-out
-- timestamp, but not retroactively mark it as an admin correction.
CREATE POLICY attendance_update_self ON attendance_records FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = attendance_records.employee_id AND e.user_id = auth.uid()
  )
) WITH CHECK (
  corrected_by IS NULL
  AND EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = attendance_records.employee_id AND e.user_id = auth.uid()
  )
);

-- Admin correction: full update rights on any row in the account.
CREATE POLICY attendance_update_admin ON attendance_records FOR UPDATE USING (
  is_account_member(account_id, 'admin')
);

CREATE POLICY attendance_delete ON attendance_records FOR DELETE USING (
  is_account_member(account_id, 'admin')
);
