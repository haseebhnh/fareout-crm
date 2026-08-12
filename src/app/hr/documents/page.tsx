'use client';

// ============================================================
// HR — Employee documents.
//
// Upload/delete is admin-only (RLS + storage policies both enforce
// this — see migration 051). An employee sees only their own
// documents, read + download, never someone else's — enforced by the
// storage SELECT policy matching the `employee-<id>` path segment
// against the caller's own linked employee row, not just by this
// page filtering client-side.
//
// Expiry reminders: computed at render time from `expiry_date`, not
// a separate notification row — rule #18 says "do not create
// excessive notifications," and a page that already highlights
// what's expiring is cheaper and less noisy than a cron job firing
// in-app notifications for every document every day.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileText, Plus, Loader2, Trash2, Download, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface Employee {
  id: string;
  full_name: string;
}

interface Doc {
  id: string;
  employee_id: string;
  document_type: string;
  storage_path: string;
  file_name: string;
  expiry_date: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  passport: 'Passport',
  id: 'ID',
  contract: 'Contract',
  visa: 'Visa',
  certificate: 'Certificate',
  insurance: 'Insurance',
  other: 'Other',
};

const REMINDER_DAYS = 30;

function expiryState(expiryDate: string | null): 'expired' | 'soon' | null {
  if (!expiryDate) return null;
  const days = Math.floor(
    (new Date(expiryDate).getTime() - Date.now()) / 86_400_000,
  );
  if (days < 0) return 'expired';
  if (days <= REMINDER_DAYS) return 'soon';
  return null;
}

function buildDocPath(accountId: string, employeeId: string, fileName: string): string {
  const hasExt = /\.[^.]+$/.test(fileName);
  const ext = hasExt ? fileName.split('.').pop()!.toLowerCase() : 'bin';
  const safeBase =
    fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 40) || 'file';
  return `account-${accountId}/employee-${employeeId}/${Date.now()}-${safeBase}.${ext}`;
}

export default function DocumentsPage() {
  const { accountId, canManageMembers, profileLoading, user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    employee_id: '',
    document_type: 'other',
    expiry_date: '',
    issue_date: '',
    notes: '',
  });
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    if (!accountId || !user) return;
    setLoading(true);

    const { data: employee } = await supabase
      .from('employees')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    setMyEmployeeId((employee?.id as string | undefined) ?? null);

    if (canManageMembers) {
      const { data: empRows } = await supabase
        .from('employees')
        .select('id, full_name')
        .order('full_name');
      setEmployees((empRows as Employee[]) ?? []);
    }

    const { data: docRows, error } = await supabase
      .from('employee_documents')
      .select('id, employee_id, document_type, storage_path, file_name, expiry_date')
      .order('expiry_date', { ascending: true, nullsFirst: false });
    if (error) toast.error('Failed to load documents');
    setDocs((docRows as Doc[]) ?? []);

    setLoading(false);
  }, [accountId, user, canManageMembers, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const handleUpload = async () => {
    if (!form.employee_id || !file || !accountId) {
      toast.error('Employee and file are required');
      return;
    }
    setSaving(true);
    const path = buildDocPath(accountId, form.employee_id, file.name);
    const { error: uploadErr } = await supabase.storage
      .from('hr-documents')
      .upload(path, file);
    if (uploadErr) {
      toast.error(uploadErr.message || 'Upload failed');
      setSaving(false);
      return;
    }
    const { error: insertErr } = await supabase.from('employee_documents').insert({
      account_id: accountId,
      employee_id: form.employee_id,
      document_type: form.document_type,
      storage_path: path,
      file_name: file.name,
      issue_date: form.issue_date || null,
      expiry_date: form.expiry_date || null,
      notes: form.notes.trim() || null,
      uploaded_by: user?.id,
    });
    if (insertErr) {
      toast.error(insertErr.message || 'Failed to save document record');
      await supabase.storage.from('hr-documents').remove([path]);
    } else {
      toast.success('Document uploaded');
      setDialogOpen(false);
      setFile(null);
      setForm({ employee_id: '', document_type: 'other', expiry_date: '', issue_date: '', notes: '' });
      await load();
    }
    setSaving(false);
  };

  const handleDownload = async (doc: Doc) => {
    const { data, error } = await supabase.storage
      .from('hr-documents')
      .createSignedUrl(doc.storage_path, 60);
    if (error || !data) {
      toast.error('Failed to generate download link');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDelete = async (doc: Doc) => {
    const { error } = await supabase.from('employee_documents').delete().eq('id', doc.id);
    if (error) {
      toast.error(error.message || 'Failed to remove document');
      return;
    }
    await supabase.storage.from('hr-documents').remove([doc.storage_path]);
    toast.success('Document removed');
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
  };

  const visibleDocs = canManageMembers
    ? docs
    : docs.filter((d) => d.employee_id === myEmployeeId);
  const expiringSoon = visibleDocs.filter((d) => expiryState(d.expiry_date) === 'soon');
  const expired = visibleDocs.filter((d) => expiryState(d.expiry_date) === 'expired');

  if (loading || profileLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Employee documents, with expiry tracking.
          </p>
        </div>
        {canManageMembers && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Upload document
          </Button>
        )}
      </div>

      {(expired.length > 0 || expiringSoon.length > 0) && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p className="text-amber-700 dark:text-amber-400">
            {expired.length > 0 && `${expired.length} document${expired.length === 1 ? '' : 's'} expired. `}
            {expiringSoon.length > 0 &&
              `${expiringSoon.length} expiring within ${REMINDER_DAYS} days.`}
          </p>
        </div>
      )}

      {visibleDocs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <FileText className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No documents yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                {canManageMembers && <TableHead>Employee</TableHead>}
                <TableHead>Type</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleDocs.map((d) => {
                const state = expiryState(d.expiry_date);
                const employeeName = employees.find((e) => e.id === d.employee_id)?.full_name;
                return (
                  <TableRow key={d.id}>
                    {canManageMembers && (
                      <TableCell className="font-medium text-foreground">
                        {employeeName ?? '—'}
                      </TableCell>
                    )}
                    <TableCell>{TYPE_LABEL[d.document_type] ?? d.document_type}</TableCell>
                    <TableCell className="text-muted-foreground">{d.file_name}</TableCell>
                    <TableCell>
                      {d.expiry_date ? (
                        <span
                          className={
                            state === 'expired'
                              ? 'text-destructive'
                              : state === 'soon'
                                ? 'text-amber-600 dark:text-amber-400'
                                : ''
                          }
                        >
                          {d.expiry_date}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleDownload(d)}>
                          <Download className="size-4" />
                        </Button>
                        {canManageMembers && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(d)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select
                value={form.employee_id}
                onValueChange={(v) => setForm((f) => ({ ...f, employee_id: v ?? '' }))}
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Document type</Label>
              <Select
                value={form.document_type}
                onValueChange={(v) => v && setForm((f) => ({ ...f, document_type: v }))}
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-file">File</Label>
              <Input
                id="doc-file"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={saving}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="doc-issue">Issue date</Label>
                <Input
                  id="doc-issue"
                  type="date"
                  value={form.issue_date}
                  onChange={(e) => setForm((f) => ({ ...f, issue_date: e.target.value }))}
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="doc-expiry">Expiry date</Label>
                <Input
                  id="doc-expiry"
                  type="date"
                  value={form.expiry_date}
                  onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))}
                  disabled={saving}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
