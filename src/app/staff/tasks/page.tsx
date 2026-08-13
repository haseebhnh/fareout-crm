'use client';

// ============================================================
// Staff — My Tasks.
//
// A personal filter over the SAME `tasks` table /tasks uses
// (tasks.assigned_to = my profile id) — not a second task system.
// RLS is unchanged (agent+ manage any task account-wide); this page
// just narrows the query, same as My Deals/My Customers.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Checkbox } from '@/components/ui/checkbox';
import { ListChecks, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface Task {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'in_progress' | 'done' | 'cancelled';
}

const PRIORITY_COLOR: Record<Task['priority'], string> = {
  low: 'text-muted-foreground',
  medium: 'text-amber-500',
  high: 'text-red-500',
};

export default function StaffTasksPage() {
  const { profile, profileLoading } = useAuth();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);

  const load = useCallback(async () => {
    if (!profile?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('tasks')
      .select('id, title, description, due_date, priority, status')
      .eq('assigned_to', profile.id)
      .order('due_date', { ascending: true, nullsFirst: false });
    setTasks((data as Task[]) ?? []);
    setLoading(false);
  }, [profile, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!profileLoading) void load();
  }, [profileLoading, load]);

  const handleToggleDone = async (task: Task) => {
    const nextStatus = task.status === 'done' ? 'open' : 'done';
    const { error } = await supabase.from('tasks').update({ status: nextStatus }).eq('id', task.id);
    if (!error) setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
  };

  if (profileLoading || loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  const done = tasks.filter((t) => t.status === 'done');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">My Tasks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Work assigned to you.{' '}
          <Link href="/tasks" className="text-primary hover:underline">
            Open full task list
          </Link>
        </p>
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <ListChecks className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No tasks assigned to you yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {[...open, ...done].map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-border p-4">
              <Checkbox checked={t.status === 'done'} onCheckedChange={() => handleToggleDone(t)} />
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium ${
                    t.status === 'done' ? 'text-muted-foreground line-through' : 'text-foreground'
                  }`}
                >
                  {t.title}
                </p>
                {t.due_date && <p className="text-xs text-muted-foreground">Due {t.due_date}</p>}
              </div>
              <span className={`text-xs font-medium capitalize ${PRIORITY_COLOR[t.priority]}`}>
                {t.priority}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
