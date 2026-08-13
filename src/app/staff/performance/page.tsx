'use client';

// ============================================================
// Staff — My Performance.
//
// Read-only self view over `performance_reviews` (050) — writing a
// review stays a manager/admin action on /hr/performance.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMyEmployee } from '@/hooks/use-my-employee';
import { Target, Loader2, Star } from 'lucide-react';

interface Review {
  id: string;
  review_period_start: string;
  review_period_end: string;
  rating: number | null;
  comments: string | null;
  strengths: string | null;
  improvements: string | null;
  final_result: string | null;
}

export default function StaffPerformancePage() {
  const { employeeId, loading: employeeLoading } = useMyEmployee();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<Review[]>([]);

  const load = useCallback(async () => {
    if (!employeeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('performance_reviews')
      .select(
        'id, review_period_start, review_period_end, rating, comments, strengths, improvements, final_result',
      )
      .eq('employee_id', employeeId)
      .order('review_period_end', { ascending: false });
    setReviews((data as Review[]) ?? []);
    setLoading(false);
  }, [employeeId, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!employeeLoading) void load();
  }, [employeeLoading, load]);

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
        <h1 className="text-2xl font-bold tracking-tight text-foreground">My Performance</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your review history.</p>
      </div>

      {!employeeId ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          <Target className="size-5" />
          You&rsquo;re not linked to an employee record, so there are no reviews to show.
        </div>
      ) : reviews.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-12 text-center">
          <Target className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No reviews yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">
                  {r.review_period_start} → {r.review_period_end}
                </p>
                {r.rating !== null && (
                  <span className="flex items-center gap-1 text-sm font-semibold text-foreground">
                    <Star className="size-4 fill-current text-amber-400" />
                    {r.rating}
                  </span>
                )}
              </div>
              {r.final_result && (
                <p className="mt-1 text-xs capitalize text-muted-foreground">{r.final_result}</p>
              )}
              {r.strengths && (
                <p className="mt-3 text-sm text-foreground">
                  <span className="font-medium">Strengths: </span>
                  {r.strengths}
                </p>
              )}
              {r.improvements && (
                <p className="mt-1.5 text-sm text-foreground">
                  <span className="font-medium">To improve: </span>
                  {r.improvements}
                </p>
              )}
              {r.comments && <p className="mt-1.5 text-sm text-muted-foreground">{r.comments}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
