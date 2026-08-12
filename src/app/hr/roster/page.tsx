'use client';

// ============================================================
// HR — Duty roster.
//
// Assignment is admin-only (RLS: roster_insert/update/delete all
// require admin+ — see migration 048's comment on why this isn't
// self-service the way check-in is). Everyone sees their own
// assignments; admin+ sees and edits everyone's. Week view: enough
// to be useful without the complexity of a full calendar grid.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CalendarRange, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Employee {
  id: string;
  full_name: string;
}
interface Shift {
  id: string;
  name: string;
}
interface Assignment {
  id: string;
  employee_id: string;
  shift_id: string;
  date: string;
}

function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // Monday-start week
  const start = new Date(d);
  start.setDate(d.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function RosterPage() {
  const { accountId, canManageMembers, profileLoading, user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    }),
    [weekStart],
  );

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
      const [empRes, shiftRes] = await Promise.all([
        supabase.from('employees').select('id, full_name').order('full_name'),
        supabase.from('shifts').select('id, name').eq('is_active', true).order('name'),
      ]);
      setEmployees((empRes.data as Employee[]) ?? []);
      setShifts((shiftRes.data as Shift[]) ?? []);
    }

    const from = toIso(weekDays[0]);
    const to = toIso(weekDays[6]);
    const { data: rows, error } = await supabase
      .from('roster_assignments')
      .select('id, employee_id, shift_id, date')
      .gte('date', from)
      .lte('date', to);
    if (error) toast.error('Failed to load roster');
    setAssignments((rows as Assignment[]) ?? []);

    setLoading(false);
    // weekDays is derived from weekStart each render; depending on the
    // array itself would refetch every render since it's a new array
    // identity each time. weekStart is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, user, canManageMembers, supabase, weekStart]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const assignmentFor = (employeeId: string, date: string) =>
    assignments.find((a) => a.employee_id === employeeId && a.date === date);

  const handleAssign = async (employeeId: string, date: string, shiftId: string) => {
    if (!accountId) return;
    const existing = assignmentFor(employeeId, date);
    const result = shiftId
      ? existing
        ? await supabase
            .from('roster_assignments')
            .update({ shift_id: shiftId })
            .eq('id', existing.id)
        : await supabase.from('roster_assignments').insert({
            account_id: accountId,
            employee_id: employeeId,
            shift_id: shiftId,
            date,
          })
      : existing
        ? await supabase.from('roster_assignments').delete().eq('id', existing.id)
        : { error: null };

    if (result.error) {
      toast.error(result.error.message || 'Failed to update roster');
    } else {
      await load();
    }
  };

  const rosterRows = canManageMembers
    ? employees
    : myEmployeeId
      ? [{ id: myEmployeeId, full_name: 'Me' }]
      : [];

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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Roster</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Weekly shift assignments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const d = new Date(weekStart);
              d.setDate(d.getDate() - 7);
              setWeekStart(d);
            }}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {toIso(weekDays[0])} – {toIso(weekDays[6])}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const d = new Date(weekStart);
              d.setDate(d.getDate() + 7);
              setWeekStart(d);
            }}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {rosterRows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <CalendarRange className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nothing to show for this week.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Employee</th>
                {weekDays.map((d) => (
                  <th key={toIso(d)} className="px-4 py-3 font-medium">
                    {d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rosterRows.map((emp) => (
                <tr key={emp.id}>
                  <td className="px-4 py-3 font-medium text-foreground">{emp.full_name}</td>
                  {weekDays.map((d) => {
                    const iso = toIso(d);
                    const assignment = assignmentFor(emp.id, iso);
                    if (!canManageMembers) {
                      const shift = shifts.find((s) => s.id === assignment?.shift_id);
                      return (
                        <td key={iso} className="px-4 py-3 text-muted-foreground">
                          {assignment ? shift?.name ?? '—' : '—'}
                        </td>
                      );
                    }
                    return (
                      <td key={iso} className="px-2 py-2">
                        <Select
                          value={assignment?.shift_id ?? '__none__'}
                          onValueChange={(v) =>
                            handleAssign(emp.id, iso, v === '__none__' ? '' : v ?? '')
                          }
                        >
                          <SelectTrigger className="h-8 w-full text-xs">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {shifts.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
