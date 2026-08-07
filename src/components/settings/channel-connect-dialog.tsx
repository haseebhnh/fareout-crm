'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Connect an Instagram business account or a Facebook Page.
 *
 * Both post to the same endpoint and differ only in labels: they share
 * one Graph API, one webhook and one credential shape, which is why
 * they shipped together.
 */

const COPY = {
  instagram: {
    title: 'Connect Instagram DMs',
    description:
      'Direct messages and story replies will land in your shared inbox.',
    idLabel: 'Instagram business account ID',
    idHint: 'Meta → Business Settings → Accounts → Instagram accounts.',
    tokenHint:
      'A Page access token with instagram_manage_messages and pages_messaging.',
  },
  messenger: {
    title: 'Connect Facebook Messenger',
    description: 'Page messages will be routed to agents alongside WhatsApp.',
    idLabel: 'Facebook Page ID',
    idHint: 'Meta → Business Settings → Accounts → Pages.',
    tokenHint: 'A Page access token with pages_messaging.',
  },
} as const;

export type ConnectableChannel = keyof typeof COPY;

export function ChannelConnectDialog({
  channel,
  open,
  onOpenChange,
  onConnected,
}: {
  channel: ConnectableChannel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: () => void;
}) {
  const [externalId, setExternalId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [saving, setSaving] = useState(false);

  if (!channel) return null;
  const copy = COPY[channel];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          external_id: externalId,
          access_token: accessToken,
          app_secret: appSecret || null,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error ?? 'Could not connect the channel.');
        return;
      }
      toast.success(`${copy.title.replace('Connect ', '')} connected.`);
      // Clear the credential fields before closing — no reason to keep
      // a token in component state once it is stored.
      setExternalId('');
      setAccessToken('');
      setAppSecret('');
      onOpenChange(false);
      onConnected();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">{copy.idLabel}</Label>
            <Input
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder="1784xxxxxxxxxxx"
              required
            />
            <p className="text-xs text-muted-foreground">{copy.idHint}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">Access token</Label>
            <Input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="EAAG..."
              required
            />
            <p className="text-xs text-muted-foreground">{copy.tokenHint}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">
              App secret
              <span className="ml-1 text-muted-foreground">(optional)</span>
            </Label>
            <Input
              type="password"
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              placeholder="Leave blank to use the platform app secret"
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Only needed if this channel is under your own Meta app.
              Webhook deliveries are verified against it.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-muted p-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              After saving, point the Meta webhook for this product at the
              same callback URL WhatsApp uses. Instagram, Messenger and
              WhatsApp all share one endpoint.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Connecting…
                </>
              ) : (
                'Connect'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
