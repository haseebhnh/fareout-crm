import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/whatsapp/encryption';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * Channel connections — list and upsert.
 *
 * WhatsApp is deliberately absent: it keeps `whatsapp_config` and its
 * own route, because it carries WABA-specific state (registration,
 * two-step PIN, template sync) that does not generalise. This route
 * covers the channels added in migration 038.
 *
 * Writes go through the caller's own session, so the RLS policies on
 * `channel_connections` (admin+ to write, any member to read) are what
 * authorise the change — no service-role escalation here.
 */

const CONNECTABLE = ['instagram', 'messenger'] as const;
type ConnectableChannel = (typeof CONNECTABLE)[number];

function isConnectable(value: unknown): value is ConnectableChannel {
  return (
    typeof value === 'string' &&
    (CONNECTABLE as readonly string[]).includes(value)
  );
}

async function resolveAccountId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.account_id as string) ?? null;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Never select access_token / app_secret: they are credentials, and
  // this response reaches the browser. The UI only needs to know that
  // something is connected, not what the secret is.
  const { data, error } = await supabase
    .from('channel_connections')
    .select('id, channel, external_id, display_name, status, last_error, connected_at');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ connections: data ?? [] });
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

  const accountId = await resolveAccountId(supabase, user.id);
  if (!accountId) {
    return NextResponse.json(
      { error: 'Your profile is not linked to an account.' },
      { status: 403 },
    );
  }

  const limit = checkRateLimit(`admin:channelConnect:${user.id}`, RATE_LIMITS.adminAction);
  if (!limit.success) return rateLimitResponse(limit);

  const body = await request.json().catch(() => ({}));
  const { channel, external_id, display_name, access_token, app_secret } = body;

  if (!isConnectable(channel)) {
    return NextResponse.json(
      { error: `channel must be one of: ${CONNECTABLE.join(', ')}` },
      { status: 400 },
    );
  }
  if (typeof external_id !== 'string' || !external_id.trim()) {
    return NextResponse.json(
      {
        error:
          channel === 'instagram'
            ? 'Instagram business account ID is required.'
            : 'Facebook Page ID is required.',
      },
      { status: 400 },
    );
  }
  if (typeof access_token !== 'string' || !access_token.trim()) {
    return NextResponse.json(
      { error: 'access_token is required' },
      { status: 400 },
    );
  }

  // Reject an id already claimed by another account before writing.
  // The unique index would catch it anyway, but a 409 with a real
  // explanation beats a raw constraint error — this is the same
  // ambiguity that silently dropped inbound WhatsApp messages when two
  // accounts bound one number (issue #136).
  const { data: claimed } = await supabase
    .from('channel_connections')
    .select('account_id')
    .eq('channel', channel)
    .eq('external_id', external_id.trim())
    .neq('account_id', accountId)
    .maybeSingle();

  if (claimed) {
    return NextResponse.json(
      {
        error:
          'That account is already connected to a different workspace. Disconnect it there first.',
      },
      { status: 409 },
    );
  }

  let encryptedToken: string;
  let encryptedSecret: string | null;
  try {
    encryptedToken = encrypt(access_token.trim());
    encryptedSecret =
      typeof app_secret === 'string' && app_secret.trim()
        ? encrypt(app_secret.trim())
        : null;
  } catch {
    return NextResponse.json(
      {
        error:
          'Failed to encrypt credentials. Check that ENCRYPTION_KEY is a valid 64-character hex string.',
      },
      { status: 500 },
    );
  }

  const { error: upsertError } = await supabase
    .from('channel_connections')
    .upsert(
      {
        account_id: accountId,
        channel,
        external_id: external_id.trim(),
        display_name:
          typeof display_name === 'string' ? display_name.trim() : null,
        access_token: encryptedToken,
        app_secret: encryptedSecret,
        status: 'connected',
        last_error: null,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id,channel' },
    );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limit = checkRateLimit(`admin:channelDisconnect:${user.id}`, RATE_LIMITS.adminAction);
  if (!limit.success) return rateLimitResponse(limit);

  const channel = new URL(request.url).searchParams.get('channel');
  if (!isConnectable(channel)) {
    return NextResponse.json({ error: 'Unknown channel' }, { status: 400 });
  }

  // RLS restricts this to the caller's own account and to admin+.
  const { error } = await supabase
    .from('channel_connections')
    .delete()
    .eq('channel', channel);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
