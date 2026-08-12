-- ============================================================
-- HR — notifications, wired into the existing notification system
-- (migration 027), not a second engine. Same shape as
-- `notify_conversation_assigned`: a SECURITY DEFINER trigger inserts
-- the row, because `notifications` deliberately has no client INSERT
-- policy (rows are only ever system-generated, which is what makes
-- the notification feed trustworthy rather than something a client
-- could spam into another user's feed).
--
-- Two events, matching rule #22's list for what actually needs a
-- push rather than being fine as "visible next time you look":
--   - leave_requests: approved/rejected -> notify the employee.
--   - roster_assignments: a shift assigned/changed -> notify the
--     employee whose schedule just moved.
-- Document expiry is deliberately NOT wired to a push notification
-- here — the /hr/documents page's banner already surfaces it, and a
-- cron firing one notification per expiring document per day is
-- exactly the "excessive notifications" rule #18 warns against. If a
-- real cron-driven digest is wanted later, it belongs in
-- automations/cron-style code, not a per-row DB trigger.
-- ============================================================

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('conversation_assigned', 'leave_approved', 'leave_rejected', 'shift_assigned'));

CREATE OR REPLACE FUNCTION notify_leave_decision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient UUID;
  v_type TEXT;
BEGIN
  IF NEW.status = OLD.status OR NEW.status NOT IN ('approved', 'rejected') THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_recipient FROM employees WHERE id = NEW.employee_id;
  -- No linked login (e.g. an HR-only record with no Ootrix account) —
  -- nothing to notify.
  IF v_recipient IS NULL THEN
    RETURN NEW;
  END IF;

  v_type := CASE WHEN NEW.status = 'approved' THEN 'leave_approved' ELSE 'leave_rejected' END;

  INSERT INTO notifications (account_id, user_id, type, actor_user_id, title, body)
  VALUES (
    NEW.account_id,
    v_recipient,
    v_type,
    auth.uid(),
    CASE WHEN NEW.status = 'approved' THEN 'Leave request approved' ELSE 'Leave request rejected' END,
    NEW.start_date::text || ' – ' || NEW.end_date::text
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_leave_decision ON leave_requests;
CREATE TRIGGER trg_notify_leave_decision
  AFTER UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION notify_leave_decision();

CREATE OR REPLACE FUNCTION notify_shift_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient UUID;
  v_shift_name TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.shift_id IS NOT DISTINCT FROM OLD.shift_id THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_recipient FROM employees WHERE id = NEW.employee_id;
  IF v_recipient IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_shift_name FROM shifts WHERE id = NEW.shift_id;

  INSERT INTO notifications (account_id, user_id, type, actor_user_id, title, body)
  VALUES (
    NEW.account_id,
    v_recipient,
    'shift_assigned',
    auth.uid(),
    'Shift assigned',
    COALESCE(v_shift_name, 'Shift') || ' on ' || NEW.date::text
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_shift_assigned ON roster_assignments;
CREATE TRIGGER trg_notify_shift_assigned
  AFTER INSERT OR UPDATE ON roster_assignments
  FOR EACH ROW EXECUTE FUNCTION notify_shift_assigned();
