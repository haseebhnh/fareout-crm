import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { resumePendingExecution } from '@/lib/automations/engine'
import type { AutomationContext } from '@/lib/automations/engine'

/**
 * Drain due `automation_pending_executions` rows — the queue behind
 * Wait steps. Hit on a schedule by an external pinger; authenticated
 * with a shared secret in `x-cron-secret`.
 *
 * ## Duplicate execution
 *
 * A row is claimed by flipping 'pending' -> 'running' with the old
 * status in the WHERE clause. Two overlapping invocations cannot both
 * claim the same row: the second UPDATE matches nothing and returns
 * null. This is the lock, and it is why no row runs twice.
 *
 * ## Failure and crash recovery
 *
 * Each row runs inside its own try/catch, so a step that throws cannot
 * abort the batch — previously one bad automation froze every row
 * queued behind it, and left its own row 'running' forever.
 *
 * On failure the row goes back to 'pending' to be retried, until
 * MAX_ATTEMPTS, after which it is marked 'failed' with the error
 * recorded. A permanently broken step therefore stops rather than
 * spinning, and an administrator can see why.
 *
 * Rows left 'running' by a crashed process (deploy, timeout, OOM) are
 * re-queued after RECLAIM_AFTER_MS. That window must comfortably exceed
 * the longest plausible step, or a slow-but-healthy execution would be
 * re-queued while still running — the one way this design could
 * double-execute.
 */

/** Give up after this many attempts and mark the row failed. */
const MAX_ATTEMPTS = 3

/**
 * How long a row may sit 'running' before it is presumed orphaned.
 * Deliberately far longer than any step should take: re-queuing a row
 * that is merely slow is the only path to duplicate execution here, so
 * the bias is heavily toward waiting.
 */
const RECLAIM_AFTER_MS = 10 * 60 * 1000

/** Rows drained per invocation. Bounded so one run cannot time out. */
const BATCH_SIZE = 50

export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET
  if (!expected) {
    // Fail closed. An unauthenticated drain endpoint would let anyone
    // trigger every tenant's automations.
    return NextResponse.json(
      {
        error: 'cron not configured',
        detail:
          'AUTOMATION_CRON_SECRET is not set. Wait steps and scheduled ' +
          'automations will not run until it is.',
      },
      { status: 503 },
    )
  }

  const supplied = request.headers.get('x-cron-secret') ?? ''
  const suppliedBuf = Buffer.from(supplied)
  const expectedBuf = Buffer.from(expected)
  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = supabaseAdmin()

  // Re-queue anything orphaned by a crashed run before selecting work,
  // so those rows are eligible in this same pass.
  const reclaimedCount = await reclaimStaleRows(admin)

  const { data: due, error } = await admin
    .from('automation_pending_executions')
    .select('*')
    .eq('status', 'pending')
    .lte('run_at', new Date().toISOString())
    .order('run_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) {
    console.error('[automations/cron] failed to read queue:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!due || due.length === 0) {
    return NextResponse.json({ processed: 0, failed: 0, reclaimed: reclaimedCount })
  }

  let processed = 0
  let failed = 0

  for (const row of due) {
    const attempts = ((row.attempts as number | null) ?? 0) + 1

    // Claim. Conditional on the row still being 'pending', so a
    // concurrent invocation that got here first wins and we skip.
    const { data: claim } = await admin
      .from('automation_pending_executions')
      .update({
        status: 'running',
        attempts,
        claimed_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()
    if (!claim) continue

    try {
      await resumePendingExecution({
        id: row.id as string,
        automation_id: row.automation_id as string,
        // account_id is NOT NULL on automation_pending_executions
        // post-017; the engine uses it for tenant-scoped lookups.
        account_id: row.account_id as string,
        user_id: row.user_id as string,
        contact_id: (row.contact_id as string | null) ?? null,
        log_id: (row.log_id as string | null) ?? null,
        parent_step_id: (row.parent_step_id as string | null) ?? null,
        branch: (row.branch as 'yes' | 'no' | null) ?? null,
        next_step_position: row.next_step_position as number,
        context: (row.context as AutomationContext) ?? {},
      })
      processed++
    } catch (err) {
      failed++
      const message = err instanceof Error ? err.message : String(err)
      const exhausted = attempts >= MAX_ATTEMPTS

      console.error(
        `[automations/cron] execution ${row.id} failed ` +
          `(attempt ${attempts}/${MAX_ATTEMPTS}${exhausted ? ', giving up' : ', will retry'}):`,
        message,
      )

      // Retry by returning it to the queue, or stop and record why.
      // Either way the row must not stay 'running', which is what
      // stranded it before.
      await admin
        .from('automation_pending_executions')
        .update({
          status: exhausted ? 'failed' : 'pending',
          last_error: message.slice(0, 1000),
          claimed_at: null,
        })
        .eq('id', row.id)
    }
  }

  return NextResponse.json({ processed, failed, reclaimed: reclaimedCount })
}

/**
 * Return rows abandoned in 'running' to the queue.
 *
 * Only rows claimed longer ago than RECLAIM_AFTER_MS are touched, and
 * only if they have attempts left — otherwise a row that crashes the
 * process every time would be reclaimed forever.
 */
async function reclaimStaleRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
): Promise<number> {
  const cutoff = new Date(Date.now() - RECLAIM_AFTER_MS).toISOString()

  const { data, error } = await admin
    .from('automation_pending_executions')
    .update({
      status: 'pending',
      claimed_at: null,
      last_error: 'Reclaimed: execution did not finish (process restarted?)',
    })
    .eq('status', 'running')
    .lt('claimed_at', cutoff)
    .lt('attempts', MAX_ATTEMPTS)
    .select('id')

  if (error) {
    // Non-fatal: draining the queue is still worth attempting.
    console.error('[automations/cron] reclaim failed:', error.message)
    return 0
  }

  const count = data?.length ?? 0
  if (count > 0) {
    console.warn(`[automations/cron] reclaimed ${count} stale execution(s)`)
  }
  return count
}
