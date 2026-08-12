// ============================================================
// Audit log writer.
//
// Called from server-side route handlers after an administrative or
// destructive action succeeds. Always uses the service-role client —
// see 040_audit_log.sql for why: no client-held credential should be
// able to write (or alter) an audit row, which is what makes the log
// tamper-evident.
// ============================================================

import { supabaseAdmin } from '@/lib/automations/admin-client'
import type { AuditAction } from './actions'

/**
 * Field names that must never appear in a `before`/`after` snapshot,
 * regardless of which table the caller is logging. Matched
 * case-insensitively against object keys at any depth.
 *
 * This is a backstop, not the primary defence — callers should still
 * pass in only the fields that actually changed, not a raw row spread.
 * But `whatsapp_config.access_token`, `channel_connections.app_secret`
 * etc. are exactly the columns a lazy call site would spread by
 * accident, and an audit table is precisely the kind of place a
 * leaked credential sits forever, gets included in a support export,
 * or shows up in a screen-share of "here's what changed".
 */
const REDACTED_KEYS = new Set([
  'access_token',
  'app_secret',
  'api_key',
  'secret',
  'password',
  'key_hash',
  'verify_token',
  'encryption_key',
])

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACTED_KEYS.has(k.toLowerCase()) ? '[redacted]' : redact(v)
    }
    return out
  }
  return value
}

export interface AuditEventInput {
  accountId: string
  /** Null for a system-initiated action (cron, webhook) with no human actor. */
  actorId: string | null
  /** Denormalised at write time so the row survives the actor being deleted. */
  actorLabel?: string | null
  action: AuditAction
  targetType: string
  targetId?: string | null
  targetLabel?: string | null
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  ipAddress?: string | null
  userAgent?: string | null
}

/**
 * Record one audit event. Fire-and-forget by design: a failure to
 * write the audit row must never fail the action being audited, or
 * every admin operation gains a new way to break. Logs to the server
 * console on failure so it is not silent, but does not throw.
 */
export async function logAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    const { error } = await supabaseAdmin().from('audit_log').insert({
      account_id: input.accountId,
      actor_id: input.actorId,
      actor_label: input.actorLabel ?? null,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId ?? null,
      target_label: input.targetLabel ?? null,
      before: input.before ? redact(input.before) : null,
      after: input.after ? redact(input.after) : null,
      ip_address: input.ipAddress ?? null,
      user_agent: input.userAgent ?? null,
    })
    if (error) {
      console.error('[audit] failed to write event:', input.action, error.message)
    }
  } catch (err) {
    console.error('[audit] failed to write event:', input.action, err)
  }
}

/**
 * Best-effort extraction of the caller's IP and user agent from a
 * Next.js Request, for routes that want to attach them. Neither header
 * is guaranteed present (depends on the proxy chain), so both come
 * back null rather than throwing when absent.
 */
export function requestMetadata(request: Request): {
  ipAddress: string | null
  userAgent: string | null
} {
  const forwardedFor = request.headers.get('x-forwarded-for')
  return {
    ipAddress: forwardedFor ? forwardedFor.split(',')[0]!.trim() : null,
    userAgent: request.headers.get('user-agent'),
  }
}
