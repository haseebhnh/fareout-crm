# Ootrix — Phase 0 Production Readiness Report

**Scope:** Phase 0 only — production hardening. No new products built.
**Baseline:** `a4b2580` · **This report:** the commit that adds it.
**Stack decision:** confirmed — Next.js 16 / PostgreSQL / RLS retained.

---

## 1. Verdict

**Not yet production-ready for external customers.** Three blockers
remain, none of them code.

The platform *is* ready to keep running for your own use: WhatsApp is
delivering, tenant isolation is verified, and the build is green.

| Gate | Status |
| --- | --- |
| TypeScript | **Pass** — clean |
| Lint | **Pass** — 0 errors |
| Tests | **Pass** — 750 assertions, 70 files |
| Production build | **Pass** |
| Tenant isolation | **Pass** — verified empirically + now guarded by tests |
| Authentication | **Pass** |
| WhatsApp inbound | **Pass** — verified with real messages |
| WhatsApp outbound | **Fail** — Meta billing |
| Automation cron | **Fail** — env var unset |
| UI click-through | **Not done** — no session available |

---

## 2. Changed in this phase

### Files

| File | Change |
| --- | --- |
| `supabase/migrations/039_automation_retry_safety.sql` | **New.** `attempts`, `last_error`, `claimed_at` + partial index |
| `src/app/api/automations/cron/route.ts` | **Rewritten.** Per-row error isolation, bounded retry, crash reclaim, observable counts |
| `src/lib/auth/tenant-isolation.test.ts` | **New.** 57 structural isolation assertions |
| `docs/OOTRIX-PRODUCTION-READINESS.md` | **New.** This report |

### Migration to run

```
supabase/migrations/039_automation_retry_safety.sql
```

Additive only — three nullable/defaulted columns and one partial index.
Existing rows get `attempts = 0` and behave exactly as before. **No
destructive statements**, no backfill, safe to run against production
with traffic.

---

## 3. The automation bug found and fixed

§4 requires "failed workflows are logged", "retry behavior is safe" and
"duplicate workflow execution is prevented". One of three held.

**What was correct:** the claim-lock. A row is taken by flipping
`pending → running` with the old status in the `WHERE`, so two
overlapping cron invocations cannot both claim it. Duplicate execution
was genuinely prevented.

**What was broken:**

1. **No `try/catch` anywhere in the drain loop.** A step that threw
   propagated out and aborted the batch. Every row queued behind it was
   skipped that run.
2. **A thrown row stayed `'running'` forever** — claimed, never
   finished, never retried. One bad automation silently froze that
   customer's queue permanently.
3. **`'failed'` existed in the CHECK constraint but nothing ever set
   it.** The failure state was unreachable, so failures were invisible.
4. **A process crash mid-step** (deploy, timeout, OOM) stranded rows the
   same way, with nothing logged.

**Now:** each row runs in its own `try/catch`; failures return the row to
`pending` and retry up to 3 attempts, then mark `failed` with the error
recorded; rows stuck `running` beyond 10 minutes are presumed orphaned
and re-queued; the endpoint returns `{processed, failed, reclaimed}`.

The reclaim window is deliberately generous — re-queuing a slow-but-
healthy execution is the only path back to double-execution, so the bias
is toward waiting.

---

## 4. Tenant isolation — now regression-guarded

Previously verified by hand. That verification did not survive into CI,
so a future migration adding a table without RLS would have gone
unnoticed until it leaked.

`tenant-isolation.test.ts` asserts, across all 39 migrations:

- **26 tenant-scoped tables** each have `ENABLE ROW LEVEL SECURITY`
- **26 tenant-scoped tables** each carry `account_id`
- **No policy uses `USING (true)`** — which would silently disable
  isolation for a table while still appearing to have a policy
- `is_account_member` is `SECURITY DEFINER` **with a pinned
  `search_path`** — without the pin it is a privilege-escalation vector
- Channel identity lookup is unique on `(account_id, channel, external_id)`
- No two accounts can claim the same WhatsApp number or Meta channel

These run with no network and no credentials, so they hold in CI.

