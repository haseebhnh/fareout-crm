'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { CHANNELS, type ChannelMeta } from '@/lib/channels/catalog';
import { cn } from '@/lib/utils';
import {
  ChannelConnectDialog,
  type ConnectableChannel,
} from './channel-connect-dialog';

/**
 * Channels — one page showing every inbound source and whether this
 * account has it connected.
 *
 * Connection state comes from two places: WhatsApp keeps its own
 * whatsapp_config table, everything else lives in channel_connections.
 * Planned channels render as roadmap entries with no Connect
 * affordance — a dead button is worse than none, because it implies the
 * integration is one click away.
 */
export function ChannelsPanel() {
  const [whatsappConnected, setWhatsappConnected] = useState<boolean | null>(
    null,
  );
  // channel -> connected. Loaded from channel_connections for every
  // channel that has a real connection row (currently the Meta pair).
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [dialogChannel, setDialogChannel] =
    useState<ConnectableChannel | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      // RLS scopes both reads to the caller's account.
      const [{ data: wa }, { data: rows }] = await Promise.all([
        supabase.from('whatsapp_config').select('status').maybeSingle(),
        supabase.from('channel_connections').select('channel, status'),
      ]);
      if (cancelled) return;
      setWhatsappConnected(wa?.status === 'connected');
      const map: Record<string, boolean> = {};
      for (const row of rows ?? []) {
        map[row.channel as string] = row.status === 'connected';
      }
      setConnected(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const available = CHANNELS.filter((c) => c.status === 'available');
  const planned = CHANNELS.filter((c) => c.status === 'planned');

  const isMetaChannel = (id: string): id is ConnectableChannel =>
    id === 'instagram' || id === 'messenger';

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
                channel.id === 'whatsapp'
                  ? whatsappConnected
                  : isMetaChannel(channel.id)
                    ? (connected[channel.id] ?? false)
                    : null
              }
              href={
                channel.id === 'whatsapp'
                  ? '/settings?tab=whatsapp'
                  : channel.id === 'custom-api'
                    ? '/settings?tab=api'
                    : undefined
              }
              onConnect={
                isMetaChannel(channel.id)
                  ? () => setDialogChannel(channel.id as ConnectableChannel)
                  : undefined
              }
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">Planned</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Not built yet. Unlike the Meta channels, these don&apos;t reuse
            existing plumbing — website chat needs a hosted widget and its
            own realtime transport, email needs an inbound provider, and
            reviews aren&apos;t conversations at all.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {planned.map((channel) => (
            <ChannelCard key={channel.id} channel={channel} connected={null} />
          ))}
        </div>
      </section>

      <ChannelConnectDialog
        channel={dialogChannel}
        open={dialogChannel !== null}
        onOpenChange={(open) => !open && setDialogChannel(null)}
        onConnected={reload}
      />
    </div>
  );
}

function ChannelCard({
  channel,
  connected,
  href,
  onConnect,
}: {
  channel: ChannelMeta;
  /** null when the channel has no connection concept yet. */
  connected: boolean | null;
  href?: string;
  /** Present only for channels that connect via the dialog. */
  onConnect?: () => void;
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
        {onConnect && (
          <button
            type="button"
            onClick={onConnect}
            className="mt-1 shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-muted"
          >
            {connected ? 'Reconnect' : 'Connect'}
          </button>
        )}
      </div>
    </>
  );

  const className = cn(
    'rounded-2xl border border-border bg-card p-4 text-left transition-colors',
    href && 'hover:bg-card-2',
    // Only roadmap entries are dimmed. A connectable card without an
    // href is still fully interactive via its Connect button.
    isPlanned && 'opacity-75',
  );

  return href ? (
    <Link href={href} className={cn(className, 'block')}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}
