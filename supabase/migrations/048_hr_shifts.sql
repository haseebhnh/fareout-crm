-- ============================================================
-- HR — Shifts.
--
-- A shift is a reusable definition (name, times, working days) —
-- the roster (a later migration) assigns employees to a shift on
-- specific dates. `end_time < start_time` is how an overnight shift
-- (e.g. 22:00-07:00) is represented: no separate boolean needed, the
-- UI/roster logic treats that ordering as "ends the next day."
-- `working_days` is an int[] of ISO weekdays (1=Monday..7=Sunday)
-- rather than a bitmask — Postgres arrays are simple to query
-- (`2 = ANY(working_days)`) and don't need bit-twiddling in the app.
-- ============================================================

CREATE TABLE IF NOT EXISTS shifts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name            text NOT NULL,
  start_time      time NOT NULL,
  end_time        time NOT NULL,
  break_minutes   integer NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
  grace_minutes   integer NOT NULL DEFAULT 0 CHECK (grace_minutes >= 0),
  -- ISO weekday numbers, 1 (Monday) .. 7 (Sunday).
  working_days    integer[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5],
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shifts_account_name
  ON shifts (account_id, lower(name));

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shifts_select ON shifts;
DROP POLICY IF EXISTS shifts_insert ON shifts;
DROP POLICY IF EXISTS shifts_update ON shifts;
DROP POLICY IF EXISTS shifts_delete ON shifts;
CREATE POLICY shifts_select ON shifts FOR SELECT USING (is_account_member(account_id));
CREATE POLICY shifts_insert ON shifts FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY shifts_update ON shifts FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY shifts_delete ON shifts FOR DELETE USING (is_account_member(account_id, 'admin'));

-- ============================================================
-- Duty roster — assigns an employee to a shift on a specific date.
-- One row per (employee, date), same shape as attendance_records —
-- an employee has at most one shift assignment per day.
-- ============================================================

CREATE TABLE IF NOT EXISTS roster_assignments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  employee_id  uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift_id     uuid NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
  date         date NOT NULL,
  status       text NOT NULL DEFAULT 'scheduled'
                 CHECK (status IN ('scheduled', 'published', 'cancelled')),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_roster_employee_date
  ON roster_assignments (employee_id, date);
CREATE INDEX IF NOT EXISTS idx_roster_account_date
  ON roster_assignments (account_id, date);

DROP TRIGGER IF EXISTS set_updated_at ON roster_assignments;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON roster_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE roster_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roster_select ON roster_assignments;
DROP POLICY IF EXISTS roster_insert ON roster_assignments;
DROP POLICY IF EXISTS roster_update ON roster_assignments;
DROP POLICY IF EXISTS roster_delete ON roster_assignments;

-- Roster reads follow the same self-vs-admin shape as attendance —
-- an employee's schedule is personal data, seeing a colleague's shift
-- assignment isn't obviously fine by default the way a department
-- list is.
CREATE POLICY roster_select ON roster_assignments FOR SELECT USING (
  is_account_member(account_id, 'admin')
  OR EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = roster_assignments.employee_id AND e.user_id = auth.uid()
  )
);

-- Assignment is manager work — admin+ only, never self-service.
CREATE POLICY roster_insert ON roster_assignments FOR INSERT WITH CHECK (
  is_account_member(account_id, 'admin')
);
CREATE POLICY roster_update ON roster_assignments FOR UPDATE USING (
  is_account_member(account_id, 'admin')
);
CREATE POLICY roster_delete ON roster_assignments FOR DELETE USING (
  is_account_member(account_id, 'admin')
);
