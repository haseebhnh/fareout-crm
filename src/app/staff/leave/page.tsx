'use client';

// ============================================================
// Staff — My Leave.
//
// The self half of /hr/leave — same `leave_requests`/`leave_types`
// tables and RLS, without the admin-only pending-approvals section.
// Balance is derived at read time (never stored), same as the HR page.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useMyEmployee } from '@/hooks/use-my-employee';
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
import { CalendarDays, Plus, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

interface LeaveType {
  id: string;
  name: string;
  annual_allowance_days: number;
}

interface LeaveRequest {
  id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
}

function daysInclusive(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

export default function StaffLeavePage() {
  const { accountId } = useAuth();
  const { employeeId, loading: employeeLoading } = useMyEmployee();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ leave_type_id: '', start_date: '', end_date: '', reason: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const { data: typeRows } = await supabase
      .from('leave_types')
      .select('id, name, annual_allowance_days')
      .order('name');
    setTypes((typeRows as LeaveType[]) ?? []);

    if (employeeId) {
      const { data: mine } = await supabase
        .from('leave_requests')
        .select('id, leave_type_id, start_date, end_date, reason, status')
        .eq('employee_id', employeeId)
        .order('start_date', { ascending: false });
      setRequests((mine as LeaveRequest[]) ?? []);
    }
    setLoading(false);
  }, [employeeId, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!employeeLoading) void load();
  }, [employeeLoading, load]);

  const balanceFor = (typeId: string) => {
    const type = types.find((t) => t.id === typeId);
    if (!type) return null;
    const used = requests
      .filter((r) => r.leave_type_id === typeId && r.status === 'approved')
      .reduce((sum, r) => sum + daysInclusive(r.start_date, r.end_date), 0);
    const pendingDays = requests
      .filter((r) => r.leave_type_id === typeId && r.status === 'pending')
      .reduce((sum, r) => sum + daysInclusive(r.start_date, r.end_date), 0);
    return {
      allowance: type.annual_allowance_days,
      used,
      pending: pendingDays,
      remaining: type.annual_allowance_days - used - pendingDays,
    };
  };

  const handleSubmit = async () => {
    if (!employeeId || !accountId) return;
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
      employee_id: employeeId,
      leave_type_id: form.leave_type_id,
      start_date: form.start_date,
      end_date: form.end_date,
      reason: form.reason.trim() || null,
    });
    if (error) toast.error(error.message || 'Failed to submit request');
    else {
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

  if (employeeLoading || loading) {
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">My Leave</h1>
          <p className="mt-1 text-sm text-muted-foreground">Request time off and track your balance.</p>
        </div>
        {employeeId && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Request leave
          </Button>
        )}
      </div>

      {!employeeId ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          <CalendarDays className="size-5" />
          You&rsquo;re not linked to an employee record, so there&rsquo;s nothing to request leave for.
        </div>
      ) : (
        <>
          {types.length > 0 && (
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

          <div>
            <h2 className="mb-3 text-lg font-semibold text-foreground">My requests</h2>
            {requests.length === 0 ? (
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
                    {requests.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-foreground">
                          {r.start_date === r.end_date ? r.start_date : `${r.start_date} → ${r.end_date}`}
                        </TableCell>
                        <TableCell className="capitalize">{r.status}</TableCell>
                        <TableCell>
                          {r.status === 'pending' && (
                            <Button variant="ghost" size="icon" onClick={() => handleCancel(r)}>
                              <X className="size-4" />
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
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request leave</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Leave type</Label>
              <Select
                value={form.leave_type_id}
                onValueChange={(v) => setForm((f) => ({ ...f, leave_type_id: v ?? '' }))}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select type" />
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start date</Label>
                <Input
                  type="date"
                  className="mt-1.5"
                  value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                />
              </div>
              <div>
                <Label>End date</Label>
                <Input
                  type="date"
                  className="mt-1.5"
                  value={form.end_date}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Reason (optional)</Label>
              <Textarea
                className="mt-1.5"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
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
