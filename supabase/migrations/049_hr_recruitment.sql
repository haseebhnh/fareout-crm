-- ============================================================
-- HR — Recruitment: job openings, candidates, interviews.
--
-- `candidates.stage` IS the pipeline (Applied -> Screening ->
-- Interview -> Assessment -> Offer -> Hired -> Rejected) — a plain
-- text column with a CHECK, not a separate `pipeline_stages` table.
-- Unlike CRM deal pipelines (which are genuinely tenant-configurable,
-- see migration 017), recruitment stages are a fixed, well-known
-- sequence; adding tenant-configurable recruitment pipelines is real
-- future work but not needed for this to be a working feature today.
--
-- Interviews get their own RLS tier, tighter than job_openings/
-- candidates — rule: "Interviewers must only see permitted candidate
-- information." An interviewer sees interviews they're assigned to;
-- admin+ sees everything. Scheduling stays admin-only (HR coordinates
-- interviews, an interviewer doesn't self-assign).
-- ============================================================

CREATE TABLE IF NOT EXISTS job_openings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title           text NOT NULL,
  department_id   uuid REFERENCES departments(id) ON DELETE SET NULL,
  designation_id  uuid REFERENCES designations(id) ON DELETE SET NULL,
  employment_type text NOT NULL DEFAULT 'full_time'
                    CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'intern')),
  description     text,
  requirements    text,
  openings_count  integer NOT NULL DEFAULT 1 CHECK (openings_count > 0),
  status          text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'on_hold', 'closed')),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_openings_account_status
  ON job_openings (account_id, status);

DROP TRIGGER IF EXISTS set_updated_at ON job_openings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON job_openings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS candidates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  full_name      text NOT NULL,
  email          text,
  phone          text,
  source         text,
  job_opening_id uuid REFERENCES job_openings(id) ON DELETE SET NULL,
  resume_url     text,
  notes          text,
  stage          text NOT NULL DEFAULT 'applied'
                   CHECK (stage IN ('applied', 'screening', 'interview', 'assessment', 'offer', 'hired', 'rejected')),
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidates_account_stage
  ON candidates (account_id, stage);
CREATE INDEX IF NOT EXISTS idx_candidates_job_opening
  ON candidates (job_opening_id);

DROP TRIGGER IF EXISTS set_updated_at ON candidates;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON candidates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS interviews (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  candidate_id    uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  interviewer_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  scheduled_at    timestamptz NOT NULL,
  type            text NOT NULL DEFAULT 'video'
                    CHECK (type IN ('phone', 'video', 'onsite')),
  location_or_link text,
  notes           text,
  evaluation      text,
  result          text NOT NULL DEFAULT 'pending'
                    CHECK (result IN ('pending', 'pass', 'fail')),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interviews_account_candidate
  ON interviews (account_id, candidate_id);
CREATE INDEX IF NOT EXISTS idx_interviews_interviewer
  ON interviews (interviewer_id);

DROP TRIGGER IF EXISTS set_updated_at ON interviews;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON interviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE job_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_openings_select ON job_openings;
DROP POLICY IF EXISTS job_openings_insert ON job_openings;
DROP POLICY IF EXISTS job_openings_update ON job_openings;
DROP POLICY IF EXISTS job_openings_delete ON job_openings;
CREATE POLICY job_openings_select ON job_openings FOR SELECT USING (is_account_member(account_id));
CREATE POLICY job_openings_insert ON job_openings FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY job_openings_update ON job_openings FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY job_openings_delete ON job_openings FOR DELETE USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS candidates_select ON candidates;
DROP POLICY IF EXISTS candidates_insert ON candidates;
DROP POLICY IF EXISTS candidates_update ON candidates;
DROP POLICY IF EXISTS candidates_delete ON candidates;
CREATE POLICY candidates_select ON candidates FOR SELECT USING (is_account_member(account_id));
CREATE POLICY candidates_insert ON candidates FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY candidates_update ON candidates FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY candidates_delete ON candidates FOR DELETE USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS interviews_select ON interviews;
DROP POLICY IF EXISTS interviews_insert ON interviews;
DROP POLICY IF EXISTS interviews_update ON interviews;
DROP POLICY IF EXISTS interviews_delete ON interviews;

-- Rule: interviewers only see interviews permitted to them.
CREATE POLICY interviews_select ON interviews FOR SELECT USING (
  is_account_member(account_id, 'admin') OR interviewer_id = auth.uid()
);
CREATE POLICY interviews_insert ON interviews FOR INSERT WITH CHECK (
  is_account_member(account_id, 'admin')
);
-- Admin schedules/reschedules; the assigned interviewer may record
-- their own evaluation/result without needing admin role.
CREATE POLICY interviews_update ON interviews FOR UPDATE USING (
  is_account_member(account_id, 'admin') OR interviewer_id = auth.uid()
);
CREATE POLICY interviews_delete ON interviews FOR DELETE USING (
  is_account_member(account_id, 'admin')
);
