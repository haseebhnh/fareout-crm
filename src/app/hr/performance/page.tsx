'use client';

// ============================================================
// HR — Performance: goals and reviews.
//
// Goals: admin sets them (goals_insert requires admin+); the goal
// owner reports progress via current_value/status only — enforced
// by the goals_restrict_self_update trigger (migration 050), not
// just the UI, so this page updating only those two fields is a
// courtesy, not the actual security boundary.
// Reviews: admin-authored, immutable once written (no UPDATE policy
// exists on performance_reviews at all — see migration 050).
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Target, ClipboardList, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Employee {
  id: string;
  full_name: string;
}

interface Goal {
  id: string;
  employee_id: string;
  title: string;
  kpi: string | null;
  target_value: number | null;
  current_value: number;
  unit: string | null;
  due_date: string | null;
  status: 'not_started' | 'in_progress' | 'completed' | 'missed';
}

interface Review {
  id: string;
  employee_id: string;
  review_period_start: string;
  review_period_end: string;
  rating: number | null;
  comments: string | null;
  final_result: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<Goal['status'], string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  missed: 'Missed',
};

export default function PerformancePage() {
  const { accountId, canManageMembers, profileLoading, user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [reviews, setReviews] = useState<(Review & { employee_name: string })[]>([]);

  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [goalForm, setGoalForm] = useState({
    employee_id: '',
    title: '',
    kpi: '',
    target_value: '',
    unit: '',
    due_date: '',
  });
  const [reviewForm, setReviewForm] = useState({
    employee_id: '',
    review_period_start: '',
    review_period_end: '',
    rating: '',
    comments: '',
    final_result: '',
  });

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
      const { data: empRows } = await supabase
        .from('employees')
        .select('id, full_name')
        .order('full_name');
      setEmployees((empRows as Employee[]) ?? []);
    }

    const { data: goalRows } = await supabase
      .from('goals')
      .select('id, employee_id, title, kpi, target_value, current_value, unit, due_date, status')
      .order('due_date', { ascending: true, nullsFirst: false });
    setGoals((goalRows as Goal[]) ?? []);

    const { data: reviewRows } = await supabase
      .from('performance_reviews')
      .select(
        'id, employee_id, review_period_start, review_period_end, rating, comments, final_result, created_at, employees(full_name)',
      )
      .order('created_at', { ascending: false });
    setReviews(
      ((reviewRows ?? []) as unknown as (Review & {
        employees: { full_name: string } | null;
      })[]).map((r) => ({ ...r, employee_name: r.employees?.full_name ?? '—' })),
    );

    setLoading(false);
  }, [accountId, user, canManageMembers, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const handleCreateGoal = async () => {
    if (!goalForm.employee_id || !goalForm.title.trim()) {
      toast.error('Employee and title are required');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('goals').insert({
      account_id: accountId,
      employee_id: goalForm.employee_id,
      title: goalForm.title.trim(),
      kpi: goalForm.kpi.trim() || null,
      target_value: goalForm.target_value ? Number(goalForm.target_value) : null,
      unit: goalForm.unit.trim() || null,
      due_date: goalForm.due_date || null,
    });
    if (error) toast.error(error.message || 'Failed to create goal');
    else {
      toast.success('Goal created');
      setGoalDialogOpen(false);
      setGoalForm({ employee_id: '', title: '', kpi: '', target_value: '', unit: '', due_date: '' });
      await load();
    }
    setSaving(false);
  };

  const handleProgressUpdate = async (goal: Goal, current_value: number) => {
    // Only current_value/status — the trigger rejects anything else
    // from a non-admin caller, this mirrors that at the call site.
    const status: Goal['status'] =
      goal.target_value != null && current_value >= goal.target_value
        ? 'completed'
        : goal.status === 'not_started'
          ? 'in_progress'
          : goal.status;
    const { error } = await supabase
      .from('goals')
      .update({ current_value, status })
      .eq('id', goal.id);
    if (error) toast.error(error.message || 'Failed to update progress');
    else {
      setGoals((prev) =>
        prev.map((g) => (g.id === goal.id ? { ...g, current_value, status } : g)),
      );
    }
  };

  const handleCreateReview = async () => {
    if (
      !reviewForm.employee_id ||
      !reviewForm.review_period_start ||
      !reviewForm.review_period_end
    ) {
      toast.error('Employee and review period are required');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('performance_reviews').insert({
      account_id: accountId,
      employee_id: reviewForm.employee_id,
      reviewer_id: user?.id,
      review_period_start: reviewForm.review_period_start,
      review_period_end: reviewForm.review_period_end,
      rating: reviewForm.rating ? Number(reviewForm.rating) : null,
      comments: reviewForm.comments.trim() || null,
      final_result: reviewForm.final_result.trim() || null,
    });
    if (error) toast.error(error.message || 'Failed to save review');
    else {
      toast.success('Review recorded');
      setReviewDialogOpen(false);
      setReviewForm({
        employee_id: '',
        review_period_start: '',
        review_period_end: '',
        rating: '',
        comments: '',
        final_result: '',
      });
      await load();
    }
    setSaving(false);
  };

  const visibleGoals = canManageMembers
    ? goals
    : goals.filter((g) => g.employee_id === myEmployeeId);
  const visibleReviews = canManageMembers
    ? reviews
    : reviews.filter((r) => r.employee_id === myEmployeeId);

  if (loading || profileLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Performance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Goals, KPIs, and review history.
        </p>
      </div>

      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Goals</h2>
          {canManageMembers && (
            <Button size="sm" onClick={() => setGoalDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> New goal
            </Button>
          )}
        </div>
        {visibleGoals.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-12 text-center">
            <Target className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No goals set yet.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {visibleGoals.map((g) => {
              const progress =
                g.target_value && g.target_value > 0
                  ? Math.min(100, Math.round((g.current_value / g.target_value) * 100))
                  : null;
              const canEditProgress = canManageMembers || g.employee_id === myEmployeeId;
              return (
                <div key={g.id} className="rounded-2xl border border-border p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{g.title}</p>
                      {g.kpi && <p className="text-xs text-muted-foreground">{g.kpi}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {STATUS_LABEL[g.status]}
                    </span>
                  </div>
                  {g.target_value != null && (
                    <>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${progress ?? 0}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {g.current_value} / {g.target_value} {g.unit ?? ''} ({progress ?? 0}%)
                      </p>
                    </>
                  )}
                  {canEditProgress && (
                    <div className="mt-3 flex items-center gap-2">
                      <Input
                        type="number"
                        defaultValue={g.current_value}
                        className="h-8 w-24 text-xs"
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isNaN(v) && v !== g.current_value) {
                            void handleProgressUpdate(g, v);
                          }
                        }}
                      />
                      <span className="text-xs text-muted-foreground">Update progress</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Reviews</h2>
          {canManageMembers && (
            <Button size="sm" onClick={() => setReviewDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> New review
            </Button>
          )}
        </div>
        {visibleReviews.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-12 text-center">
            <ClipboardList className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No reviews recorded yet.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  {canManageMembers && <TableHead>Employee</TableHead>}
                  <TableHead>Period</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleReviews.map((r) => (
                  <TableRow key={r.id}>
                    {canManageMembers && (
                      <TableCell className="font-medium text-foreground">
                        {r.employee_name}
                      </TableCell>
                    )}
                    <TableCell>
                      {r.review_period_start} – {r.review_period_end}
                    </TableCell>
                    <TableCell>{r.rating ?? '—'}</TableCell>
                    <TableCell>{r.final_result ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New goal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select
                value={goalForm.employee_id}
                onValueChange={(v) => setGoalForm((f) => ({ ...f, employee_id: v ?? '' }))}
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-title">Title</Label>
              <Input
                id="goal-title"
                value={goalForm.title}
                onChange={(e) => setGoalForm((f) => ({ ...f, title: e.target.value }))}
                disabled={saving}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="goal-target">Target</Label>
                <Input
                  id="goal-target"
                  type="number"
                  value={goalForm.target_value}
                  onChange={(e) => setGoalForm((f) => ({ ...f, target_value: e.target.value }))}
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="goal-unit">Unit</Label>
                <Input
                  id="goal-unit"
                  value={goalForm.unit}
                  onChange={(e) => setGoalForm((f) => ({ ...f, unit: e.target.value }))}
                  placeholder="e.g. AED, %"
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="goal-due">Due date</Label>
                <Input
                  id="goal-due"
                  type="date"
                  value={goalForm.due_date}
                  onChange={(e) => setGoalForm((f) => ({ ...f, due_date: e.target.value }))}
                  disabled={saving}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGoalDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleCreateGoal} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New review</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select
                value={reviewForm.employee_id}
                onValueChange={(v) => setReviewForm((f) => ({ ...f, employee_id: v ?? '' }))}
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rev-start">Period start</Label>
                <Input
                  id="rev-start"
                  type="date"
                  value={reviewForm.review_period_start}
                  onChange={(e) =>
                    setReviewForm((f) => ({ ...f, review_period_start: e.target.value }))
                  }
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rev-end">Period end</Label>
                <Input
                  id="rev-end"
                  type="date"
                  value={reviewForm.review_period_end}
                  onChange={(e) =>
                    setReviewForm((f) => ({ ...f, review_period_end: e.target.value }))
                  }
                  disabled={saving}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rev-rating">Rating</Label>
                <Input
                  id="rev-rating"
                  type="number"
                  step="0.1"
                  value={reviewForm.rating}
                  onChange={(e) => setReviewForm((f) => ({ ...f, rating: e.target.value }))}
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rev-result">Final result</Label>
                <Input
                  id="rev-result"
                  value={reviewForm.final_result}
                  onChange={(e) => setReviewForm((f) => ({ ...f, final_result: e.target.value }))}
                  disabled={saving}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rev-comments">Comments</Label>
              <Textarea
                id="rev-comments"
                value={reviewForm.comments}
                onChange={(e) => setReviewForm((f) => ({ ...f, comments: e.target.value }))}
                rows={3}
                disabled={saving}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReviewDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateReview} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
