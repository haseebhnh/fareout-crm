-- ============================================================
-- HR — manager-chain (hierarchy-based) visibility and approvals.
--
-- Until now every HR personal-data table used a flat two-tier model:
-- admin+ sees everything, an employee sees only their own row. That
-- doesn't match how HR actually reports — a manager needs to see
-- and act on their DIRECT AND INDIRECT REPORTS' attendance, leave,
-- goals, performance, and documents, without being handed full
-- tenant-admin rights (which would also let them rename the account,
-- change billing, remove other admins, etc.).
--
-- `employees.manager_id` (migration 044) already encodes the org
-- chart. `is_manager_of` walks that chain with a recursive CTE and
-- answers "is the caller somewhere above this employee?" — the same
-- SECURITY DEFINER + pinned search_path shape as `is_account_member`,
-- for the same reason (a privilege-escalation vector if a caller
-- could shadow a referenced object).
--
-- This does NOT introduce a granular hr.* permission-string engine.
-- The existing RBAC tiers (admin/agent/viewer) plus this one new
-- axis (manager-of) is layered access, not a second engine — every
-- check below is still `is_account_member(...)` OR `is_manager_of(...)`
-- OR "this is my own row", composed, not a new permission model.
-- ============================================================

CREATE OR REPLACE FUNCTION is_manager_of(p_employee_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_caller_employee_id uuid;
  v_current uuid;
  v_depth int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT id INTO v_caller_employee_id FROM employees WHERE user_id = auth.uid();
  IF v_caller_employee_id IS NULL THEN
    RETURN false;
  END IF;

  -- Walk UP from the target employee's manager chain looking for the
  -- caller. Depth-capped at 20 (a deeper real-world org chart would
  -- indicate a data problem, not a legitimate hierarchy) so a
  -- corrupted/cyclic manager_id chain can't spin this forever.
  v_current := (SELECT manager_id FROM employees WHERE id = p_employee_id);
  WHILE v_current IS NOT NULL AND v_depth < 20 LOOP
    IF v_current = v_caller_employee_id THEN
      RETURN true;
    END IF;
    v_current := (SELECT manager_id FROM employees WHERE id = v_current);
    v_depth := v_depth + 1;
  END LOOP;

  RETURN false;
END;
$$;

ALTER FUNCTION is_manager_of(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION is_manager_of(uuid) TO authenticated, service_role;

-- ============================================================
-- Extend read access: admin, the employee themself, OR their manager
-- (at any depth) can read. Existing policies are replaced (not
-- added to) so there is exactly one SELECT policy per table to
-- reason about, matching the file's own established shape.
-- ============================================================

DROP POLICY IF EXISTS attendance_select ON attendance_records;
CREATE POLICY attendance_select ON attendance_records FOR SELECT USING (
  is_account_member(account_id, 'admin')
  OR is_manager_of(employee_id)
  OR EXISTS (SELECT 1 FROM employees e WHERE e.id = attendance_records.employee_id AND e.user_id = auth.uid())
);

DROP POLICY IF EXISTS leave_requests_select ON leave_requests;
CREATE POLICY leave_requests_select ON leave_requests FOR SELECT USING (
  is_account_member(account_id, 'admin')
  OR is_manager_of(employee_id)
  OR EXISTS (SELECT 1 FROM employees e WHERE e.id = leave_requests.employee_id AND e.user_id = auth.uid())
);

DROP POLICY IF EXISTS roster_select ON roster_assignments;
CREATE POLICY roster_select ON roster_assignments FOR SELECT USING (
  is_account_member(account_id, 'admin')
  OR is_manager_of(employee_id)
  OR EXISTS (SELECT 1 FROM employees e WHERE e.id = roster_assignments.employee_id AND e.user_id = auth.uid())
);

DROP POLICY IF EXISTS goals_select ON goals;
CREATE POLICY goals_select ON goals FOR SELECT USING (
  is_account_member(account_id, 'admin')
  OR is_manager_of(employee_id)
  OR EXISTS (SELECT 1 FROM employees e WHERE e.id = goals.employee_id AND e.user_id = auth.uid())
);

DROP POLICY IF EXISTS performance_reviews_select ON performance_reviews;
CREATE POLICY performance_reviews_select ON performance_reviews FOR SELECT USING (
  is_account_member(account_id, 'admin')
  OR is_manager_of(employee_id)
  OR EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = performance_reviews.employee_id AND e.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS employee_documents_select ON employee_documents;
CREATE POLICY employee_documents_select ON employee_documents FOR SELECT USING (
  is_account_member(account_id, 'admin')
  OR is_manager_of(employee_id)
  OR EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = employee_documents.employee_id AND e.user_id = auth.uid()
  )
);

-- ============================================================
-- Extend write access where "approve/correct my report's record" is
-- exactly what a manager needs to do without full admin rights.
-- ============================================================

-- Leave approval: a manager may decide on their own reports'
-- requests, same as admin — matches how the /hr/leave approval
-- queue already worked for admins.
DROP POLICY IF EXISTS leave_requests_update_manager ON leave_requests;
CREATE POLICY leave_requests_update_manager ON leave_requests FOR UPDATE USING (
  is_manager_of(employee_id)
);

-- Attendance correction: a manager may correct their reports' rows,
-- same shape as attendance_update_admin.
DROP POLICY IF EXISTS attendance_update_manager ON attendance_records;
CREATE POLICY attendance_update_manager ON attendance_records FOR UPDATE USING (
  is_manager_of(employee_id)
);
DROP POLICY IF EXISTS attendance_insert_manager ON attendance_records;
CREATE POLICY attendance_insert_manager ON attendance_records FOR INSERT WITH CHECK (
  is_manager_of(employee_id)
);
