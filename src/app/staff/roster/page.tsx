'use client';

// ============================================================
// Staff — My Roster.
//
// Read-only self view over `roster_assignments` (048) — assigning
// shifts stays an HR/manager action (/hr/roster); this just answers
// "when am I working."
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMyEmployee } from '@/hooks/use-my-employee';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CalendarRange, Loader2 } from 'lucide-react';

interface RosterRow {
  id: string;
  date: string;
  status: string;
  shift_name: string;
  start_time: string;
  end_time: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function StaffRosterPage() {
  const { employeeId, loading: employeeLoading } = useMyEmployee();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<RosterRow[]>([]);

  const load = useCallback(async () => {
    if (!employeeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('roster_assignments')
      .select('id, date, status, shifts(name, start_time, end_time)')
      .eq('employee_id', employeeId)
      .gte('date', todayIso())
      .order('date', { ascending: true })
      .limit(30);
    setRows(
      ((data ?? []) as unknown as {
        id: string;
        date: string;
        status: string;
        shifts: { name: string; start_time: string; end_time: string } | null;
      }[]).map((r) => ({
        id: r.id,
        date: r.date,
        status: r.status,
        shift_name: r.shifts?.name ?? '—',
        start_time: r.shifts?.start_time ?? '',
        end_time: r.shifts?.end_time ?? '',
      })),
    );
    setLoading(false);
  }, [employeeId, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!employeeLoading) void load();
  }, [employeeLoading, load]);

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
        <h1 className="text-2xl font-bold tracking-tight text-foreground">My Roster</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your upcoming shift assignments.</p>
      </div>

      {!employeeId ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          <CalendarRange className="size-5" />
          You&rsquo;re not linked to an employee record, so there&rsquo;s no roster to show.
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-12 text-center">
          <CalendarRange className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No upcoming shifts scheduled.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Shift</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-foreground">{r.date}</TableCell>
                  <TableCell>{r.shift_name}</TableCell>
                  <TableCell>
                    {r.start_time && r.end_time ? `${r.start_time} – ${r.end_time}` : '—'}
                  </TableCell>
                  <TableCell className="capitalize">{r.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
