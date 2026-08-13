'use client';

// ============================================================
// Tasks — account-wide task list.
//
// RLS mirrors `deals` exactly: any member reads, agent+ manages any
// task account-wide (058_tasks.sql). `assigned_to` is a filter, not
// a second ownership tier — Staff's My Tasks (/staff/tasks) reads
// the same table filtered to the caller.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ListChecks, Plus, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Profile {
  id: string;
  full_name: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  due_date: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'in_progress' | 'done' | 'cancelled';
}

const STATUS_OPTIONS: Task['status'][] = ['open', 'in_progress', 'done', 'cancelled'];
const PRIORITY_OPTIONS: Task['priority'][] = ['low', 'medium', 'high'];

const PRIORITY_COLOR: Record<Task['priority'], string> = {
  low: 'text-muted-foreground',
  medium: 'text-amber-500',
  high: 'text-red-500',
};

export default function TasksPage() {
  const { accountId, canSendMessages, user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | Task['status']>('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    assigned_to: '',
    due_date: '',
    priority: 'medium' as Task['priority'],
  });

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const [taskRes, profileRes] = await Promise.all([
      supabase
        .from('tasks')
        .select('id, title, description, assigned_to, due_date, priority, status')
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('profiles').select('id, full_name').order('full_name'),
    ]);
    if (taskRes.error) toast.error('Failed to load tasks');
    setTasks((taskRes.data as Task[]) ?? []);
    setProfiles((profileRes.data as Profile[]) ?? []);
    setLoading(false);
  }, [accountId, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const nameFor = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? 'Unassigned';

  const handleCreate = async () => {
    if (!accountId || !user) return;
    if (!form.title.trim()) {
      toast.error('Title is required');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('tasks').insert({
      account_id: accountId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      assigned_to: form.assigned_to || null,
      due_date: form.due_date || null,
      priority: form.priority,
      created_by: user.id,
    });
    if (error) toast.error(error.message || 'Failed to create task');
    else {
      toast.success('Task created');
      setDialogOpen(false);
      setForm({ title: '', description: '', assigned_to: '', due_date: '', priority: 'medium' });
      await load();
    }
    setSaving(false);
  };

  const handleToggleDone = async (task: Task) => {
    const nextStatus = task.status === 'done' ? 'open' : 'done';
    const { error } = await supabase.from('tasks').update({ status: nextStatus }).eq('id', task.id);
    if (error) toast.error(error.message || 'Failed to update task');
    else setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
  };

  const handleDelete = async (task: Task) => {
    const { error } = await supabase.from('tasks').delete().eq('id', task.id);
    if (error) toast.error(error.message || 'Failed to delete task');
    else {
      toast.success('Task deleted');
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    }
  };

  const filtered = statusFilter === 'all' ? tasks : tasks.filter((t) => t.status === statusFilter);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Tasks</h1>
          <p className="mt-1 text-sm text-muted-foreground">Assign work and see what&rsquo;s moving.</p>
        </div>
        {canSendMessages && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> New task
          </Button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(['all', ...STATUS_OPTIONS] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
              statusFilter === s
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <ListChecks className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No tasks here yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-2xl border border-border p-4"
            >
              <Checkbox
                checked={t.status === 'done'}
                onCheckedChange={() => handleToggleDone(t)}
                disabled={!canSendMessages}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium ${
                    t.status === 'done' ? 'text-muted-foreground line-through' : 'text-foreground'
                  }`}
                >
                  {t.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {nameFor(t.assigned_to)}
                  {t.due_date ? ` · Due ${t.due_date}` : ''}
                </p>
              </div>
              <span className={`text-xs font-medium capitalize ${PRIORITY_COLOR[t.priority]}`}>
                {t.priority}
              </span>
              {canSendMessages && (
                <Button variant="ghost" size="icon" onClick={() => handleDelete(t)}>
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input
                className="mt-1.5"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea
                className="mt-1.5"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Assign to</Label>
                <Select
                  value={form.assigned_to}
                  onValueChange={(v) => setForm((f) => ({ ...f, assigned_to: v ?? '' }))}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm((f) => ({ ...f, priority: (v ?? 'medium') as Task['priority'] }))}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((p) => (
                      <SelectItem key={p} value={p} className="capitalize">
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Due date (optional)</Label>
              <Input
                type="date"
                className="mt-1.5"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
