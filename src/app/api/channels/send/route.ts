import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/whatsapp/encryption';
import { sendMetaMessage } from '@/lib/channels/meta-messaging';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * Send an agent reply on a non-WhatsApp channel.
 *
 * WhatsApp keeps /api/whatsapp/send — it has template handling, media
 * upload, the 24-hour session window and interactive payloads that do
 * not apply here. This route covers the Meta messaging channels, where
 * a reply is a text POST to the Graph API.
 *
 * Authorisation is the caller's own session: the conversation read goes
 * through their client, so RLS proves they may see this thread before
 * anything is sent. The service-role client is used only afterwards, to
 * read the encrypted token, which RLS deliberately hides from the
 * browser.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _admin: any = null;
function supabaseAdmin() {
  if (!_admin) {
    _admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _admin;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limit = checkRateLimit(`send:channel:${user.id}`, RATE_LIMITS.send);
  if (!limit.success) return rateLimitResponse(limit);

  const body = await request.json().catch(() => ({}));
  const { conversation_id, text } = body;

  if (typeof conversation_id !== 'string' || !conversation_id) {
    return NextResponse.json(
      { error: 'conversation_id is required' },
      { status: 400 },
    );
  }
  if (typeof text !== 'string' || !text.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  // Read through the caller's client: RLS is what proves they are
  // allowed to post into this conversation.
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('id, account_id, channel, contact_id')
    .eq('id', conversation_id)
    .maybeSingle();

  if (convError || !conversation) {
    return NextResponse.json(
      { error: 'Conversation not found' },
      { status: 404 },
    );
  }

  const channel = conversation.channel as string;
  if (channel !== 'instagram' && channel !== 'messenger') {
    return NextResponse.json(
      {
        error:
          channel === 'whatsapp'
            ? 'Use /api/whatsapp/send for WhatsApp conversations.'
            : `Sending is not supported on the ${channel} channel yet.`,
      },
      { status: 400 },
    );
  }

  // The customer's channel-scoped id.
  const { data: identity } = await supabase
    .from('channel_identities')
    .select('external_id')
    .eq('contact_id', conversation.contact_id)
    .eq('channel', channel)
    .maybeSingle();

  if (!identity?.external_id) {
    return NextResponse.json(
      { error: 'No channel identity for this contact.' },
      { status: 409 },
    );
  }

  // Token read with the service role — RLS hides credentials from the
  // browser on purpose, and the authorisation decision was already made
  // above using the caller's own session.
  const { data: connection } = await supabaseAdmin()
    .from('channel_connections')
    .select('access_token, status')
    .eq('account_id', conversation.account_id)
    .eq('channel', channel)
    .maybeSingle();

  if (!connection?.access_token) {
    return NextResponse.json(
      { error: `${channel} is not connected. Connect it in Settings → Channels.` },
      { status: 409 },
    );
  }

  let accessToken: string;
  try {
    accessToken = decrypt(connection.access_token);
  } catch {
    return NextResponse.json(
      {
        error:
          'Stored credentials could not be decrypted. Reconnect the channel in Settings → Channels.',
      },
      { status: 500 },
    );
  }

  let sent: { messageId: string };
  try {
    sent = await sendMetaMessage({
      accessToken,
      recipientId: identity.external_id as string,
      text: text.trim(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed';
    // Record why, so Settings → Channels can surface a real reason
    // rather than just flipping to a silent "error" state.
    await supabaseAdmin()
      .from('channel_connections')
      .update({ status: 'error', last_error: message })
      .eq('account_id', conversation.account_id)
      .eq('channel', channel);

    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Persist only after Meta accepted it. Writing first would show the
  // agent a message in the thread that the customer never received.
  const now = new Date().toISOString();
  const { data: inserted, error: insertError } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      sender_type: 'agent',
      sender_id: user.id,
      content_type: 'text',
      content_text: text.trim(),
      message_id: sent.messageId || null,
      status: 'sent',
      created_at: now,
    })
    .select('id')
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await supabase
    .from('conversations')
    .update({
      last_message_text: text.trim(),
      last_message_at: now,
      updated_at: now,
    })
    .eq('id', conversation.id);

  return NextResponse.json({ ok: true, message_id: inserted?.id });
}
