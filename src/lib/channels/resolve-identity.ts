// ============================================================
// Resolve (or create) the contact + conversation behind a channel
// identity.
//
// The WhatsApp path resolves a person by phone number. Every other
// channel hands us an opaque external id instead — an Instagram-scoped
// user id, a Page-scoped id, a visitor uuid, an email address — so this
// is the generalised version of `resolveConversationByPhone`.
//
// Two invariants it exists to hold:
//
//   1. One person is one contact. `channel_identities` maps each
//      external id to a contact, so someone who messages on Instagram
//      and later on WhatsApp is one customer with one timeline rather
//      than two unrelated records.
//
//   2. One conversation per (contact, channel). Enforced by the unique
//      index from migration 038. Retried webhook deliveries and two
//      messages arriving together must not create duplicate threads —
//      the exact class of bug migrations 022 and 036 had to clean up
//      after on the WhatsApp path.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

/** Channels that route through this resolver. WhatsApp keeps its own. */
export type Channel = 'instagram' | 'messenger' | 'website' | 'email';

export interface ResolvedChannelConversation {
  conversationId: string;
  contactId: string;
  /** True when this call created the contact rather than matching one. */
  contactCreated: boolean;
}

export class ChannelResolveError extends Error {
  constructor(
    public code: 'no_connection' | 'db_error' | 'bad_request',
    message: string,
  ) {
    super(message);
    this.name = 'ChannelResolveError';
  }
}

/** Postgres unique-violation. A concurrent insert won the race. */
function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === '23505';
}

/**
 * Find or create the contact + conversation for an external identity.
 *
 * `auditUserId` fills the NOT NULL `user_id` columns. There is no
 * logged-in human on a webhook, so callers pass an account-level
 * default — the same convention the WhatsApp webhook uses.
 */
export async function resolveConversationByIdentity(
  db: SupabaseClient,
  params: {
    accountId: string;
    auditUserId: string;
    channel: Channel;
    externalId: string;
    displayName?: string | null;
  },
): Promise<ResolvedChannelConversation> {
  const { accountId, auditUserId, channel, externalId, displayName } = params;

  if (!externalId) {
    throw new ChannelResolveError('bad_request', 'externalId is required');
  }

  const { contactId, created } = await resolveContactId(db, {
    accountId,
    auditUserId,
    channel,
    externalId,
    displayName: displayName ?? null,
  });

  const conversationId = await resolveConversationId(db, {
    accountId,
    auditUserId,
    contactId,
    channel,
  });

  return { conversationId, contactId, contactCreated: created };
}

/**
 * Returns the contact behind an external id, and whether we just
 * created it.
 *
 * The "created" flag is returned rather than recorded in module state:
 * this runs in a serverless handler where module scope is shared across
 * concurrent invocations and discarded unpredictably between them, so
 * anything kept there is both a cross-request leak and unreliable.
 */
async function resolveContactId(
  db: SupabaseClient,
  p: {
    accountId: string;
    auditUserId: string;
    channel: Channel;
    externalId: string;
    displayName: string | null;
  },
): Promise<{ contactId: string; created: boolean }> {
  // 1) Known identity — the overwhelmingly common path.
  const { data: existing, error: lookupError } = await db
    .from('channel_identities')
    .select('contact_id')
    .eq('account_id', p.accountId)
    .eq('channel', p.channel)
    .eq('external_id', p.externalId)
    .maybeSingle();

  if (lookupError) {
    throw new ChannelResolveError('db_error', lookupError.message);
  }
  if (existing?.contact_id) {
    return { contactId: existing.contact_id as string, created: false };
  }

  // 2) New identity. Create the contact, then the identity row.
  //
  // `phone` is deliberately left null — migration 038 dropped the NOT
  // NULL precisely because a channel like Instagram never supplies one,
  // and the unique phone index is partial so nulls don't collide.
  const { data: contact, error: contactError } = await db
    .from('contacts')
    .insert({
      account_id: p.accountId,
      user_id: p.auditUserId,
      name: p.displayName,
      phone: null,
    })
    .select('id')
    .single();

  if (contactError || !contact) {
    throw new ChannelResolveError(
      'db_error',
      contactError?.message ?? 'Failed to create contact',
    );
  }

  const { error: identityError } = await db.from('channel_identities').insert({
    account_id: p.accountId,
    contact_id: contact.id,
    channel: p.channel,
    external_id: p.externalId,
    display_name: p.displayName,
  });

  if (identityError) {
    if (isUniqueViolation(identityError)) {
      // A concurrent delivery created the identity between our lookup
      // and our insert. Theirs won; drop the contact we just made so it
      // doesn't linger as an orphan, and use the winner.
      await db.from('contacts').delete().eq('id', contact.id);

      const { data: winner } = await db
        .from('channel_identities')
        .select('contact_id')
        .eq('account_id', p.accountId)
        .eq('channel', p.channel)
        .eq('external_id', p.externalId)
        .maybeSingle();

      if (winner?.contact_id) {
        return { contactId: winner.contact_id as string, created: false };
      }
    }
    throw new ChannelResolveError('db_error', identityError.message);
  }

  return { contactId: contact.id as string, created: true };
}

async function resolveConversationId(
  db: SupabaseClient,
  p: {
    accountId: string;
    auditUserId: string;
    contactId: string;
    channel: Channel;
  },
): Promise<string> {
  const { data: existing, error: lookupError } = await db
    .from('conversations')
    .select('id')
    .eq('account_id', p.accountId)
    .eq('contact_id', p.contactId)
    .eq('channel', p.channel)
    .maybeSingle();

  if (lookupError) {
    throw new ChannelResolveError('db_error', lookupError.message);
  }
  if (existing?.id) return existing.id as string;

  const { data: created, error: insertError } = await db
    .from('conversations')
    .insert({
      account_id: p.accountId,
      user_id: p.auditUserId,
      contact_id: p.contactId,
      channel: p.channel,
      status: 'open',
    })
    .select('id')
    .single();

  if (insertError) {
    if (isUniqueViolation(insertError)) {
      // Lost the race against a concurrent delivery — read theirs.
      const { data: winner } = await db
        .from('conversations')
        .select('id')
        .eq('account_id', p.accountId)
        .eq('contact_id', p.contactId)
        .eq('channel', p.channel)
        .maybeSingle();
      if (winner?.id) return winner.id as string;
    }
    throw new ChannelResolveError('db_error', insertError.message);
  }

  if (!created) {
    throw new ChannelResolveError('db_error', 'Failed to create conversation');
  }
  return created.id as string;
}
