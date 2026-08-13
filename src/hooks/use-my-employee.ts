'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';

/**
 * Resolves the signed-in user's own `employees` row for the current
 * account. Every /staff/* page needs this — it's the join key for
 * attendance, leave, roster, performance and goals, all of which are
 * scoped to `employee_id`, not `user_id` directly.
 *
 * Returns `employeeId: null` (once `loading` is false) for a member
 * with no linked employee row — HR staff who manage the account but
 * aren't themselves an employee record, or a login that hasn't been
 * linked yet.
 */
export function useMyEmployee(): { employeeId: string | null; loading: boolean } {
  const { accountId, user, profileLoading } = useAuth();
  const supabase = createClient();
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accountId || !user) {
        if (!profileLoading) setLoading(false);
        return;
      }
      setLoading(true);
      const { data } = await supabase
        .from('employees')
        .select('id')
        .eq('account_id', accountId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!cancelled) {
        setEmployeeId((data?.id as string | undefined) ?? null);
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accountId, user, profileLoading, supabase]);

  return { employeeId, loading: loading || profileLoading };
}
