'use client';

// ============================================================
// HR — Holidays. Configuration data (like leave types): any member
// reads, admin+ manages. See migration 047 for the recurring-date
// design note.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { CalendarHeart, Plus, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Holiday {
  id: string;
  name: string;
  date: string;
  recurring: boolean;
  is_active: boolean;
}

export default function HolidaysPage() {
  const { accountId, canManageMembers, profileLoading } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', date: '', recurring: false });

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('holidays')
      .select('id, name, date, recurring, is_active')
      .eq('is_active', true)
      .order('date', { ascending: true });
    if (error) toast.error('Failed to load holidays');
    setHolidays((data as Holiday[]) ?? []);
    setLoading(false);
  }, [accountId, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.date) {
      toast.error('Name and date are required');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('holidays').insert({
      account_id: accountId,
      name: form.name.trim(),
      date: form.date,
      recurring: form.recurring,
    });
    if (error) {
      toast.error(error.message || 'Failed to add holiday');
    } else {
      toast.success('Holiday added');
      setDialogOpen(false);
      setForm({ name: '', date: '', recurring: false });
      await load();
    }
    setSaving(false);
  };

  const handleDelete = async (holiday: Holiday) => {
    const { error } = await supabase.from('holidays').delete().eq('id', holiday.id);
    if (error) toast.error(error.message || 'Failed to remove holiday');
    else {
      toast.success('Holiday removed');
      setHolidays((prev) => prev.filter((h) => h.id !== holiday.id));
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Holidays</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Company holidays — excluded from attendance and roster expectations.
          </p>
        </div>
        {canManageMembers && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add holiday
          </Button>
        )}
      </div>

      {holidays.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <CalendarHeart className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No holidays configured yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Recurring</TableHead>
                {canManageMembers && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {holidays.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="font-medium text-foreground">{h.name}</TableCell>
                  <TableCell>{h.date}</TableCell>
                  <TableCell>{h.recurring ? 'Yes' : 'No'}</TableCell>
                  {canManageMembers && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(h)}
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
            <DialogTitle>Add holiday</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="holiday-name">Name</Label>
              <Input
                id="holiday-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="holiday-date">Date</Label>
              <Input
                id="holiday-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                disabled={saving}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <Label htmlFor="holiday-recurring" className="text-sm font-medium">
                Recurs every year
              </Label>
              <Switch
                id="holiday-recurring"
                checked={form.recurring}
                onCheckedChange={(v) => setForm((f) => ({ ...f, recurring: v }))}
                disabled={saving}
              />
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
