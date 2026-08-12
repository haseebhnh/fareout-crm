'use client';

// ============================================================
// HR — Shifts. Configuration (like leave types/holidays): any member
// reads, admin+ manages. See migration 048.
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
import { Clock3, Plus, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  working_days: number[];
}

const DAY_LABEL: Record<number, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
};

export default function ShiftsPage() {
  const { accountId, canManageMembers, profileLoading } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    start_time: '09:00',
    end_time: '18:00',
    break_minutes: 60,
    working_days: [1, 2, 3, 4, 5] as number[],
  });

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('shifts')
      .select('id, name, start_time, end_time, break_minutes, working_days')
      .eq('is_active', true)
      .order('start_time', { ascending: true });
    if (error) toast.error('Failed to load shifts');
    setShifts((data as Shift[]) ?? []);
    setLoading(false);
  }, [accountId, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const toggleDay = (day: number) => {
    setForm((f) => ({
      ...f,
      working_days: f.working_days.includes(day)
        ? f.working_days.filter((d) => d !== day)
        : [...f.working_days, day].sort(),
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('shifts').insert({
      account_id: accountId,
      name: form.name.trim(),
      start_time: form.start_time,
      end_time: form.end_time,
      break_minutes: form.break_minutes,
      working_days: form.working_days,
    });
    if (error) {
      toast.error(error.message || 'Failed to add shift');
    } else {
      toast.success('Shift added');
      setDialogOpen(false);
      setForm({
        name: '',
        start_time: '09:00',
        end_time: '18:00',
        break_minutes: 60,
        working_days: [1, 2, 3, 4, 5],
      });
      await load();
    }
    setSaving(false);
  };

  const handleDelete = async (shift: Shift) => {
    const { error } = await supabase.from('shifts').delete().eq('id', shift.id);
    if (error) toast.error(error.message || 'Failed to remove shift');
    else {
      toast.success('Shift removed');
      setShifts((prev) => prev.filter((s) => s.id !== shift.id));
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Shifts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reusable shift definitions the roster assigns employees to.
          </p>
        </div>
        {canManageMembers && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add shift
          </Button>
        )}
      </div>

      {shifts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <Clock3 className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No shifts configured yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Break</TableHead>
                <TableHead>Working days</TableHead>
                {canManageMembers && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium text-foreground">{s.name}</TableCell>
                  <TableCell>
                    {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                    {s.end_time < s.start_time ? ' (overnight)' : ''}
                  </TableCell>
                  <TableCell>{s.break_minutes} min</TableCell>
                  <TableCell>
                    {s.working_days.map((d) => DAY_LABEL[d]).join(', ')}
                  </TableCell>
                  {canManageMembers && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(s)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add shift</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="shift-name">Name</Label>
              <Input
                id="shift-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                disabled={saving}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="shift-start">Start time</Label>
                <Input
                  id="shift-start"
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shift-end">End time</Label>
                <Input
                  id="shift-end"
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                  disabled={saving}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="shift-break">Break (minutes)</Label>
              <Input
                id="shift-break"
                type="number"
                min={0}
                value={form.break_minutes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, break_minutes: Math.max(0, Number(e.target.value) || 0) }))
                }
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label>Working days</Label>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    disabled={saving}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                      form.working_days.includes(day)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {DAY_LABEL[day]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
