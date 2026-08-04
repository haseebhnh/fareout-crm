import {
  Camera,
  Globe,
  Mail,
  MessagesSquare,
  MessageSquare,
  Plug,
  Star,
  type LucideIcon,
} from 'lucide-react';

/**
 * The channel catalog — every inbound source a company can connect.
 *
 * Today exactly one channel is implemented end to end (WhatsApp). This
 * module exists so the others are represented *honestly*: the Channels
 * page reads from here, so a channel that is not built shows as
 * "Planned" rather than offering a Connect button that leads nowhere.
 *
 * ## Why the rest are not built yet
 *
 * `conversations` and `messages` are modelled around WhatsApp — a
 * conversation is keyed to a phone number, and the inbox, automations,
 * broadcasts and AI assistant all assume that. Adding a second channel
 * means introducing a channel dimension underneath all of it. That
 * refactor is the real cost; each channel after it is comparatively
 * cheap, which is why `effort` below is relative to it.
 *
 * When a channel ships, flip its `status` to 'available'. Nothing else
 * needs to change — the page renders off this list.
 */

export type ChannelStatus =
  /** Implemented end to end and connectable today. */
  | 'available'
  /** Not built. Shown so the roadmap is visible, never as connectable. */
  | 'planned';

export interface ChannelMeta {
  id: string;
  name: string;
  /** One line on what connecting it actually does. */
  description: string;
  icon: LucideIcon;
  status: ChannelStatus;
  /**
   * What it would take, for the planned ones. Shown in the UI so the
   * cost is visible at the point of asking rather than discovered later.
   */
  note?: string;
}

export const CHANNELS: ReadonlyArray<ChannelMeta> = [
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    description:
      'Shared inbox on the official Cloud API — assignment, templates, broadcasts, automations.',
    icon: MessageSquare,
    status: 'available',
  },
  {
    id: 'instagram',
    name: 'Instagram DMs',
    description: 'Direct messages and story replies land in the same inbox.',
    icon: Camera,
    status: 'planned',
    note: 'Reuses the Meta Graph plumbing WhatsApp already uses, so it is the cheapest channel to add after the shared conversation model exists. Needs Meta app review.',
  },
  {
    id: 'messenger',
    name: 'Facebook Messenger',
    description: 'Page messages routed to agents alongside WhatsApp.',
    icon: MessagesSquare,
    status: 'planned',
    note: 'Same Meta webhook shape as Instagram; the two are usually built together.',
  },
  {
    id: 'website',
    name: 'Website chat',
    description: 'An embeddable widget for your site, with visitor identity.',
    icon: Globe,
    status: 'planned',
    note: 'The largest of these: a hosted widget, anonymous-visitor identity, and our own realtime transport. No Meta involvement, so almost nothing is reusable.',
  },
  {
    id: 'email',
    name: 'Email',
    description: 'Inbound email as conversations; replies sent from the thread.',
    icon: Mail,
    status: 'planned',
    note: 'Needs an inbound provider (SES/SendGrid/IMAP), MIME parsing, and threading by Message-ID.',
  },
  {
    id: 'google-reviews',
    name: 'Google Reviews',
    description: 'Business Profile reviews surfaced for reply and tracking.',
    icon: Star,
    status: 'planned',
    note: 'Not really a conversation — reviews are public, one-reply-per-review, and rating-scored. Likely its own surface rather than an inbox channel.',
  },
  {
    id: 'custom-api',
    name: 'Custom / ERP',
    description:
      'Push leads in from any external system — Fareout, Sugar Lover, or your ERP.',
    icon: Plug,
    // Deliberately 'available': this is not a promise of a future
    // integration, it is the public REST API that already ships.
    status: 'available',
    note: 'Already live. Create a key under API keys, then POST /api/v1/contacts. No per-system integration needed — anything that can send an HTTP request can feed leads in.',
  },
];

export function getChannel(id: string): ChannelMeta | undefined {
  return CHANNELS.find((c) => c.id === id);
}
