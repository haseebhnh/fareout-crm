'use client';

// ============================================================
// Sales — performance dashboard over the SAME `deals`/`pipeline_stages`
// tables the CRM's Pipelines page uses. Not a second pipeline: this is
// a reporting/leaderboard layer, the way HR Reports aggregates over
// employees rather than re-modelling them. No new tables.
//
// Deal values are summed raw across currencies and displayed in the
// account's default currency — the same convention the main CRM
// dashboard already uses (src/lib/dashboard/queries.ts), not a new
// inconsistency introduced here.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/currency';
import { BarChart3, DollarSign, Loader2, Target, Trophy } from 'lucide-react';

interface Deal {
  id: string;
  value: number;
  status: 'open' | 'won' | 'lost';
  assigned_to: string | null;
  expected_close_date: string | null;
  updated_at: string;
  stage_id: string;
}

interface Profile {
  id: string;
  full_name: string;
}

interface Stage {
  id: string;
  name: string;
  position: number;
}

function monthRange(offset = 0): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default function SalesPage() {
  const { accountId, defaultCurrency } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const [dealRes, profileRes, stageRes] = await Promise.all([
      supabase
        .from('deals')
        .select('id, value, status, assigned_to, expected_close_date, updated_at, stage_id'),
      supabase.from('profiles').select('id, full_name'),
      supabase.from('pipeline_stages').select('id, name, position').order('position'),
    ]);
    setDeals((dealRes.data as Deal[]) ?? []);
    setProfiles((profileRes.data as Profile[]) ?? []);
    setStages((stageRes.data as Stage[]) ?? []);
    setLoading(false);
  }, [accountId, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const nameFor = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? 'Unassigned';
  const { from: monthFrom, to: monthTo } = monthRange();

  const openDeals = deals.filter((d) => d.status === 'open');
  const openValue = openDeals.reduce((sum, d) => sum + Number(d.value ?? 0), 0);

  const wonThisMonth = deals.filter(
    (d) => d.status === 'won' && d.updated_at.slice(0, 10) >= monthFrom && d.updated_at.slice(0, 10) <= monthTo,
  );
  const lostThisMonth = deals.filter(
    (d) => d.status === 'lost' && d.updated_at.slice(0, 10) >= monthFrom && d.updated_at.slice(0, 10) <= monthTo,
  );
  const wonValueThisMonth = wonThisMonth.reduce((sum, d) => sum + Number(d.value ?? 0), 0);
  const decidedThisMonth = wonThisMonth.length + lostThisMonth.length;
  const winRate = decidedThisMonth > 0 ? Math.round((wonThisMonth.length / decidedThisMonth) * 100) : null;

  const leaderboard = Array.from(
    wonThisMonth.reduce((map, d) => {
      const key = d.assigned_to ?? '__unassigned__';
      const row = map.get(key) ?? { count: 0, value: 0 };
      row.count += 1;
      row.value += Number(d.value ?? 0);
      map.set(key, row);
      return map;
    }, new Map<string, { count: number; value: number }>()),
  )
    .map(([id, row]) => ({ id: id === '__unassigned__' ? null : id, ...row }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const stageBreakdown = stages.map((s) => {
    const stageDeals = openDeals.filter((d) => d.stage_id === s.id);
    return {
      ...s,
      count: stageDeals.length,
      value: stageDeals.reduce((sum, d) => sum + Number(d.value ?? 0), 0),
    };
  });
  const maxStageValue = Math.max(1, ...stageBreakdown.map((s) => s.value));

  const statCard = (icon: React.ReactNode, label: string, value: string, sub?: string) => (
    <div className="rounded-2xl border border-border p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Sales</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Team performance over the shared pipeline — computed live.
        </p>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCard(
          <DollarSign className="size-4" />,
          'Open pipeline',
          formatCurrency(openValue, defaultCurrency),
          `${openDeals.length} open deals`,
        )}
        {statCard(
          <Trophy className="size-4" />,
          'Won this month',
          formatCurrency(wonValueThisMonth, defaultCurrency),
          `${wonThisMonth.length} deals`,
        )}
        {statCard(<Target className="size-4" />, 'Win rate', winRate === null ? '—' : `${winRate}%`, 'This month')}
        {statCard(
          <BarChart3 className="size-4" />,
          'Lost this month',
          String(lostThisMonth.length),
          'Deals marked lost',
        )}
      </div>

      <div className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-foreground">Open pipeline by stage</h2>
        {stageBreakdown.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pipeline stages yet.</p>
        ) : (
          <div className="space-y-2">
            {stageBreakdown.map((s) => (
              <div key={s.id} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-sm text-foreground">{s.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${(s.value / maxStageValue) * 100}%` }} />
                </div>
                <span className="w-28 shrink-0 text-right text-sm text-muted-foreground">
                  {formatCurrency(s.value, defaultCurrency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Leaderboard — won this month</h2>
        {leaderboard.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-12 text-center">
            <Trophy className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No deals won yet this month.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((row, i) => (
              <div
                key={row.id ?? 'unassigned'}
                className="flex items-center justify-between rounded-2xl border border-border p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium text-foreground">{nameFor(row.id)}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {formatCurrency(row.value, defaultCurrency)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.count} deal{row.count === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
