'use client';

// ============================================================
// HR — Branches. Configuration data (like holidays/shifts): any
// member reads, admin+ manages. See migration 054.
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
import { Building2, Plus, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Branch {
  id: string;
  name: string;
  address: string | null;
  region: string | null;
  employee_count: number;
}

export default function BranchesPage() {
  const { accountId, canManageMembers, profileLoading } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', address: '', region: '' });

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const [branchRes, employeeRes] = await Promise.all([
      supabase
        .from('branches')
        .select('id, name, address, region')
        .eq('is_active', true)
        .order('name'),
      supabase.from('employees').select('branch_id'),
    ]);
    if (branchRes.error) toast.error('Failed to load branches');
    const counts = new Map<string, number>();
    for (const row of employeeRes.data ?? []) {
      if (!row.branch_id) continue;
      counts.set(row.branch_id, (counts.get(row.branch_id) ?? 0) + 1);
    }
    setBranches(
      ((branchRes.data ?? []) as Omit<Branch, 'employee_count'>[]).map((b) => ({
        ...b,
        employee_count: counts.get(b.id) ?? 0,
      })),
    );
    setLoading(false);
  }, [accountId, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('branches').insert({
      account_id: accountId,
      name: form.name.trim(),
      address: form.address.trim() || null,
      region: form.region.trim() || null,
    });
    if (error) {
      toast.error(error.message || 'Failed to add branch');
    } else {
      toast.success('Branch added');
      setDialogOpen(false);
      setForm({ name: '', address: '', region: '' });
      await load();
    }
    setSaving(false);
  };

  const handleDelete = async (branch: Branch) => {
    if (branch.employee_count > 0) {
      toast.error('Reassign employees before removing this branch');
      return;
    }
    const { error } = await supabase.from('branches').delete().eq('id', branch.id);
    if (error) toast.error(error.message || 'Failed to remove branch');
    else {
      toast.success('Branch removed');
      setBranches((prev) => prev.filter((b) => b.id !== branch.id));
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Branches</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Locations your company operates from.
          </p>
        </div>
        {canManageMembers && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add branch
          </Button>
        )}
      </div>

      {branches.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <Building2 className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No branches configured yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Employees</TableHead>
                {canManageMembers && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium text-foreground">{b.name}</TableCell>
                  <TableCell>{b.region || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{b.address || '—'}</TableCell>
                  <TableCell>{b.employee_count}</TableCell>
                  {canManageMembers && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(b)}
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
            <DialogTitle>Add branch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="branch-name">Name</Label>
              <Input
                id="branch-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-region">Region</Label>
              <Input
                id="branch-region"
                value={form.region}
                onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                placeholder="e.g. Dubai, UAE"
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-address">Address</Label>
              <Input
                id="branch-address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
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
