'use client';

// ============================================================
// HR — Attendance.
//
// Two views in one page, gated by canManageMembers (admin+, same
// role RLS uses for the admin-side attendance policies):
//   - Everyone: a self check-in/check-out card for their own linked
//     employee record (RLS: attendance_insert_self/update_self).
//   - Admin+: today's account-wide attendance table, with a manual
//     "add/correct" action (RLS: attendance_insert_admin/update_admin).
// A member with no linked employee row (no `employees.user_id` match)
// sees neither — there's nothing to check in/out for.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
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
  employee_id: string;
  date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  status: string;
  corrected_by: string | null;
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

export default function AttendancePage() {
  const { accountId, canManageMembers, profileLoading, user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  const [myToday, setMyToday] = useState<AttendanceRow | null>(null);
  const [checking, setChecking] = useState(false);

  const [teamToday, setTeamToday] = useState<
    (AttendanceRow & { employee_name: string })[]
  >([]);

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

    if (empId) {
      const { data: row } = await supabase
        .from('attendance_records')
        .select('id, employee_id, date, check_in_at, check_out_at, status, corrected_by')
        .eq('employee_id', empId)
        .eq('date', todayIso())
        .maybeSingle();
      setMyToday((row as AttendanceRow) ?? null);
    }

    if (canManageMembers) {
      const { data: rows } = await supabase
        .from('attendance_records')
        .select(
          'id, employee_id, date, check_in_at, check_out_at, status, corrected_by, employees(full_name)',
        )
        .eq('date', todayIso())
        .order('check_in_at', { ascending: true });
      setTeamToday(
        ((rows ?? []) as unknown as (AttendanceRow & {
          employees: { full_name: string } | null;
        })[]).map((r) => ({ ...r, employee_name: r.employees?.full_name ?? '—' })),
      );
    }

    setLoading(false);
  }, [accountId, user, canManageMembers, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const handleCheckIn = async () => {
    if (!myEmployeeId || !accountId) return;
    setChecking(true);
    const { error } = await supabase.from('attendance_records').insert({
      account_id: accountId,
      employee_id: myEmployeeId,
      date: todayIso(),
      check_in_at: new Date().toISOString(),
      status: 'present',
    });
    if (error) {
      toast.error(error.message || 'Check-in failed');
    } else {
      toast.success('Checked in');
      await load();
    }
    setChecking(false);
  };

  const handleCheckOut = async () => {
    if (!myToday) return;
    setChecking(true);
    const { error } = await supabase
      .from('attendance_records')
      .update({ check_out_at: new Date().toISOString() })
      .eq('id', myToday.id);
    if (error) {
      toast.error(error.message || 'Check-out failed');
    } else {
      toast.success('Checked out');
      await load();
    }
    setChecking(false);
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Attendance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Check in and out, and — for admins — see who&rsquo;s in today.
        </p>
      </div>

      {myEmployeeId ? (
        <div className="mb-8 flex items-center justify-between rounded-2xl border border-border p-6">
          <div className="flex items-center gap-3">
            <Clock className="size-6 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">Today</p>
              <p className="text-xs text-muted-foreground">
                {myToday?.check_in_at
                  ? `Checked in ${new Date(myToday.check_in_at).toLocaleTimeString()}`
                  : 'Not checked in yet'}
                {myToday?.check_out_at
                  ? ` · Checked out ${new Date(myToday.check_out_at).toLocaleTimeString()}`
                  : ''}
              </p>
            </div>
          </div>
          {!myToday?.check_in_at ? (
            <Button onClick={handleCheckIn} disabled={checking}>
              {checking ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="mr-2 h-4 w-4" />
              )}
              Check in
            </Button>
          ) : !myToday?.check_out_at ? (
            <Button variant="outline" onClick={handleCheckOut} disabled={checking}>
              {checking ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="mr-2 h-4 w-4" />
              )}
              Check out
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">Done for today</span>
          )}
        </div>
      ) : (
        <div className="mb-8 flex items-center gap-3 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          <CalendarClock className="size-5" />
          You&rsquo;re not linked to an employee record, so there&rsquo;s nothing to check in for.
        </div>
      )}

      {canManageMembers && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-foreground">Today — everyone</h2>
          {teamToday.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attendance recorded yet today.</p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Check in</TableHead>
                    <TableHead>Check out</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamToday.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium text-foreground">
                        {row.employee_name}
                      </TableCell>
                      <TableCell>
                        {row.check_in_at
                          ? new Date(row.check_in_at).toLocaleTimeString()
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {row.check_out_at
                          ? new Date(row.check_out_at).toLocaleTimeString()
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {STATUS_LABEL[row.status] ?? row.status}
                        {row.corrected_by ? ' (corrected)' : ''}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
