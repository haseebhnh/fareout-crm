-- ============================================================
-- HR — Employee documents.
--
-- Unlike chat-media/flow-media (migrations 016/023, public buckets —
-- Meta needs to fetch the URL unauthenticated), `hr-documents` is
-- PRIVATE. A passport scan or signed contract must never be
-- reachable by a bare URL guess; every read goes through Storage RLS.
--
-- Path convention: hr-documents/account-<account_id>/employee-<employee_id>/<timestamp>-<name>.<ext>
-- The account segment gives tenant isolation (same shape as the
-- public buckets); the employee segment is what lets an employee read
-- their OWN documents without seeing a colleague's — matching the
-- self-vs-admin shape used everywhere else in HR. Upload/delete is
-- deliberately admin-only: HR manages documents, an employee doesn't
-- self-serve a passport upload into their own record (that would let
-- them plant an unreviewed document as if HR had verified it).
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  employee_id    uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  document_type  text NOT NULL DEFAULT 'other'
                   CHECK (document_type IN (
                     'passport', 'id', 'contract', 'visa', 'certificate', 'insurance', 'other'
                   )),
  storage_path   text NOT NULL,
  file_name      text NOT NULL,
  issue_date     date,
  expiry_date    date,
  notes          text,
  uploaded_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_documents_account_employee
  ON employee_documents (account_id, employee_id);
-- Powers the expiry-reminder query ("documents expiring in the next
-- N days") without a table scan.
CREATE INDEX IF NOT EXISTS idx_employee_documents_expiry
  ON employee_documents (account_id, expiry_date) WHERE expiry_date IS NOT NULL;

ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_documents_select ON employee_documents;
DROP POLICY IF EXISTS employee_documents_insert ON employee_documents;
DROP POLICY IF EXISTS employee_documents_update ON employee_documents;
DROP POLICY IF EXISTS employee_documents_delete ON employee_documents;

CREATE POLICY employee_documents_select ON employee_documents FOR SELECT USING (
  is_account_member(account_id, 'admin')
  OR EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = employee_documents.employee_id AND e.user_id = auth.uid()
  )
);
CREATE POLICY employee_documents_insert ON employee_documents FOR INSERT WITH CHECK (
  is_account_member(account_id, 'admin')
);
CREATE POLICY employee_documents_update ON employee_documents FOR UPDATE USING (
  is_account_member(account_id, 'admin')
);
CREATE POLICY employee_documents_delete ON employee_documents FOR DELETE USING (
  is_account_member(account_id, 'admin')
);

-- ============================================================
-- Storage bucket + RLS
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hr-documents',
  'hr-documents',
  FALSE,
  16777216, -- 16 MB, matches the other account-scoped buckets
  ARRAY[
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "HR documents readable by admin or the document owner" ON storage.objects;
CREATE POLICY "HR documents readable by admin or the document owner"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'hr-documents'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid()
          AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
          AND p.account_role IN ('admin', 'owner')
      )
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.user_id = auth.uid()
          AND ('employee-' || e.id::text) = (storage.foldername(name))[2]
      )
    )
  );

DROP POLICY IF EXISTS "Admins can upload HR documents" ON storage.objects;
CREATE POLICY "Admins can upload HR documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'hr-documents'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
        AND p.account_role IN ('admin', 'owner')
    )
  );

DROP POLICY IF EXISTS "Admins can delete HR documents" ON storage.objects;
CREATE POLICY "Admins can delete HR documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'hr-documents'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
        AND p.account_role IN ('admin', 'owner')
    )
  );
