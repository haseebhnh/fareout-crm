'use client';

// ============================================================
// HR — Leave.
//
// Balance is always derived from `leave_requests` at read time
// (allowance - approved - pending), never stored — see migration 046
// for why. Three sections:
//   - Leave types (admin-managed, any member reads — configuration,
//     not personal data).
//   - My requests: create + cancel-while-pending, for the caller's
//     own linked employee record.
//   - Pending approvals (admin+ only): approve/reject every request
//     in the account.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { CalendarDays, Plus, Loader2, Check, X } from 'lucide-react';
import { toast } from 'sonner';

interface LeaveType {
  id: string;
  name: string;
  annual_allowance_days: number;
}

interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  half_day: boolean;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
}

function daysInclusive(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

export default function LeavePage() {
  const { accountId, canManageMembers, profileLoading, user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [pending, setPending] = useState<
    (LeaveRequest & { employee_name: string; type_name: string })[]
  >([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    leave_type_id: '',
    start_date: '',
    end_date: '',
    reason: '',
  });

  const load = useCallback(async () => {
    if (!accountId || !user) return;
    setLoading(true);

    const { data: employee } = await supabase
      .from('employees')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    const empId = (employee?.id as string | undefined) ?? null;
    setMyEmployeeId(empId);

    const { data: typeRows } = await supabase
      .from('leave_types')
      .select('id, name, annual_allowance_days')
      .order('name');
    setTypes((typeRows as LeaveType[]) ?? []);

    if (empId) {
      const { data: mine } = await supabase
        .from('leave_requests')
        .select('id, employee_id, leave_type_id, start_date, end_date, half_day, reason, status')
        .eq('employee_id', empId)
        .order('start_date', { ascending: false });
      setMyRequests((mine as LeaveRequest[]) ?? []);
    }

    if (canManageMembers) {
      const { data: pendingRows } = await supabase
        .from('leave_requests')
        .select(
          'id, employee_id, leave_type_id, start_date, end_date, half_day, reason, status, employees(full_name), leave_types(name)',
        )
        .eq('status', 'pending')
        .order('start_date', { ascending: true });
      setPending(
        ((pendingRows ?? []) as unknown as (LeaveRequest & {
          employees: { full_name: string } | null;
          leave_types: { name: string } | null;
        })[]).map((r) => ({
          ...r,
          employee_name: r.employees?.full_name ?? '—',
          type_name: r.leave_types?.name ?? '—',
        })),
      );
    }

    setLoading(false);
  }, [accountId, user, canManageMembers, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const balanceFor = (typeId: string) => {
    const type = types.find((t) => t.id === typeId);
    if (!type) return null;
    const used = myRequests
      .filter((r) => r.leave_type_id === typeId && r.status === 'approved')
      .reduce((sum, r) => sum + daysInclusive(r.start_date, r.end_date), 0);
    const requested = myRequests
      .filter((r) => r.leave_type_id === typeId && r.status === 'pending')
      .reduce((sum, r) => sum + daysInclusive(r.start_date, r.end_date), 0);
    return {
      allowance: type.annual_allowance_days,
      used,
      pending: requested,
      remaining: type.annual_allowance_days - used - requested,
    };
  };

  const handleSubmit = async () => {
    if (!myEmployeeId || !accountId) return;
    if (!form.leave_type_id || !form.start_date || !form.end_date) {
      toast.error('Type and dates are required');
      return;
    }
    if (form.end_date < form.start_date) {
      toast.error('End date must be on or after the start date');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('leave_requests').insert({
      account_id: accountId,
      employee_id: myEmployeeId,
      leave_type_id: form.leave_type_id,
      start_date: form.start_date,
      end_date: form.end_date,
      reason: form.reason.trim() || null,
    });
    if (error) {
      toast.error(error.message || 'Failed to submit request');
    } else {
      toast.success('Leave request submitted');
      setDialogOpen(false);
      setForm({ leave_type_id: '', start_date: '', end_date: '', reason: '' });
      await load();
    }
    setSaving(false);
  };

  const handleCancel = async (request: LeaveRequest) => {
    const { error } = await supabase
      .from('leave_requests')
      .update({ status: 'cancelled' })
      .eq('id', request.id);
    if (error) toast.error(error.message || 'Failed to cancel');
    else {
      toast.success('Request cancelled');
      await load();
    }
  };

  const handleDecision = async (request: LeaveRequest, status: 'approved' | 'rejected') => {
    const { error } = await supabase
      .from('leave_requests')
      .update({ status, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
      .eq('id', request.id);
    if (error) toast.error(error.message || 'Failed to update request');
    else {
      toast.success(status === 'approved' ? 'Request approved' : 'Request rejected');
      await load();
    }
  };

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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Leave</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Request time off and track your balance.
          </p>
        </div>
        {myEmployeeId && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Request leave
          </Button>
        )}
      </div>

      {myEmployeeId && types.length > 0 && (
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          {types.map((type) => {
            const bal = balanceFor(type.id);
            if (!bal) return null;
            return (
              <div key={type.id} className="rounded-2xl border border-border p-4">
                <p className="text-sm font-medium text-foreground">{type.name}</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{bal.remaining}</p>
                <p className="text-xs text-muted-foreground">
                  of {bal.allowance} days · {bal.used} used, {bal.pending} pending
                </p>
              </div>
            );
          })}
        </div>
      )}

      {myEmployeeId && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-foreground">My requests</h2>
          {myRequests.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-12 text-center">
              <CalendarDays className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No leave requests yet.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dates</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myRequests.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        {r.start_date} – {r.end_date}
                      </TableCell>
                      <TableCell className="capitalize">{r.status}</TableCell>
                      <TableCell>
                        {r.status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancel(r)}
                            className="text-destructive hover:text-destructive"
                          >
                            Cancel
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {canManageMembers && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-foreground">Pending approvals</h2>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing waiting on you.</p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium text-foreground">
                        {r.employee_name}
                      </TableCell>
                      <TableCell>{r.type_name}</TableCell>
                      <TableCell>
                        {r.start_date} – {r.end_date}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDecision(r, 'approved')}
                            className="text-emerald-600 hover:text-emerald-600"
                          >
                            <Check className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDecision(r, 'rejected')}
                            className="text-destructive hover:text-destructive"
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request leave</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.leave_type_id}
                onValueChange={(v) => setForm((f) => ({ ...f, leave_type_id: v ?? '' }))}
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a leave type" />
                </SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="leave-start">Start date</Label>
                <Input
                  id="leave-start"
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="leave-end">End date</Label>
                <Input
                  id="leave-end"
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                  disabled={saving}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="leave-reason">Reason</Label>
              <Textarea
                id="leave-reason"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                rows={3}
                disabled={saving}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
