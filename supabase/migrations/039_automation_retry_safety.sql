-- ============================================================
-- 039_automation_retry_safety.sql — make delayed automations
-- survive failure and crashes
--
-- `automation_pending_executions` is the queue behind Wait steps. The
-- drain endpoint claims a row by flipping 'pending' -> 'running', which
-- is a correct lock: two overlapping cron invocations cannot both claim
-- the same row, because the UPDATE is conditional on the old status.
--
-- What it could not do is recover.
--
--   * If the step threw, the exception propagated out of the loop. The
--     row stayed 'running' forever — claimed, never finished, never
--     retried — and every row queued behind it in that batch was
--     skipped. One bad automation silently froze the queue.
--   * If the process died mid-step (deploy, timeout, OOM), the same
--     thing happened with no error anywhere.
--   * 'failed' existed in the CHECK constraint but nothing ever set it,
--     so the failure state was unreachable and unobservable.
--
-- Three columns make recovery possible:
--
--   attempts    — how many times this row has been claimed. Bounds
--                 retries so a permanently broken step cannot spin.
--   last_error  — why the most recent attempt failed. Without this the
--                 only diagnosis is reading server logs.
--   claimed_at  — when it was claimed. A row 'running' for longer than
--                 any plausible execution was orphaned by a crash, and
--                 can be safely re-queued.
--
-- Additive and backwards compatible: existing rows get attempts = 0 and
-- nulls, and behave exactly as before until the drain endpoint updates
-- them.
-- ============================================================

ALTER TABLE automation_pending_executions
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

ALTER TABLE automation_pending_executions
  ADD COLUMN IF NOT EXISTS last_error text;

ALTER TABLE automation_pending_executions
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- Finds rows orphaned by a crash. Partial, because it is only ever
-- queried for the 'running' subset, which is tiny.
CREATE INDEX IF NOT EXISTS idx_automation_pending_stale_running
  ON automation_pending_executions (claimed_at)
  WHERE status = 'running';

COMMENT ON COLUMN automation_pending_executions.attempts IS
  'Times this row has been claimed by the drain endpoint. Bounds '
  'retries so a permanently failing step cannot loop forever.';

COMMENT ON COLUMN automation_pending_executions.last_error IS
  'Error from the most recent failed attempt. Surfaced to admins '
  'rather than left only in server logs.';

COMMENT ON COLUMN automation_pending_executions.claimed_at IS
  'When status flipped to running. Rows stuck beyond the reclaim '
  'window were orphaned by a crash and are re-queued.';
