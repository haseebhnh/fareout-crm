'use client';

// ============================================================
// Tasks — account-wide task list.
//
// RLS mirrors `deals` exactly: any member reads, agent+ manages any
// task account-wide (058_tasks.sql). `assigned_to` is a filter, not
// a second ownership tier — Staff's My Tasks (/staff/tasks) reads
// the same table filtered to the caller.
//
// `contact_id`/`deal_id` are optional links onto existing CRM
// records, surfaced here so a task can hang off a customer or deal
// without requiring one — reuses the same contacts/deals tables the
// rest of the CRM does, no new relationship model.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { ListChecks, Plus, Loader2, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Profile {
  id: string;
  full_name: string;
}

interface Contact {
  id: string;
  name: string | null;
  phone: string;
}

interface Deal {
  id: string;
  title: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  contact_id: string | null;
  deal_id: string | null;
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

const EMPTY_FORM = {
  title: '',
  description: '',
  assigned_to: '',
  contact_id: '',
  deal_id: '',
  due_date: '',
  priority: 'medium' as Task['priority'],
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isOverdue(task: Task): boolean {
  return !!task.due_date && task.due_date < todayIso() && task.status !== 'done' && task.status !== 'cancelled';
}

export default function TasksPage() {
  const { accountId, canSendMessages, user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | Task['status']>('all');
  const [search, setSearch] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const [taskRes, profileRes, contactRes, dealRes] = await Promise.all([
      supabase
        .from('tasks')
        .select('id, title, description, assigned_to, contact_id, deal_id, due_date, priority, status')
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('profiles').select('id, full_name').order('full_name'),
      supabase.from('contacts').select('id, name, phone').order('name'),
      supabase.from('deals').select('id, title').order('title'),
    ]);
    if (taskRes.error) toast.error('Failed to load tasks');
    setTasks((taskRes.data as Task[]) ?? []);
    setProfiles((profileRes.data as Profile[]) ?? []);
    setContacts((contactRes.data as Contact[]) ?? []);
    setDeals((dealRes.data as Deal[]) ?? []);
    setLoading(false);
  }, [accountId, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const nameFor = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? 'Unassigned';
  const contactNameFor = (id: string | null) => {
    const c = contacts.find((c) => c.id === id);
    return c ? c.name ?? c.phone : null;
  };
  const dealNameFor = (id: string | null) => deals.find((d) => d.id === id)?.title ?? null;

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (task: Task) => {
    setEditingId(task.id);
    setForm({
      title: task.title,
      description: task.description ?? '',
      assigned_to: task.assigned_to ?? '',
      contact_id: task.contact_id ?? '',
      deal_id: task.deal_id ?? '',
      due_date: task.due_date ?? '',
      priority: task.priority,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!accountId || !user) return;
    if (!form.title.trim()) {
      toast.error('Title is required');
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      assigned_to: form.assigned_to || null,
      contact_id: form.contact_id || null,
      deal_id: form.deal_id || null,
      due_date: form.due_date || null,
      priority: form.priority,
    };
    const { error } = editingId
      ? await supabase.from('tasks').update(payload).eq('id', editingId)
      : await supabase.from('tasks').insert({ ...payload, account_id: accountId, created_by: user.id });
    if (error) toast.error(error.message || 'Failed to save task');
    else {
      toast.success(editingId ? 'Task updated' : 'Task created');
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks
      .filter((t) => statusFilter === 'all' || t.status === statusFilter)
      .filter((t) => !q || t.title.toLowerCase().includes(q));
  }, [tasks, statusFilter, search]);

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
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> New task
          </Button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
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
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tasks…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <ListChecks className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No tasks here yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => {
            const overdue = isOverdue(t);
            const contactName = contactNameFor(t.contact_id);
            const dealName = dealNameFor(t.deal_id);
            return (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-2xl border border-border p-4"
              >
                <Checkbox
                  checked={t.status === 'done'}
                  onCheckedChange={() => handleToggleDone(t)}
                  disabled={!canSendMessages}
                />
                <button
                  type="button"
                  onClick={() => canSendMessages && openEdit(t)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p
                    className={`text-sm font-medium ${
                      t.status === 'done' ? 'text-muted-foreground line-through' : 'text-foreground'
                    }`}
                  >
                    {t.title}
                  </p>
                  <p className={`text-xs ${overdue ? 'font-medium text-red-500' : 'text-muted-foreground'}`}>
                    {nameFor(t.assigned_to)}
                    {t.due_date ? ` · Due ${t.due_date}${overdue ? ' (overdue)' : ''}` : ''}
                    {contactName ? ` · ${contactName}` : ''}
                    {dealName ? ` · ${dealName}` : ''}
                  </p>
                </button>
                <span className={`text-xs font-medium capitalize ${PRIORITY_COLOR[t.priority]}`}>
                  {t.priority}
                </span>
                {canSendMessages && (
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(t)}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit task' : 'New task'}</DialogTitle>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Contact (optional)</Label>
                <Select
                  value={form.contact_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, contact_id: v ?? '' }))}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    {contacts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name ?? c.phone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Deal (optional)</Label>
                <Select
                  value={form.deal_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, deal_id: v ?? '' }))}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    {deals.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.title}
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
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingId ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
