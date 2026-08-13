'use client';

// ============================================================
// Staff — My Deals.
//
// A personal filter over the SAME `deals` table the CRM's Pipelines
// page uses (deals.assigned_to = my profile id) — not a second
// pipeline system. RLS is unchanged (account-wide for agent+); this
// page just narrows the query, the way HR's self-views narrow
// `employee_id = mine` instead of adding a new access tier.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { GitBranch, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface Deal {
  id: string;
  title: string;
  value: number;
  currency: string;
  status: string;
  contact_id: string;
  contact_name: string | null;
  stage_name: string | null;
}

export default function StaffDealsPage() {
  const { profile, profileLoading } = useAuth();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<Deal[]>([]);

  const load = useCallback(async () => {
    if (!profile?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('deals')
      .select('id, title, value, currency, status, contact_id, contacts(name), pipeline_stages(name)')
      .eq('assigned_to', profile.id)
      .order('updated_at', { ascending: false });
    setDeals(
      ((data ?? []) as unknown as {
        id: string;
        title: string;
        value: number;
        currency: string;
        status: string;
        contact_id: string;
        contacts: { name: string | null } | null;
        pipeline_stages: { name: string } | null;
      }[]).map((d) => ({
        id: d.id,
        title: d.title,
        value: d.value,
        currency: d.currency,
        status: d.status,
        contact_id: d.contact_id,
        contact_name: d.contacts?.name ?? null,
        stage_name: d.pipeline_stages?.name ?? null,
      })),
    );
    setLoading(false);
  }, [profile, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!profileLoading) void load();
  }, [profileLoading, load]);

  if (profileLoading || loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const totalValue = deals
    .filter((d) => d.status === 'active')
    .reduce((sum, d) => sum + Number(d.value ?? 0), 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">My Deals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Deals assigned to you, from the shared pipeline.{' '}
          <Link href="/pipelines" className="text-primary hover:underline">
            Open full pipeline
          </Link>
        </p>
      </div>

      {deals.length > 0 && (
        <div className="mb-6 rounded-2xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Open pipeline value</p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {deals[0]?.currency ?? 'USD'} {totalValue.toLocaleString()}
          </p>
        </div>
      )}

      {deals.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-12 text-center">
          <GitBranch className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No deals assigned to you yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {deals.map((d) => (
            <Link
              key={d.id}
              href="/pipelines"
              className="flex items-center justify-between rounded-2xl border border-border p-4 transition-colors hover:bg-muted"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{d.title}</p>
                <p className="text-xs text-muted-foreground">
                  {d.contact_name ?? 'No contact'} · {d.stage_name ?? 'No stage'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground">
                  {d.currency} {Number(d.value).toLocaleString()}
                </p>
                <p className="text-xs capitalize text-muted-foreground">{d.status}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
