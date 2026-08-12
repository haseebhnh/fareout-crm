// ============================================================
// Audit action vocabulary — pure, no I/O.
//
// Adding an action is one entry here plus a `logAuditEvent` call at
// the source. The DB column is free text (040_audit_log.sql), so no
// migration is needed to add one — same model as webhook events
// (src/lib/webhooks/events.ts) and API key scopes.
//
// Scope: administrative and destructive actions — the ones an account
// owner would actually want a trail for. Not every read, and not the
// high-volume message send/receive path (that already has its own
// timeline in `messages`). If this list starts feeling incomplete for
// a specific investigation, that is the signal to add an entry, not to
// log everything by default.
// ============================================================

export const AUDIT_ACTIONS = [
  // Membership
  'member.invited',
  'member.role_changed',
  'member.removed',
  'member.ownership_transferred',

  // Contacts
  'contact.deleted',
  'contact.merged',
  'contact.imported',

  // WhatsApp / channels
  'whatsapp_config.updated',
  'whatsapp_config.reset',
  'channel_connection.created',
  'channel_connection.deleted',

  // API keys / webhooks
  'api_key.created',
  'api_key.revoked',
  'webhook_endpoint.created',
  'webhook_endpoint.deleted',

  // Automations / flows
  'automation.created',
  'automation.deleted',
  'automation.activated',
  'automation.deactivated',
  'flow.deleted',
  'flow.published',

  // Deals / pipelines
  'deal.deleted',
  'pipeline.deleted',

  // Account settings
  'account.name_changed',
  'account.branding_changed',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export function isAuditAction(value: unknown): value is AuditAction {
  return (
    typeof value === 'string' &&
    (AUDIT_ACTIONS as readonly string[]).includes(value)
  );
}
