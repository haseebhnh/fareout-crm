-- ============================================================
-- HR — Branches (multi-location support).
--
-- The account/tenant model itself stays flat (Account -> Users — a
-- locked decision from earlier this session, revisited only when a
-- real multi-branch customer needed it, which is exactly what this
-- is). Branches are HR/operational data — which physical location an
-- employee works out of — not a change to tenancy or RBAC. A branch
-- does not get its own login or its own admin tier; account-level
-- admin+ still manages every branch, matching how departments work.
--
-- `employees.branch_id` lets Attendance/Roster/Reports scope by
-- location without inventing a second hierarchy alongside
-- manager_id — a company's reporting line and its physical branches
-- are independent axes (a manager can have reports across branches),
-- so this is deliberately its own column, not folded into the
-- existing manager chain.
-- ============================================================

CREATE TABLE IF NOT EXISTS branches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name        text NOT NULL,
  address     text,
  region      text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_account_name
  ON branches (account_id, lower(name));

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS branches_select ON branches;
DROP POLICY IF EXISTS branches_insert ON branches;
DROP POLICY IF EXISTS branches_update ON branches;
DROP POLICY IF EXISTS branches_delete ON branches;
CREATE POLICY branches_select ON branches FOR SELECT USING (is_account_member(account_id));
CREATE POLICY branches_insert ON branches FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY branches_update ON branches FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY branches_delete ON branches FOR DELETE USING (is_account_member(account_id, 'admin'));

ALTER TABLE employees ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees (branch_id);

-- Holidays can already be branch-specific in spirit (a location can
-- observe a local public holiday the rest of the company doesn't) —
-- add the column now that branches exist to reference.
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_holidays_branch ON holidays (branch_id);

-- Same for shifts — a branch can run different shift definitions
-- than another (e.g. a retail branch's opening hours vs a warehouse).
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_shifts_branch ON shifts (branch_id);
