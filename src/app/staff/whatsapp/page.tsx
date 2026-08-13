'use client';

// ============================================================
// Staff — My WhatsApp.
//
// Conversations assigned to me (conversations.assigned_agent_id),
// deep-linking into the SAME inbox the CRM uses (/inbox?c=<id>) —
// not a second inbox. This is just "my slice of the shared inbox."
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { MessageCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface Conversation {
  id: string;
  status: string;
  last_message_text: string | null;
  last_message_at: string | null;
  unread_count: number;
  contact_name: string | null;
  contact_phone: string | null;
}

export default function StaffWhatsAppPage() {
  const { user, profileLoading } = useAuth();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('conversations')
      .select('id, status, last_message_text, last_message_at, unread_count, contacts(name, phone)')
      .eq('assigned_agent_id', user.id)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(50);
    setConversations(
      ((data ?? []) as unknown as {
        id: string;
        status: string;
        last_message_text: string | null;
        last_message_at: string | null;
        unread_count: number;
        contacts: { name: string | null; phone: string | null } | null;
      }[]).map((c) => ({
        id: c.id,
        status: c.status,
        last_message_text: c.last_message_text,
        last_message_at: c.last_message_at,
        unread_count: c.unread_count,
        contact_name: c.contacts?.name ?? null,
        contact_phone: c.contacts?.phone ?? null,
      })),
    );
    setLoading(false);
  }, [user, supabase]);

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
        <h1 className="text-2xl font-bold tracking-tight text-foreground">My WhatsApp</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Conversations assigned to you.{' '}
          <Link href="/inbox" className="text-primary hover:underline">
            Open full inbox
          </Link>
        </p>
      </div>

      {conversations.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-12 text-center">
          <MessageCircle className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No conversations assigned to you yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map((c) => (
            <Link
              key={c.id}
              href={`/inbox?c=${c.id}`}
              className="flex items-center justify-between rounded-2xl border border-border p-4 transition-colors hover:bg-muted"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {c.contact_name ?? c.contact_phone ?? 'Unknown'}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {c.last_message_text ?? 'No messages yet'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {c.unread_count > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                    {c.unread_count}
                  </span>
                )}
                <span className="text-xs capitalize text-muted-foreground">{c.status}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