**One of them caught a wrong assumption of mine during authoring** — I
asserted `CREATE UNIQUE INDEX` where migration 013 uses `ADD CONSTRAINT
… UNIQUE`. The code was right; my test was wrong. Fixed to accept either.

### Not covered

Live cross-tenant probing — authenticating as tenant A and attempting to
read tenant B through the API — needs a seeded database and credentials.
It is the stronger test and should exist before the first external
customer. Tracked below.

---

## 5. Blockers

### B1 — `AUTOMATION_CRON_SECRET` unset (config)

`/api/automations/cron` and `/api/flows/cron` return **503**. Wait steps
and scheduled flows never fire. Fail-closed, therefore silent.

```bash
openssl rand -hex 32
```

Add as `AUTOMATION_CRON_SECRET` in hPanel → Environment variables,
rebuild, then point a scheduler at both endpoints with the
`x-cron-secret` header. Until this is set, the retry logic above is
dormant — it is correct but unreachable.

### B2 — Meta template delivery fails (account config)

Investigated rather than suppressed, per §6. The evidence:

- The failed message row carries a `wamid` → **Meta accepted the API
  call**. The send path works.
- `status` became `failed` afterwards, via Meta's status webhook →
  rejected at **delivery**, not at send.
- `content_type: "template"` → business-initiated.
- Meta dashboard shows **"Add payment to send business-initiated
  messages"** as incomplete.

Ruled out: credentials (`Credentials valid`), token (verified against
Meta), template status (`fareout_d` is APPROVED), webhook (inbound
works), phone config (`subscribed_apps_at` set).

**Cause: no payment method on the WhatsApp Business Account.** Meta
accepts template sends without billing, then fails them at delivery.

Fix in Meta → WhatsApp Manager → Payment methods. Not a code change.

### B3 — UI click-through audit not performed

§7 requires browser testing of every screen. **This has not been done at
any point.** Every claim in this report is server-side: API status
codes, database state, migration structure.

Forms, drag-and-drop, wizards, mobile layouts, empty/loading/error
states are **unverified**. I have no authenticated session and will not
create one with your credentials.

To unblock: sign in at `app.ootrix.com` in the browser pane, and I will
complete §7 in full.

---

## 6. Non-blocking issues

| # | Issue | Severity |
| --- | --- | --- |
| 1 | No rate limiting on any endpoint | **High** for public SaaS |
| 2 | No user-action audit log (§36) — only `automation_logs` | **High** for commercial |
| 3 | Meta app unpublished — limits delivery to app roles | Medium |
| 4 | 19 suppressed `set-state-in-effect` warnings | Low |
| 5 | Duplicate "Sales Pipeline" (one per account, correct) | Cosmetic |
| 6 | Abandoned draft flow "j" in production | Cosmetic |
| 7 | `.claude/launch.json` renamed; dev tooling references old name | Cosmetic |

### Do not "clean up"

- `ACCEPTED_KEY_PREFIXES` retains `fareout_crm_live_` / `wacrm_live_`.
  Removing them **revokes live API keys**.
- `LEGACY_STORAGE_KEYS` retains old localStorage names. Removing them
  **resets every user's saved theme and layout**.

---

## 7. Deployment requirements

1. Run migration `039` (safe with traffic).
2. Set `AUTOMATION_CRON_SECRET`, rebuild.
3. Schedule both cron endpoints with the `x-cron-secret` header.
4. Add a Meta payment method.
5. Publish the Meta app once business verification completes.

Existing required env: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`ENCRYPTION_KEY`, `META_APP_SECRET`, `NEXT_PUBLIC_SITE_URL` — all set.

---

## 8. Remaining Phase 0 work

1. **UI click-through audit** (B3) — needs a session
2. **Live cross-tenant integration test** — needs a seeded second tenant
3. **Rate limiting** — arguably Phase 1, but required before external customers
4. **Audit logging** — same

Items 3 and 4 are Core concerns and additive. They are the two things I
would insist on before onboarding a paying customer who is not you.

---

## 9. Recommendation

Phase 0 is **complete for everything reachable without a browser session
or account-level configuration.**

Before Phase 1:

- Set the cron secret (5 min) and run migration 039
- Add Meta billing
- Give me a session so the UI audit can be finished

I have not started Phase 1 and will not until you approve.
