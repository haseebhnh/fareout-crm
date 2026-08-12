'use client';

// ============================================================
// HR — Settings.
//
// Deliberately narrow: only configuration that actually changes
// behavior somewhere in the code lives here.
//   - Document expiry reminder threshold (hr_settings, 056) — read
//     by /hr/documents' banner.
//   - Leave types (leave_types, 046) — created in migration 046 but
//     never had a management UI; the Leave page could only pick from
//     whatever existed, not create/edit/retire types. That's the
//     real gap this page closes.
// Shifts, Branches, and Holidays already have their own full pages —
// linked here for discoverability, not duplicated.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Settings as SettingsIcon,
  CalendarDays,
  Plus,
  Loader2,
  Trash2,
  Clock3,
  Building2,
  CalendarHeart,
} from 'lucide-react';
import { toast } from 'sonner';

interface LeaveType {
  id: string;
  name: string;
  annual_allowance_days: number;
  requires_approval: boolean;
}

export default function HrSettingsPage() {
  const { accountId, canManageMembers, profileLoading } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reminderDays, setReminderDays] = useState(30);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: '', annual_allowance_days: 0, requires_approval: true });

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const [settingsRes, typesRes] = await Promise.all([
      supabase.from('hr_settings').select('document_expiry_reminder_days').eq('account_id', accountId).maybeSingle(),
      supabase.from('leave_types').select('id, name, annual_allowance_days, requires_approval').order('name'),
    ]);
    setReminderDays(settingsRes.data?.document_expiry_reminder_days ?? 30);
    setLeaveTypes((typesRes.data as LeaveType[]) ?? []);
    setLoading(false);
  }, [accountId, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const handleSaveReminder = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('hr_settings')
      .upsert({ account_id: accountId, document_expiry_reminder_days: reminderDays });
    if (error) toast.error(error.message || 'Failed to save');
    else toast.success('Saved');
    setSaving(false);
  };

  const handleCreateLeaveType = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('leave_types').insert({
      account_id: accountId,
      name: form.name.trim(),
      annual_allowance_days: form.annual_allowance_days,
      requires_approval: form.requires_approval,
    });
    if (error) toast.error(error.message || 'Failed to add leave type');
    else {
      toast.success('Leave type added');
      setDialogOpen(false);
      setForm({ name: '', annual_allowance_days: 0, requires_approval: true });
      await load();
    }
    setSaving(false);
  };

  const handleDeleteLeaveType = async (type: LeaveType) => {
    const { error } = await supabase.from('leave_types').delete().eq('id', type.id);
    if (error) {
      toast.error(
        error.message?.includes('foreign key')
          ? 'This leave type has existing requests and cannot be removed.'
          : error.message || 'Failed to remove leave type',
      );
    } else {
      toast.success('Leave type removed');
      setLeaveTypes((prev) => prev.filter((t) => t.id !== type.id));
    }
  };

  if (loading || profileLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (!canManageMembers) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
        <SettingsIcon className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">HR settings are visible to account admins.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">HR Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configuration that applies across HR.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Document expiry reminders</CardTitle>
          <CardDescription>
            How many days before a document expires it shows up as &ldquo;expiring soon&rdquo; on the Documents page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="reminder-days">Days</Label>
              <Input
                id="reminder-days"
                type="number"
                min={1}
                value={reminderDays}
                onChange={(e) => setReminderDays(Math.max(1, Number(e.target.value) || 1))}
                className="w-24"
                disabled={saving}
              />
            </div>
            <Button onClick={handleSaveReminder} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Leave types</CardTitle>
            <CardDescription>
              What employees can request time off for, and how much they get.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add type
          </Button>
        </CardHeader>
        <CardContent>
          {leaveTypes.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-10 text-center">
              <CalendarDays className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No leave types yet — employees can&rsquo;t request leave until at least one exists.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Annual allowance</TableHead>
                    <TableHead>Requires approval</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaveTypes.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium text-foreground">{t.name}</TableCell>
                      <TableCell>{t.annual_allowance_days} days</TableCell>
                      <TableCell>{t.requires_approval ? 'Yes' : 'No'}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteLeaveType(t)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Also configurable</CardTitle>
          <CardDescription>
            These already have their own dedicated pages.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Link
            href="/hr/shifts"
            className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm hover:bg-muted/50"
          >
            <Clock3 className="size-4 text-muted-foreground" /> Shifts
          </Link>
          <Link
            href="/hr/branches"
            className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm hover:bg-muted/50"
          >
            <Building2 className="size-4 text-muted-foreground" /> Branches
          </Link>
          <Link
            href="/hr/holidays"
            className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm hover:bg-muted/50"
          >
            <CalendarHeart className="size-4 text-muted-foreground" /> Holidays
          </Link>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add leave type</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="lt-name">Name</Label>
              <Input
                id="lt-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Annual, Sick, Emergency"
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lt-allowance">Annual allowance (days)</Label>
              <Input
                id="lt-allowance"
                type="number"
                min={0}
                value={form.annual_allowance_days}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    annual_allowance_days: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
                disabled={saving}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <Label htmlFor="lt-approval" className="text-sm font-medium">
                Requires approval
              </Label>
              <Switch
                id="lt-approval"
                checked={form.requires_approval}
                onCheckedChange={(v) => setForm((f) => ({ ...f, requires_approval: v }))}
                disabled={saving}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleCreateLeaveType} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
