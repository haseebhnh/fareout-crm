'use client';

// ============================================================
// Staff — My Attendance.
//
// The self half of /hr/attendance's check-in/out card, reusing the
// exact same `attendance_records` table and RLS policies
// (attendance_insert_self / attendance_update_self) — just without
// the admin-only "everyone today" table, since this is a personal
// portal, not the HR console.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useMyEmployee } from '@/hooks/use-my-employee';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Clock, LogIn, LogOut, Loader2, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';

interface AttendanceRow {
  id: string;
  date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  status: string;
}

const STATUS_LABEL: Record<string, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  half_day: 'Half day',
  leave: 'Leave',
  holiday: 'Holiday',
  week_off: 'Week off',
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function StaffAttendancePage() {
  const { accountId } = useAuth();
  const { employeeId, loading: employeeLoading } = useMyEmployee();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState<AttendanceRow | null>(null);
  const [history, setHistory] = useState<AttendanceRow[]>([]);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    if (!employeeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: rows } = await supabase
      .from('attendance_records')
      .select('id, date, check_in_at, check_out_at, status')
      .eq('employee_id', employeeId)
      .order('date', { ascending: false })
      .limit(14);
    const all = (rows as AttendanceRow[]) ?? [];
    setHistory(all);
    setToday(all.find((r) => r.date === todayIso()) ?? null);
    setLoading(false);
  }, [employeeId, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!employeeLoading) void load();
  }, [employeeLoading, load]);

  const handleCheckIn = async () => {
    if (!employeeId || !accountId) return;
    setChecking(true);
    const { error } = await supabase.from('attendance_records').insert({
      account_id: accountId,
      employee_id: employeeId,
      date: todayIso(),
      check_in_at: new Date().toISOString(),
      status: 'present',
    });
    if (error) toast.error(error.message || 'Check-in failed');
    else {
      toast.success('Checked in');
      await load();
    }
    setChecking(false);
  };

  const handleCheckOut = async () => {
    if (!today) return;
    setChecking(true);
    const { error } = await supabase
      .from('attendance_records')
      .update({ check_out_at: new Date().toISOString() })
      .eq('id', today.id);
    if (error) toast.error(error.message || 'Check-out failed');
    else {
      toast.success('Checked out');
      await load();
    }
    setChecking(false);
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">My Attendance</h1>
        <p className="mt-1 text-sm text-muted-foreground">Check in and out, and see your history.</p>
      </div>

      {employeeId ? (
        <>
          <div className="mb-8 flex items-center justify-between rounded-2xl border border-border p-6">
            <div className="flex items-center gap-3">
              <Clock className="size-6 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">Today</p>
                <p className="text-xs text-muted-foreground">
                  {today?.check_in_at
                    ? `Checked in ${new Date(today.check_in_at).toLocaleTimeString()}`
                    : 'Not checked in yet'}
                  {today?.check_out_at
                    ? ` · Checked out ${new Date(today.check_out_at).toLocaleTimeString()}`
                    : ''}
                </p>
              </div>
            </div>
            {!today?.check_in_at ? (
              <Button onClick={handleCheckIn} disabled={checking}>
                {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
                Check in
              </Button>
            ) : !today?.check_out_at ? (
              <Button variant="outline" onClick={handleCheckOut} disabled={checking}>
                {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
                Check out
              </Button>
            ) : (
              <span className="text-sm text-muted-foreground">Done for today</span>
            )}
          </div>

          <div>
            <h2 className="mb-3 text-lg font-semibold text-foreground">Last 14 days</h2>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No attendance recorded yet.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Check in</TableHead>
                      <TableHead>Check out</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium text-foreground">{row.date}</TableCell>
                        <TableCell>
                          {row.check_in_at ? new Date(row.check_in_at).toLocaleTimeString() : '—'}
                        </TableCell>
                        <TableCell>
                          {row.check_out_at ? new Date(row.check_out_at).toLocaleTimeString() : '—'}
                        </TableCell>
                        <TableCell>{STATUS_LABEL[row.status] ?? row.status}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          <CalendarClock className="size-5" />
          You&rsquo;re not linked to an employee record, so there&rsquo;s nothing to check in for.
        </div>
      )}
    </div>
  );
}
