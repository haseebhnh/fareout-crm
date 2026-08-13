'use client';

// ============================================================
// Staff — My Targets.
//
// Self view over `goals` (050). The self-update trigger
// (`goals_restrict_self_update_fields`) already lets the goal's own
// employee update only `current_value` and `status` — this page is
// that allowance surfaced as UI, nothing new at the data layer.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMyEmployee } from '@/hooks/use-my-employee';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TrendingUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Goal {
  id: string;
  title: string;
  description: string | null;
  kpi: string | null;
  target_value: number | null;
  current_value: number;
  unit: string | null;
  due_date: string | null;
  status: 'not_started' | 'in_progress' | 'completed' | 'missed';
}

const STATUS_OPTIONS: Goal['status'][] = ['not_started', 'in_progress', 'completed', 'missed'];

export default function StaffTargetsPage() {
  const { employeeId, loading: employeeLoading } = useMyEmployee();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!employeeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('goals')
      .select('id, title, description, kpi, target_value, current_value, unit, due_date, status')
      .eq('employee_id', employeeId)
      .order('due_date', { ascending: true, nullsFirst: false });
    setGoals((data as Goal[]) ?? []);
    setLoading(false);
  }, [employeeId, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!employeeLoading) void load();
  }, [employeeLoading, load]);

  const handleUpdate = async (goal: Goal, patch: Partial<Pick<Goal, 'current_value' | 'status'>>) => {
    setSavingId(goal.id);
    const { error } = await supabase.from('goals').update(patch).eq('id', goal.id);
    if (error) toast.error(error.message || 'Failed to update');
    else {
      setGoals((prev) => prev.map((g) => (g.id === goal.id ? { ...g, ...patch } : g)));
    }
    setSavingId(null);
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
        <h1 className="text-2xl font-bold tracking-tight text-foreground">My Targets</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track progress toward your goals. Update your progress and status any time.
        </p>
      </div>

      {!employeeId ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          <TrendingUp className="size-5" />
          You&rsquo;re not linked to an employee record, so there are no targets to show.
        </div>
      ) : goals.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-12 text-center">
          <TrendingUp className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No targets set yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {goals.map((g) => {
            const pct =
              g.target_value && g.target_value > 0
                ? Math.min(100, Math.round((g.current_value / g.target_value) * 100))
                : null;
            return (
              <div key={g.id} className="rounded-2xl border border-border p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{g.title}</p>
                    {g.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{g.description}</p>
                    )}
                    {g.due_date && (
                      <p className="mt-1 text-xs text-muted-foreground">Due {g.due_date}</p>
                    )}
                  </div>
                  <Select
                    value={g.status}
                    onValueChange={(v) => handleUpdate(g, { status: v as Goal['status'] })}
                  >
                    <SelectTrigger className="w-40 shrink-0" disabled={savingId === g.id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">
                          {s.replace('_', ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {g.target_value !== null && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {g.kpi ? `${g.kpi} — ` : ''}
                        {g.current_value}
                        {g.unit ?? ''} of {g.target_value}
                        {g.unit ?? ''}
                      </span>
                      {pct !== null && <span>{pct}%</span>}
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${pct ?? 0}%` }}
                      />
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Label htmlFor={`cv-${g.id}`} className="text-xs">
                        Update progress
                      </Label>
                      <Input
                        id={`cv-${g.id}`}
                        type="number"
                        className="h-8 w-28"
                        defaultValue={g.current_value}
                        disabled={savingId === g.id}
                        onBlur={(e) => {
                          const value = Number(e.target.value);
                          if (!Number.isNaN(value) && value !== g.current_value) {
                            handleUpdate(g, { current_value: value });
                          }
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
