-- ============================================================
-- HR — Candidate -> Employee conversion + onboarding checklist.
--
-- `candidates.converted_employee_id` links a hired candidate to the
-- EXISTING employees table (044) — this is the "Create Employee"
-- action, not a second employee record. It's also the guard against
-- converting the same candidate twice (the UI checks it, but the
-- column existing at all is what makes "has this candidate already
-- been converted" a real question with a real answer instead of
-- something only the UI remembers).
--
-- `employee_onboarding_items` is a deliberately small, HR-specific
-- checklist — NOT the generic cross-product Tasks entity (that
-- product doesn't exist yet, per the platform roadmap: HR is being
-- finished before Tasks starts). Onboarding needs *some* checklist
-- today; when Tasks ships, onboarding can migrate onto it rather
-- than this staying HR-only forever, but blocking onboarding on a
-- product that isn't built yet would just mean onboarding doesn't
-- exist.
-- ============================================================

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS converted_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS employee_onboarding_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  title       text NOT NULL,
  is_done     boolean NOT NULL DEFAULT false,
  due_date    date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_items_employee
  ON employee_onboarding_items (employee_id);

DROP TRIGGER IF EXISTS set_updated_at ON employee_onboarding_items;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON employee_onboarding_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE employee_onboarding_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS onboarding_items_select ON employee_onboarding_items;
DROP POLICY IF EXISTS onboarding_items_insert ON employee_onboarding_items;
DROP POLICY IF EXISTS onboarding_items_update ON employee_onboarding_items;
DROP POLICY IF EXISTS onboarding_items_delete ON employee_onboarding_items;

-- Same self-vs-admin shape as the rest of HR's personal-data tables
-- (attendance/leave/goals/etc.) — a new hire should be able to see
-- (and tick off) their own onboarding checklist, not just have HR
-- watch it happen.
CREATE POLICY onboarding_items_select ON employee_onboarding_items FOR SELECT USING (
  is_account_member(account_id, 'admin')
  OR is_manager_of(employee_id)
  OR EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = employee_onboarding_items.employee_id AND e.user_id = auth.uid()
  )
);
CREATE POLICY onboarding_items_insert ON employee_onboarding_items FOR INSERT WITH CHECK (
  is_account_member(account_id, 'admin')
);
-- The employee (or their manager) may tick items done; only admin
-- can retarget/retitle/delete the checklist itself.
CREATE POLICY onboarding_items_update ON employee_onboarding_items FOR UPDATE USING (
  is_account_member(account_id, 'admin')
  OR is_manager_of(employee_id)
  OR EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = employee_onboarding_items.employee_id AND e.user_id = auth.uid()
  )
);
CREATE POLICY onboarding_items_delete ON employee_onboarding_items FOR DELETE USING (
  is_account_member(account_id, 'admin')
);

-- Same restriction shape as goals_restrict_self_update_fields (050):
-- a non-admin caller (the employee themself, or their manager) may
-- only flip is_done, not retitle or reschedule the checklist item.
CREATE OR REPLACE FUNCTION onboarding_restrict_self_update_fields()
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
    OR NEW.due_date IS DISTINCT FROM OLD.due_date
    OR NEW.account_id IS DISTINCT FROM OLD.account_id
  THEN
    RAISE EXCEPTION 'Only is_done may be updated by the employee or their manager';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS onboarding_restrict_self_update ON employee_onboarding_items;
CREATE TRIGGER onboarding_restrict_self_update
  BEFORE UPDATE ON employee_onboarding_items
  FOR EACH ROW EXECUTE FUNCTION onboarding_restrict_self_update_fields();
