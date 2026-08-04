'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { CHANNELS, type ChannelMeta } from '@/lib/channels/catalog';
import { cn } from '@/lib/utils';

/**
 * Channels — one page showing every inbound source and whether this
 * account has it connected.
 *
 * Live connection state is only meaningful for channels that exist, so
 * only WhatsApp is queried. Planned channels render as roadmap entries
 * with no Connect affordance: showing a dead button would be worse than
 * showing nothing, because it implies the integration is one click away.
 */
export function ChannelsPanel() {
  const [whatsappConnected, setWhatsappConnected] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      // RLS scopes this to the caller's account, so no explicit filter.
      const { data } = await supabase
        .from('whatsapp_config')
        .select('status')
        .maybeSingle();
      if (!cancelled) setWhatsappConnected(data?.status === 'connected');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const available = CHANNELS.filter((c) => c.status === 'available');
  const planned = CHANNELS.filter((c) => c.status === 'planned');

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">Available now</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {available.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              connected={
                channel.id === 'whatsapp' ? whatsappConnected : null
              }
              href={
                channel.id === 'whatsapp'
                  ? '/settings?tab=whatsapp'
                  : '/settings?tab=api'
              }
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">Planned</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Not built yet. Each needs a shared conversation model that
            isn&apos;t tied to a phone number — that groundwork is the bulk
            of the work, after which these get much cheaper.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {planned.map((channel) => (
            <ChannelCard key={channel.id} channel={channel} connected={null} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ChannelCard({
  channel,
  connected,
  href,
}: {
  channel: ChannelMeta;
  /** null when the channel has no connection concept yet. */
  connected: boolean | null;
  href?: string;
}) {
  const Icon = channel.icon;
  const isPlanned = channel.status === 'planned';

  const inner = (
    <>
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl',
            isPlanned
              ? 'bg-muted text-muted-foreground'
              : 'bg-primary-soft text-primary',
          )}
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">
              {channel.name}
            </p>
            {connected === true && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-medium text-primary">
                <Check className="size-3" />
                Connected
              </span>
            )}
            {connected === false && (
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Not connected
              </span>
            )}
            {isPlanned && (
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Planned
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {channel.description}
          </p>
          {channel.note && (
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/80">
              {channel.note}
            </p>
          )}
        </div>
        {href && (
          <ChevronRight className="mt-2 size-4 shrink-0 text-muted-foreground" />
        )}
      </div>
    </>
  );

  const className = cn(
    'rounded-2xl border border-border bg-card p-4 text-left transition-colors',
    href ? 'hover:bg-card-2' : 'opacity-75',
  );

  return href ? (
    <Link href={href} className={cn(className, 'block')}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}
