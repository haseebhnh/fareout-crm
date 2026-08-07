// ============================================================
// Instagram DMs + Facebook Messenger ingestion and sending.
//
// Both ride the same Meta Graph plumbing WhatsApp already uses, which
// is why they are the two cheapest channels to add — the webhook
// endpoint, HMAC verification and Graph client all exist. What differs
// is the payload shape: WhatsApp delivers `entry[].changes[]` with a
// `value.messages` array, while Messenger and Instagram deliver
// `entry[].messaging[]` with one event per element.
//
// Identity: Meta gives a *scoped* id (IGSID for Instagram, PSID for
// Messenger). It identifies the person only relative to your app, and
// is not a phone number or a public handle — which is exactly why
// migration 038 made contacts.phone nullable and introduced
// channel_identities.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { decrypt } from '@/lib/whatsapp/encryption';
import {
  resolveConversationByIdentity,
  ChannelResolveError,
} from '@/lib/channels/resolve-identity';

const GRAPH_VERSION = 'v21.0';

/** The two Meta messaging channels this module handles. */
export type MetaChannel = 'instagram' | 'messenger';

/**
 * One normalised inbound message, flattened from either payload shape
 * so the persistence path below has a single thing to handle.
 */
export interface InboundMetaMessage {
  channel: MetaChannel;
  /** The business side: Page id or IG business account id. */
  recipientId: string;
  /** The person: PSID or IGSID. */
  senderId: string;
  /** Meta's message id — used to dedupe redeliveries. */
  messageId: string;
  text: string | null;
  /** First attachment URL, when the message carries media. */
  mediaUrl: string | null;
  timestamp: string;
  /** True when the event is our own outbound message echoed back. */
  isEcho: boolean;
}

interface MetaMessagingEvent {
  sender?: { id?: unknown };
  recipient?: { id?: unknown };
  timestamp?: unknown;
  message?: {
    mid?: unknown;
    text?: unknown;
    is_echo?: unknown;
    attachments?: Array<{ payload?: { url?: unknown } }>;
  };
}

interface MetaEntry {
  id?: unknown;
  time?: unknown;
  messaging?: MetaMessagingEvent[];
}

/**
 * Flatten a Meta webhook body into inbound messages.
 *
 * Returns [] for anything that isn't a messaging event — WhatsApp
 * payloads, delivery receipts, read receipts, template updates. The
 * shared webhook route calls both this and the WhatsApp handler, so
 * this must silently ignore what isn't its own.
 *
 * Every field is type-guarded rather than trusted: this parses an
 * unauthenticated request body, and anything mishandled here is
 * reachable by anyone who knows the webhook URL.
 */
export function extractMetaMessages(
  body: unknown,
  channel: MetaChannel,
): InboundMetaMessage[] {
  if (!body || typeof body !== 'object') return [];
  const entries = (body as { entry?: unknown }).entry;
  if (!Array.isArray(entries)) return [];

  const out: InboundMetaMessage[] = [];

  for (const rawEntry of entries) {
    if (!rawEntry || typeof rawEntry !== 'object') continue;
    const entry = rawEntry as MetaEntry;
    if (!Array.isArray(entry.messaging)) continue;

    for (const event of entry.messaging) {
      if (!event || typeof event !== 'object') continue;

      const senderId = asId(event.sender?.id);
      const recipientId = asId(event.recipient?.id);
      const message = event.message;
      if (!senderId || !recipientId || !message) continue;

      const messageId = asId(message.mid);
      if (!messageId) continue;

      const attachments = Array.isArray(message.attachments)
        ? message.attachments
        : [];
      const firstUrl = attachments.length
        ? asId(attachments[0]?.payload?.url)
        : null;

      out.push({
        channel,
        recipientId,
        senderId,
        messageId,
        text: typeof message.text === 'string' ? message.text : null,
        mediaUrl: firstUrl,
        timestamp: asTimestamp(event.timestamp),
        // Meta echoes messages the business itself sent. Persisting
        // them as inbound would double every reply an agent makes and
        // wrongly bump unread counts.
        isEcho: message.is_echo === true,
      });
    }
  }

  return out;
}

function asId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  // Meta sends numeric ids unquoted in some payloads.
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function asTimestamp(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}

/**
 * The account that owns a Page / IG business account, plus its
 * decrypted token. Returns null when nobody has connected it — the
 * caller then ignores the delivery rather than erroring, because Meta
 * will keep retrying an endpoint that 500s.
 */
