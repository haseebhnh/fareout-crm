-- ============================================================
-- HR product — foundational entities: departments, designations,
-- employees.
--
-- Deliberately does NOT introduce a branch/region hierarchy on the
-- `accounts`/`profiles` core — that was an explicit locked decision
-- this session (flat Account -> Users, revisit only when an actual
-- multi-branch customer needs it). `departments` here is HR-specific
-- data (which team an employee sits in for HR purposes), not a
-- change to how tenancy or RBAC is modeled. An employee is NOT
-- necessarily an app user — HR needs to track people who don't have
-- an Ootrix login (e.g. factory staff), so `employees.user_id` is
-- nullable and only links to `profiles` when the employee also has
-- app access.
-- ============================================================

CREATE TABLE IF NOT EXISTS departments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_account_name
  ON departments (account_id, lower(name));

CREATE TABLE IF NOT EXISTS designations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_designations_account_title
  ON designations (account_id, lower(title));

CREATE TABLE IF NOT EXISTS employees (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- Nullable: an employee row can exist for someone with no Ootrix
  -- login (front-line/factory staff HR still needs to track).
  user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name         text NOT NULL,
  email             text,
  phone             text,
  department_id     uuid REFERENCES departments(id) ON DELETE SET NULL,
  designation_id    uuid REFERENCES designations(id) ON DELETE SET NULL,
  manager_id        uuid REFERENCES employees(id) ON DELETE SET NULL,
  employment_status text NOT NULL DEFAULT 'active'
                      CHECK (employment_status IN ('active', 'on_leave', 'terminated')),
  hired_at          date,
  terminated_at     date,
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employees_account_id ON employees (account_id);
CREATE INDEX IF NOT EXISTS idx_employees_account_status ON employees (account_id, employment_status);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees (department_id);
CREATE INDEX IF NOT EXISTS idx_employees_manager ON employees (manager_id);
-- A given app user is at most one employee row per account — prevents
-- accidentally creating two HR profiles for the same login.
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_account_user
  ON employees (account_id, user_id) WHERE user_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at ON employees;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE designations ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS departments_select ON departments;
DROP POLICY IF EXISTS departments_insert ON departments;
DROP POLICY IF EXISTS departments_update ON departments;
DROP POLICY IF EXISTS departments_delete ON departments;
CREATE POLICY departments_select ON departments FOR SELECT USING (is_account_member(account_id));
CREATE POLICY departments_insert ON departments FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY departments_update ON departments FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY departments_delete ON departments FOR DELETE USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS designations_select ON designations;
DROP POLICY IF EXISTS designations_insert ON designations;
DROP POLICY IF EXISTS designations_update ON designations;
DROP POLICY IF EXISTS designations_delete ON designations;
CREATE POLICY designations_select ON designations FOR SELECT USING (is_account_member(account_id));
CREATE POLICY designations_insert ON designations FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY designations_update ON designations FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY designations_delete ON designations FOR DELETE USING (is_account_member(account_id, 'admin'));

-- Employee records are personal HR data — every member may read (an
-- agent looking up their manager or a colleague's department), but
-- only admin+ may create/edit/remove, matching the members-tab role
-- gate used for account membership itself.
DROP POLICY IF EXISTS employees_select ON employees;
DROP POLICY IF EXISTS employees_insert ON employees;
DROP POLICY IF EXISTS employees_update ON employees;
DROP POLICY IF EXISTS employees_delete ON employees;
CREATE POLICY employees_select ON employees FOR SELECT USING (is_account_member(account_id));
CREATE POLICY employees_insert ON employees FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY employees_update ON employees FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY employees_delete ON employees FOR DELETE USING (is_account_member(account_id, 'admin'));
