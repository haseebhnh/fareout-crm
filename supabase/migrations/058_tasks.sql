-- ============================================================
-- Tasks — the platform's own product (task.ootrix.com), not an
-- HR-only concept. Deliberately mirrors `deals`' RLS shape exactly:
-- any account member reads, agent+ manages any task account-wide
-- (`assigned_to` is a filter, like deals.assigned_to, not a second
-- ownership tier) — no new permission engine, same pattern already
-- proven for deals/contacts/conversations.
--
-- Optional `contact_id`/`deal_id` let a task hang off a CRM record
-- without requiring one — a task can be pure to-do work.
-- ============================================================

CREATE TABLE IF NOT EXISTS tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text,
  assigned_to  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  contact_id   uuid REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id      uuid REFERENCES deals(id) ON DELETE SET NULL,
  due_date     date,
  priority     text NOT NULL DEFAULT 'medium'
                 CHECK (priority IN ('low', 'medium', 'high')),
  status       text NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_account_id ON tasks (account_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks (assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_account_status ON tasks (account_id, status);

DROP TRIGGER IF EXISTS set_updated_at ON tasks;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasks_select ON tasks;
DROP POLICY IF EXISTS tasks_insert ON tasks;
DROP POLICY IF EXISTS tasks_update ON tasks;
DROP POLICY IF EXISTS tasks_delete ON tasks;

CREATE POLICY tasks_select ON tasks FOR SELECT USING (is_account_member(account_id));
CREATE POLICY tasks_insert ON tasks FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY tasks_update ON tasks FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY tasks_delete ON tasks FOR DELETE USING (is_account_member(account_id, 'agent'));
