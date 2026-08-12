-- ============================================================
-- HR — Recruitment intake foundation.
--
-- Extends the EXISTING recruitment schema (049) — no candidates_v2,
-- no second pipeline, no new stage list. Two things this session's
-- intake work structurally needs that 049 didn't have yet:
--
-- 1. Candidate profile fields (source of CV intake, parsed resume
--    data, screening flags) — added as columns on the existing
--    `candidates` table, not a new table.
--
-- 2. Candidate vs. Application. 049's `candidates` conflated the two:
--    one candidate row = one job + one stage. The spec is explicit —
--    "one candidate may apply to multiple jobs... do not duplicate
--    the person." `candidate_applications` is the new table for
--    that, one row per (candidate, job). It does NOT replace
--    `candidates.job_opening_id`/`stage` — those stay as a
--    denormalized "primary application" so the EXISTING /hr/recruitment
--    pipeline UI keeps working with zero code changes (rule: don't
--    touch the existing pipeline). A trigger keeps them in sync with
--    whichever application was most recently touched. Multi-job
--    candidates are visible via candidate_applications even though
--    the existing UI only surfaces the primary one — the follow-up
--    (a UI that lists every application per candidate) is real work
--    for a later pass, not faked here.
-- ============================================================

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS current_job text,
  ADD COLUMN IF NOT EXISTS total_experience_years numeric,
  ADD COLUMN IF NOT EXISTS skills text[],
  ADD COLUMN IF NOT EXISTS education text,
  ADD COLUMN IF NOT EXISTS expected_salary text,
  ADD COLUMN IF NOT EXISTS notice_period text,
  -- Path in the new candidate-cvs private bucket. `resume_url` (049)
  -- stays as a free-text external link field (a candidate's LinkedIn/
  -- portfolio, or a URL pasted in manually) — this is specifically the
  -- uploaded-file case, kept separate rather than overloading one
  -- column with two different meanings.
  ADD COLUMN IF NOT EXISTS resume_storage_path text,
  -- Structured screening flags HR fills in (rule #16) — free-form
  -- jsonb rather than named columns per flag, since the set of
  -- screening criteria genuinely varies per job/tenant (a sales role
  -- cares about a driving license, an engineering role doesn't).
  ADD COLUMN IF NOT EXISTS screening jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- AI match score (rule #17) — nullable (no score until computed),
  -- HR-editable/overridable per the rule that it's never the sole
  -- basis for rejection.
  ADD COLUMN IF NOT EXISTS match_score numeric,
  ADD COLUMN IF NOT EXISTS parsed_at timestamptz;

-- Source is now a closed set (rule #13's examples), matching the
-- pattern every other HR status/type column in this codebase uses
-- (CHECK, not free text) — was an unconstrained text column in 049.
ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_source_check;
ALTER TABLE candidates ADD CONSTRAINT candidates_source_check
  CHECK (source IS NULL OR source IN ('email', 'whatsapp', 'website', 'manual', 'referral', 'job_portal'));

CREATE TABLE IF NOT EXISTS candidate_applications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  candidate_id   uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_opening_id uuid REFERENCES job_openings(id) ON DELETE SET NULL,
  stage          text NOT NULL DEFAULT 'applied'
                   CHECK (stage IN ('applied', 'screening', 'interview', 'assessment', 'offer', 'hired', 'rejected')),
  source         text CHECK (source IS NULL OR source IN ('email', 'whatsapp', 'website', 'manual', 'referral', 'job_portal')),
  applied_at     timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- One application per (candidate, job) — re-applying to the same
  -- opening updates the existing application, it doesn't fork a
  -- second one.
  UNIQUE (candidate_id, job_opening_id)
);

CREATE INDEX IF NOT EXISTS idx_candidate_applications_account_stage
  ON candidate_applications (account_id, stage);
CREATE INDEX IF NOT EXISTS idx_candidate_applications_candidate
  ON candidate_applications (candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_applications_job
  ON candidate_applications (job_opening_id);

DROP TRIGGER IF EXISTS set_updated_at ON candidate_applications;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON candidate_applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE candidate_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS candidate_applications_select ON candidate_applications;
DROP POLICY IF EXISTS candidate_applications_insert ON candidate_applications;
DROP POLICY IF EXISTS candidate_applications_update ON candidate_applications;
DROP POLICY IF EXISTS candidate_applications_delete ON candidate_applications;
-- Same tier as `candidates` itself (049) — recruitment coordination
-- is admin/HR work, any member reads.
CREATE POLICY candidate_applications_select ON candidate_applications FOR SELECT USING (is_account_member(account_id));
CREATE POLICY candidate_applications_insert ON candidate_applications FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY candidate_applications_update ON candidate_applications FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY candidate_applications_delete ON candidate_applications FOR DELETE USING (is_account_member(account_id, 'admin'));

-- Keep candidates.job_opening_id/stage synced to whichever application
-- was most recently created/updated, so the EXISTING /hr/recruitment
-- pipeline UI (which reads those two columns directly) reflects every
-- intake channel without any UI changes.
CREATE OR REPLACE FUNCTION sync_candidate_primary_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE candidates
  SET job_opening_id = NEW.job_opening_id,
      stage = NEW.stage
  WHERE id = NEW.candidate_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_candidate_primary_application ON candidate_applications;
CREATE TRIGGER trg_sync_candidate_primary_application
  AFTER INSERT OR UPDATE ON candidate_applications
  FOR EACH ROW EXECUTE FUNCTION sync_candidate_primary_application();

-- Backfill: every existing candidate's (job, stage, source) becomes
-- its first application row, so nothing already in the pipeline is
-- lost or orphaned by this migration.
INSERT INTO candidate_applications (account_id, candidate_id, job_opening_id, stage, source, applied_at)
SELECT account_id, id, job_opening_id, stage, source, created_at
FROM candidates
ON CONFLICT (candidate_id, job_opening_id) DO NOTHING;

-- ============================================================
-- Storage: private CV bucket. Same reasoning as hr-documents (051)
-- — a resume is personal data, must never be reachable by a bare
-- URL guess.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'candidate-cvs',
  'candidate-cvs',
  FALSE,
  16777216,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Admin-only, same account-scoped path convention as every other
-- private bucket (account-<account_id>/...).
DROP POLICY IF EXISTS "Admins can read candidate CVs" ON storage.objects;
CREATE POLICY "Admins can read candidate CVs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'candidate-cvs'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
        AND p.account_role IN ('admin', 'owner')
    )
  );

DROP POLICY IF EXISTS "Admins can upload candidate CVs" ON storage.objects;
CREATE POLICY "Admins can upload candidate CVs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'candidate-cvs'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
        AND p.account_role IN ('admin', 'owner')
    )
  );

DROP POLICY IF EXISTS "Admins can delete candidate CVs" ON storage.objects;
CREATE POLICY "Admins can delete candidate CVs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'candidate-cvs'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
        AND p.account_role IN ('admin', 'owner')
    )
  );
