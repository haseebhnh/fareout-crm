'use client';

import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { createClient } from '@/lib/supabase/client';
import { SettingsPanelHead } from './settings-panel-head';

interface AuditRow {
  id: string;
  action: string;
  actor_label: string | null;
  target_type: string;
  target_label: string | null;
  created_at: string;
}

/**
 * Read-only view of `audit_log` (migration 040) — who did what,
 * to what, and when.
 *
 * RLS already scopes the query to the caller's account and permits any
 * member to read (see the migration for why: visibility into "what
 * happened" is not itself sensitive, and restricting it to admins would
 * stop a viewer from noticing their own account was compromised). This
 * component fetches once on mount rather than subscribing to realtime
 * — an audit trail is reviewed after the fact, not watched live.
 */
export function AuditLogPanel() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from('audit_log')
        .select('id, action, actor_label, target_type, target_label, created_at')
        .order('created_at', { ascending: false })
        .limit(100);

      if (cancelled) return;
      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      setRows(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="max-w-3xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Activity log"
        description="Administrative and destructive actions taken on this account — who did what, and when."
      />

      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </p>
      )}

      {!error && rows === null && (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          Loading…
        </div>
      )}

      {!error && rows?.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <History className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nothing recorded yet. Actions like removing a teammate,
            changing a role, or updating WhatsApp credentials will
            appear here.
          </p>
        </div>
      )}

      {!error && rows && rows.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium">By</th>
                <th className="px-4 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {formatActionLabel(row.action)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.target_label ?? row.target_type}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.actor_label ?? 'System'}
                  </td>
                  <td
                    className="px-4 py-3 text-muted-foreground"
                    title={new Date(row.created_at).toLocaleString()}
                  >
                    {formatDistanceToNow(new Date(row.created_at), {
                      addSuffix: true,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** 'member.role_changed' -> 'Member role changed'. */
function formatActionLabel(action: string): string {
  const [, verb] = action.split('.');
  if (!verb) return action;
  const spaced = verb.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
