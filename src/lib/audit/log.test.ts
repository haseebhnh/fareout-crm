import { describe, expect, it, vi, beforeEach } from 'vitest'

// The redact() helper is not exported — it is only reachable through
// logAuditEvent, so these tests go through the public function and
// assert on what actually reaches the insert call. That is also the
// more honest test: what matters is what lands in the database, not
// what an internal helper returns in isolation.

/** Shape of the row `logAuditEvent` passes to `.insert()` — just enough
 * to assert on in these tests, not a stand-in for the real table type.
 * `before`/`after` are typed loosely (eslint-disabled) because these
 * tests deliberately dig into arbitrary caller-supplied nesting. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InsertedRow = Record<string, any>

const insertMock = vi.fn(
  async (row: InsertedRow): Promise<{ error: { message: string } | null }> => {
    void row
    return { error: null }
  },
)
const fromMock = vi.fn(() => ({ insert: insertMock }))

vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: () => ({ from: fromMock }),
}))

import { logAuditEvent } from './log'

describe('logAuditEvent — credential redaction', () => {
  beforeEach(() => {
    insertMock.mockClear()
    fromMock.mockClear()
  })

  it('redacts known credential keys in before/after, at any depth', async () => {
    await logAuditEvent({
      accountId: 'acct-1',
      actorId: 'user-1',
      action: 'whatsapp_config.updated',
      targetType: 'whatsapp_config',
      before: {
        access_token: 'super-secret-token',
        phone_number_id: '123',
        nested: { app_secret: 'also-secret' },
      },
      after: {
        access_token: 'new-secret-token',
        phone_number_id: '456',
      },
    })

    expect(insertMock).toHaveBeenCalledTimes(1)
    const row = insertMock.mock.calls[0]![0]

    expect(row.before.access_token).toBe('[redacted]')
    expect(row.before.nested.app_secret).toBe('[redacted]')
    expect(row.after.access_token).toBe('[redacted]')

    // Non-credential fields must survive — over-redaction would make
    // the log useless, which is its own kind of failure.
    expect(row.before.phone_number_id).toBe('123')
    expect(row.after.phone_number_id).toBe('456')
  })

  it('redacts case-insensitively', async () => {
    await logAuditEvent({
      accountId: 'acct-1',
      actorId: 'user-1',
      action: 'api_key.created',
      targetType: 'api_key',
      after: { API_KEY: 'x', Secret: 'y', Password: 'z' },
    })

    const row = insertMock.mock.calls[0]![0]
    expect(row.after.API_KEY).toBe('[redacted]')
    expect(row.after.Secret).toBe('[redacted]')
    expect(row.after.Password).toBe('[redacted]')
  })

  it('redacts inside arrays', async () => {
    await logAuditEvent({
      accountId: 'acct-1',
      actorId: 'user-1',
      action: 'webhook_endpoint.created',
      targetType: 'webhook_endpoint',
      after: {
        endpoints: [{ url: 'https://x', secret: 'shh' }, { secret: 'shh2' }],
      },
    })

    const row = insertMock.mock.calls[0]![0]
    expect(row.after.endpoints[0].secret).toBe('[redacted]')
    expect(row.after.endpoints[0].url).toBe('https://x')
    expect(row.after.endpoints[1].secret).toBe('[redacted]')
  })

  it('passes null through for before/after when omitted', async () => {
    await logAuditEvent({
      accountId: 'acct-1',
      actorId: null,
      action: 'member.removed',
      targetType: 'member',
      targetId: 'user-2',
    })

    const row = insertMock.mock.calls[0]![0]
    expect(row.before).toBeNull()
    expect(row.after).toBeNull()
    expect(row.actor_id).toBeNull()
  })

  it('never throws when the insert fails', async () => {
    insertMock.mockResolvedValueOnce({
      error: { message: 'connection refused' },
    })

    // The whole point of fire-and-forget: a logging failure must not
    // propagate into the caller's request handler.
    await expect(
      logAuditEvent({
        accountId: 'acct-1',
        actorId: 'user-1',
        action: 'member.removed',
        targetType: 'member',
      }),
    ).resolves.toBeUndefined()
  })

  it('never throws when the client itself throws', async () => {
    fromMock.mockImplementationOnce(() => {
      throw new Error('network down')
    })

    await expect(
      logAuditEvent({
        accountId: 'acct-1',
        actorId: 'user-1',
        action: 'member.removed',
        targetType: 'member',
      }),
    ).resolves.toBeUndefined()
  })
})
