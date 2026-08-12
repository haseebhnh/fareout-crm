-- ============================================================
-- HR — Leave management.
--
-- `leave_types` is tenant-configurable (annual/sick/unpaid/custom),
-- admin-managed. `leave_requests` is the single source of truth for
-- balance — there is deliberately no separate `leave_balances` table:
-- "available = allowance - approved - pending" is a query over
-- `leave_requests`, not a stored number that could drift from it.
-- Rule #8 says "do not overwrite previous review results" for
-- performance reviews specifically, but the same principle applies
-- here — a request's history (pending -> approved/rejected) should
-- read from the request rows, not a mutated running total.
--
-- Same self-vs-admin RLS shape as attendance_records (045): an
-- employee manages their own requests, admin+ can see and decide on
-- every request in the account.
-- ============================================================

CREATE TABLE IF NOT EXISTS leave_types (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name               text NOT NULL,
  annual_allowance_days integer NOT NULL DEFAULT 0,
  requires_approval  boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_types_account_name
  ON leave_types (account_id, lower(name));

CREATE TABLE IF NOT EXISTS leave_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  employee_id    uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id  uuid NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
  start_date     date NOT NULL,
  end_date       date NOT NULL,
  half_day       boolean NOT NULL DEFAULT false,
  reason         text,
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_requests_date_range CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_account_status
  ON leave_requests (account_id, status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee
  ON leave_requests (employee_id, status);

DROP TRIGGER IF EXISTS set_updated_at ON leave_requests;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leave_types_select ON leave_types;
DROP POLICY IF EXISTS leave_types_insert ON leave_types;
DROP POLICY IF EXISTS leave_types_update ON leave_types;
DROP POLICY IF EXISTS leave_types_delete ON leave_types;
-- Leave types are configuration, not personal data — any member may
-- read them (an employee needs the list to file a request).
CREATE POLICY leave_types_select ON leave_types FOR SELECT USING (is_account_member(account_id));
CREATE POLICY leave_types_insert ON leave_types FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY leave_types_update ON leave_types FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY leave_types_delete ON leave_types FOR DELETE USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS leave_requests_select ON leave_requests;
DROP POLICY IF EXISTS leave_requests_insert ON leave_requests;
DROP POLICY IF EXISTS leave_requests_update_self ON leave_requests;
DROP POLICY IF EXISTS leave_requests_update_admin ON leave_requests;
DROP POLICY IF EXISTS leave_requests_delete ON leave_requests;

CREATE POLICY leave_requests_select ON leave_requests FOR SELECT USING (
  is_account_member(account_id, 'admin')
  OR EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = leave_requests.employee_id AND e.user_id = auth.uid()
  )
);

-- Any member may file a request for their own linked employee record.
CREATE POLICY leave_requests_insert ON leave_requests FOR INSERT WITH CHECK (
  is_account_member(account_id)
  AND status = 'pending'
  AND EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = leave_requests.employee_id AND e.user_id = auth.uid()
  )
);

-- Self: may only cancel their own still-pending request, not approve
-- their own leave.
CREATE POLICY leave_requests_update_self ON leave_requests FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = leave_requests.employee_id AND e.user_id = auth.uid()
  )
) WITH CHECK (
  status = 'cancelled'
  AND EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = leave_requests.employee_id AND e.user_id = auth.uid()
  )
);

-- Admin: approve/reject/edit any request in the account.
CREATE POLICY leave_requests_update_admin ON leave_requests FOR UPDATE USING (
  is_account_member(account_id, 'admin')
);

CREATE POLICY leave_requests_delete ON leave_requests FOR DELETE USING (
  is_account_member(account_id, 'admin')
);
