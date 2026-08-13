'use client';

// ============================================================
// Staff — My Customers.
//
// Contacts don't carry an "assigned to" column of their own — deals
// do. This page derives "my customers" as the distinct contacts
// behind deals assigned to me, rather than inventing a new
// contacts.assigned_to column just for this view.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Users, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface Customer {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  company: string | null;
  deal_count: number;
}

export default function StaffCustomersPage() {
  const { profile, profileLoading } = useAuth();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const load = useCallback(async () => {
    if (!profile?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('deals')
      .select('contact_id, contacts(id, name, phone, email, company)')
      .eq('assigned_to', profile.id);

    const byContact = new Map<string, Customer>();
    for (const row of (data ?? []) as unknown as {
      contact_id: string;
      contacts: { id: string; name: string | null; phone: string; email: string | null; company: string | null } | null;
    }[]) {
      const c = row.contacts;
      if (!c) continue;
      const existing = byContact.get(c.id);
      if (existing) existing.deal_count += 1;
      else byContact.set(c.id, { ...c, deal_count: 1 });
    }
    setCustomers(Array.from(byContact.values()).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')));
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">My Customers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Contacts behind the deals assigned to you.{' '}
          <Link href="/contacts" className="text-primary hover:underline">
            Open full contacts
          </Link>
        </p>
      </div>

      {customers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-12 text-center">
          <Users className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No customers linked to your deals yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {customers.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-2xl border border-border p-4">
              <div>
                <p className="text-sm font-medium text-foreground">{c.name ?? c.phone}</p>
                <p className="text-xs text-muted-foreground">
                  {c.company ?? '—'} · {c.phone}
                  {c.email ? ` · ${c.email}` : ''}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {c.deal_count} deal{c.deal_count === 1 ? '' : 's'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