export async function resolveMetaConnection(
  db: SupabaseClient,
  channel: MetaChannel,
  externalId: string,
): Promise<{
  accountId: string;
  auditUserId: string;
  accessToken: string | null;
} | null> {
  const { data, error } = await db
    .from('channel_connections')
    .select('account_id, access_token')
    .eq('channel', channel)
    .eq('external_id', externalId)
    .maybeSingle();

  if (error || !data) return null;

  // Audit user: webhooks have no logged-in human, so rows are
  // attributed to the account owner — the same convention the WhatsApp
  // webhook uses (it attributes to the config owner).
  //
  // Membership lives on `profiles.account_role`; there is no separate
  // members table. `maybeSingle()` rather than `single()` because an
  // account with no owner row is a data problem, not a crash — we
  // return null and the delivery is ignored.
  const { data: owner } = await db
    .from('profiles')
    .select('user_id')
    .eq('account_id', data.account_id)
    .eq('account_role', 'owner')
    .limit(1)
    .maybeSingle();

  if (!owner?.user_id) return null;

  let accessToken: string | null = null;
  if (data.access_token) {
    try {
      accessToken = decrypt(data.access_token);
    } catch {
      // A token encrypted under a rotated ENCRYPTION_KEY. Inbound
      // still works (it needs no token); sending will fail loudly.
      accessToken = null;
    }
  }

  return {
    accountId: data.account_id as string,
    auditUserId: owner.user_id as string,
    accessToken,
  };
}

/**
 * Persist one inbound message: resolve the customer, resolve their
 * thread on this channel, insert the message, bump the conversation.
 *
 * Idempotent on Meta's message id — Meta retries any delivery it
 * doesn't get a fast 200 for, so without this a network blip would
 * duplicate messages in the inbox.
 */
export async function persistInboundMetaMessage(
  db: SupabaseClient,
  msg: InboundMetaMessage,
): Promise<{ persisted: boolean; reason?: string }> {
  if (msg.isEcho) return { persisted: false, reason: 'echo' };

  const connection = await resolveMetaConnection(
    db,
    msg.channel,
    msg.recipientId,
  );
  if (!connection) {
    return { persisted: false, reason: 'no_connection' };
  }

  // Redelivery check before doing any writes.
  const { data: seen } = await db
    .from('messages')
    .select('id')
    .eq('message_id', msg.messageId)
    .limit(1)
    .maybeSingle();
  if (seen?.id) return { persisted: false, reason: 'duplicate' };

  let resolved;
  try {
    resolved = await resolveConversationByIdentity(db, {
      accountId: connection.accountId,
      auditUserId: connection.auditUserId,
      channel: msg.channel,
      externalId: msg.senderId,
    });
  } catch (err) {
    if (err instanceof ChannelResolveError) {
      return { persisted: false, reason: err.code };
    }
    throw err;
  }

  const { error: insertError } = await db.from('messages').insert({
    conversation_id: resolved.conversationId,
    sender_type: 'customer',
    content_type: msg.mediaUrl ? 'image' : 'text',
    content_text: msg.text,
    media_url: msg.mediaUrl,
    message_id: msg.messageId,
    status: 'delivered',
    created_at: msg.timestamp,
  });

  if (insertError) {
    // A concurrent delivery of the same message won the race — the
    // dedupe check above is best-effort, this is the authoritative one.
    if (insertError.code === '23505') {
      return { persisted: false, reason: 'duplicate' };
    }
    return { persisted: false, reason: insertError.message };
  }

  // Mirror what the WhatsApp path does so the inbox list, unread badge
  // and sorting behave identically regardless of channel.
  const preview = msg.text ?? (msg.mediaUrl ? '[media]' : '');
  const { data: conv } = await db
    .from('conversations')
    .select('unread_count')
    .eq('id', resolved.conversationId)
    .maybeSingle();

  await db
    .from('conversations')
    .update({
      last_message_text: preview,
      last_message_at: msg.timestamp,
      unread_count: (conv?.unread_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', resolved.conversationId);

  return { persisted: true };
}

/**
 * Send a text reply back over Instagram or Messenger.
 *
 * Both use the same Graph `/me/messages` shape, differing only in which
 * token authorises it — which the connection row already carries.
 */
export async function sendMetaMessage(params: {
  accessToken: string;
  recipientId: string;
  text: string;
}): Promise<{ messageId: string }> {
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/me/messages?access_token=${encodeURIComponent(params.accessToken)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: params.recipientId },
        message: { text: params.text },
      }),
    },
  );

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      payload?.error?.message ?? `Meta API returned ${res.status}`;
    throw new Error(message);
  }

  return { messageId: String(payload.message_id ?? '') };
}
