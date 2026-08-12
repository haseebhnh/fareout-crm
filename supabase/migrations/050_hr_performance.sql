-- ============================================================
-- HR — Performance: goals and reviews.
--
-- `performance_reviews` is deliberately insert-only from RLS's
-- perspective — no UPDATE policy exists for it at all. Rule: "Do not
-- overwrite previous review results. Store historical reviews." A
-- correction is a new review row, not a mutated old one, the same
-- philosophy the audit log uses for its own history. Goals ARE
-- editable (progress genuinely changes over time), with a narrower
-- self-update carve-out: an employee may update their own goal's
-- `current_value` (reporting progress) but not retarget/reassign it.
--
-- Same self-vs-admin RLS shape as attendance/leave/roster — an
-- employee's goals and reviews are personal data.
-- ============================================================

CREATE TABLE IF NOT EXISTS goals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  employee_id    uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  title          text NOT NULL,
  description    text,
  kpi            text,
  target_value   numeric,
  current_value  numeric NOT NULL DEFAULT 0,
  unit           text,
  due_date       date,
  status         text NOT NULL DEFAULT 'in_progress'
                   CHECK (status IN ('not_started', 'in_progress', 'completed', 'missed')),
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goals_account_employee ON goals (account_id, employee_id);

DROP TRIGGER IF EXISTS set_updated_at ON goals;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS performance_reviews (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  employee_id          uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  reviewer_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  review_period_start  date NOT NULL,
  review_period_end    date NOT NULL,
  rating               numeric,
  comments             text,
  strengths            text,
  improvements         text,
  final_result         text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT performance_reviews_period CHECK (review_period_end >= review_period_start)
);

CREATE INDEX IF NOT EXISTS idx_perf_reviews_account_employee
  ON performance_reviews (account_id, employee_id);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS goals_select ON goals;
DROP POLICY IF EXISTS goals_insert ON goals;
DROP POLICY IF EXISTS goals_update_self ON goals;
DROP POLICY IF EXISTS goals_update_admin ON goals;
DROP POLICY IF EXISTS goals_delete ON goals;

CREATE POLICY goals_select ON goals FOR SELECT USING (
  is_account_member(account_id, 'admin')
  OR EXISTS (SELECT 1 FROM employees e WHERE e.id = goals.employee_id AND e.user_id = auth.uid())
);
-- Goal-setting is admin/manager work.
CREATE POLICY goals_insert ON goals FOR INSERT WITH CHECK (
  is_account_member(account_id, 'admin')
);
-- Self: progress reporting only — current_value and status, not the
-- target/assignment. A `WITH CHECK` can express "this column equals
-- this value" but not "no OTHER column changed", so column-level
-- restriction is enforced below by a BEFORE UPDATE trigger, not by
-- the policy itself.
CREATE POLICY goals_update_self ON goals FOR UPDATE USING (
  EXISTS (SELECT 1 FROM employees e WHERE e.id = goals.employee_id AND e.user_id = auth.uid())
);
CREATE POLICY goals_update_admin ON goals FOR UPDATE USING (
  is_account_member(account_id, 'admin')
);
CREATE POLICY goals_delete ON goals FOR DELETE USING (is_account_member(account_id, 'admin'));

-- Enforce the "self may only report progress" carve-out at the row
-- level: if the caller isn't admin+, every column except
-- current_value/status/updated_at must be unchanged. Runs for every
-- UPDATE (admin included) but is a no-op for admin since the OR
-- short-circuits — cheaper than branching in every call site on
-- "was this an admin update or a self update."
CREATE OR REPLACE FUNCTION goals_restrict_self_update_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF is_account_member(NEW.account_id, 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.employee_id IS DISTINCT FROM OLD.employee_id
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.kpi IS DISTINCT FROM OLD.kpi
    OR NEW.target_value IS DISTINCT FROM OLD.target_value
    OR NEW.unit IS DISTINCT FROM OLD.unit
    OR NEW.due_date IS DISTINCT FROM OLD.due_date
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.account_id IS DISTINCT FROM OLD.account_id
  THEN
    RAISE EXCEPTION 'Only current_value and status may be updated by the goal owner';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS goals_restrict_self_update ON goals;
CREATE TRIGGER goals_restrict_self_update
  BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION goals_restrict_self_update_fields();

DROP POLICY IF EXISTS performance_reviews_select ON performance_reviews;
DROP POLICY IF EXISTS performance_reviews_insert ON performance_reviews;
DROP POLICY IF EXISTS performance_reviews_delete ON performance_reviews;

CREATE POLICY performance_reviews_select ON performance_reviews FOR SELECT USING (
  is_account_member(account_id, 'admin')
  OR EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = performance_reviews.employee_id AND e.user_id = auth.uid()
  )
);
CREATE POLICY performance_reviews_insert ON performance_reviews FOR INSERT WITH CHECK (
  is_account_member(account_id, 'admin')
);
-- No UPDATE policy — reviews are immutable once written (see header).
-- Delete stays admin-only for genuine mistakes (e.g. wrong employee).
CREATE POLICY performance_reviews_delete ON performance_reviews FOR DELETE USING (
  is_account_member(account_id, 'admin')
);
