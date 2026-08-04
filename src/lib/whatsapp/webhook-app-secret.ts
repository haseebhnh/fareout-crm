import { decrypt } from '@/lib/whatsapp/encryption'

/**
 * Resolve which Meta App Secret should verify a given webhook payload.
 *
 * ## Why this is not a layering violation
 *
 * Signature verification normally happens before the body is parsed —
 * you should not touch untrusted input until it is authenticated. Here
 * we must read the body first, because the payload itself says which
 * account (and therefore which secret) it claims to be for.
 *
 * That is safe, and stays safe, only because of a strict rule:
 *
 *   **The parsed value is used for exactly one thing — selecting a
 *   candidate secret. Nothing is read, written, or acted on until
 *   `verifyMetaWebhookSignature` has passed.**
 *
 * An attacker naming another company's `phone_number_id` gets that
 * company's secret selected — which they do not hold, so the HMAC check
 * fails and the request is rejected. Naming an unknown id yields no
 * account secret and falls back to the global one, which they also do
 * not hold. There is no id they can supply that makes verification
 * succeed without possessing a real secret. The lookup is therefore a
 * key-selection hint, never a trust decision.
 *
 * Malformed JSON returns null and the caller falls back to the global
 * secret, so a garbage body is rejected by signature check as before.
 */

/** Shape we care about — deliberately narrow; everything else ignored. */
interface MinimalWebhookBody {
  entry?: Array<{
    changes?: Array<{
      value?: { metadata?: { phone_number_id?: unknown } }
    }>
  }>
}

/**
 * Pull the first `phone_number_id` out of a raw webhook body.
 *
 * Returns null when absent. Template-lifecycle events carry no
 * metadata block at all, so this legitimately returns null for them and
 * the caller falls back to the global secret — those events are app-
 * scoped rather than number-scoped, so that is the correct source.
 */
export function extractPhoneNumberId(rawBody: string): string | null {
  let parsed: MinimalWebhookBody
  try {
    parsed = JSON.parse(rawBody) as MinimalWebhookBody
  } catch {
    return null
  }

  // Array.isArray, not `?? []`: nullish coalescing only guards null and
  // undefined, so a body like {"entry":{}} would reach for-of and throw
  // TypeError — a 500 on an unauthenticated endpoint, which is a denial
  // of service anyone could trigger. Every level is checked.
  if (!Array.isArray(parsed.entry)) return null

  for (const entry of parsed.entry) {
    if (!entry || !Array.isArray(entry.changes)) continue
    for (const change of entry.changes) {
      const id = change?.value?.metadata?.phone_number_id
      // Guard the type: a hostile body can put an object or array here,
      // and passing that to .eq() would build a malformed query.
      if (typeof id === 'string' && id.length > 0) return id
    }
  }
  return null
}

/**
 * The account-level App Secret for the number this payload addresses,
 * or the global `META_APP_SECRET` when the account has not set one.
 *
 * Returns null only when neither exists — the caller then fails closed.
 */
export async function resolveAppSecretForPayload(
  rawBody: string,
  // Passed in rather than imported: the admin client is constructed
  // lazily inside the webhook route (env vars are absent at build time),
  // and injecting it keeps this module unit-testable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<string | null> {
  const globalSecret = process.env.META_APP_SECRET ?? null

  const phoneNumberId = extractPhoneNumberId(rawBody)
  if (!phoneNumberId) return globalSecret

  try {
    const { data, error } = await supabase
      .from('whatsapp_config')
      .select('app_secret')
      .eq('phone_number_id', phoneNumberId)
      .maybeSingle()

    if (error || !data?.app_secret) return globalSecret

    return decrypt(data.app_secret)
  } catch (err) {
    // A failed lookup or a decrypt failure (e.g. the row was encrypted
    // under a rotated ENCRYPTION_KEY) must not hand an attacker an open
    // webhook. Fall back to the global secret; if that is also unset the
    // caller rejects the request.
    console.error('[webhook] app-secret lookup failed:', err)
    return globalSecret
  }
}
