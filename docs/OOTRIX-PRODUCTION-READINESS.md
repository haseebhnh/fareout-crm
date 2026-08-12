# Ootrix — Phase 0 Final Production Readiness

Date: 2026-08-12
Scope: existing CRM foundation only (Next.js / React / TypeScript / Supabase Postgres / Hostinger). No stack migration, no Phase 1 product work.

## Overall Status: **READY, with documented follow-ups**

Nothing found in this pass blocks production use by real tenants. Everything classified CRITICAL was either already correct (verified, not assumed) or has been fixed in this pass. What remains is a HIGH-priority cross-cutting cleanup (error-message leakage) that is real but not exploitable for cross-tenant data access, plus MEDIUM/LOW items and a short list of actions only you can take (Meta account configuration).

| Area | Status |
|---|---|
| Authentication | PASS |
| Tenant Isolation | PASS |
| RLS | PASS |
| RBAC | PASS |
| API Security | PASS (see HIGH-1) |
| Rate Limiting | PASS |
| WhatsApp | PASS (see HIGH-2, fixed) |
| Automation | PASS |
| Cron | PASS |
| Database | PASS |
| File Security | PASS (see HIGH-3, fixed) |
| UI | PASS (carried over from prior click-through audit; no regressions found in changed areas) |
| Mobile | PASS (carried over; see note below) |
| Build | PASS |
| Tests | PASS — 779/779 |
| Environment | PASS |
| Audit Logs | PASS |
| Security Headers | PASS |

---

## What changed in this pass

| File | Change |
|---|---|
| `supabase/migrations/041_message_dedup.sql` | New. Partial unique index `(conversation_id, message_id) WHERE message_id IS NOT NULL` on `messages`. |
| `src/app/api/whatsapp/webhook/route.ts` | Added a pre-insert existence check so a Meta webhook retry can't double-insert an inbound message or double-fire automations/flows/AI-reply for it. |
| `src/app/api/whatsapp/media/[mediaId]/route.ts` | Added an ownership check — the route now requires a message in the caller's own (RLS-scoped) account referencing the requested `mediaId` before proxying to Meta. Previously any authenticated user of any tenant could request any `mediaId` string. |
| `src/middleware.ts` | Added `/flows`, `/agents`, `/notifications` to the protected-route list — these pages existed but weren't redirect-gated for logged-out visitors (the underlying APIs were still safe; this was a UX/consistency gap, not a data leak). |
| `src/lib/auth/tenant-isolation.test.ts` | Added `account_invitations`, `ai_knowledge_chunks`, `ai_knowledge_documents`, `audit_log`, `member_presence` to the structural RLS/account-scoping test — these tables were already correctly RLS-scoped in the migrations but had no regression test guarding them. |
| `docs/OOTRIX-ENVIRONMENT.md` | New. Full environment variable inventory — required/optional/public/secret — no values recorded. |
| `docs/OOTRIX-PRODUCTION-READINESS.md` | This file. |

Everything above was verified by code-reading and automated tests, not by inspection alone — see "Final Validation" below.

---

## Phase 0A — Automation (PASS)

- `AUTOMATION_CRON_SECRET`: both `/api/automations/cron` and `/api/flows/cron` compare `x-cron-secret` via `timingSafeEqual`. **Confirmed fail-closed**: if the env var is unset, both routes return 503 before any comparison or DB access — verified by reading the code path, not assumed.
- Wait steps schedule a real row in `automation_pending_executions` with a future `run_at` (`src/lib/automations/engine.ts`) — no in-process sleep, no lost state on a process restart.
- Duplicate-execution protection: confirmed claim-lock pattern — `UPDATE ... SET status='running' WHERE id=$1 AND status='pending'`, only one drain worker can win a given row. Same pattern covers stale-row reclaim.
- Retry/crash recovery (`attempts`, `last_error`, `claimed_at` — migration 039) verified present and wired into the cron loop.
- Tenant isolation in the drain loop: the initial due-row SELECT is intentionally cross-tenant (it's a single global queue), but every downstream lookup inside `resumePendingExecution`/`engine.ts` is scoped by the row's own `account_id`. No cross-tenant leakage found.
- `tenant-isolation.test.ts` already covered `automation_pending_executions` and `automation_logs`.

**Trigger → Condition → Action → Wait → Resume → Final action**: verified end-to-end at the code level (engine.ts step execution + Wait scheduling + cron resume). Not re-run live in this pass — it was already verified live earlier this session (cron-job.org test runs + direct DB query cross-check, both agreeing) and no automation code changed since.

## Phase 0B — WhatsApp pipeline (PASS, one gap fixed)

Full trace confirmed: signature verify → message extraction → contact dedupe/create → conversation find-or-create → message persistence → flow dispatch → automation dispatch → AI auto-reply → `message.received` webhook fan-out. Signature verification happens before any DB write; a bad signature is rejected (401) with no DB access.

**HIGH-2 (fixed): no duplicate-delivery protection.** Meta redelivers a webhook event when an ack is slow. `messages.message_id` is intentionally non-unique *globally* (Meta IDs collide across phone numbers — documented in migration 009), but nothing stopped the same message id being inserted twice into the *same* conversation. Fixed with a partial unique index scoped to `(conversation_id, message_id)` plus an app-level pre-check that skips all downstream dispatch on a detected duplicate.

Outbound status handling (sent/delivered/read/failed) confirmed wired to `messages.status` and fans out `message.status_updated`. Access tokens confirmed never returned in any API response — decrypted only for outbound Meta calls, never echoed back.

## Phase 0C — Meta template delivery

Unchanged from the earlier diagnosis this session: this is a Meta account/payment configuration issue, not a code defect. Listed under External Actions below.

## Phase 0D — Authentication (PASS)

Single auth system confirmed (Supabase Auth only — no parallel JWT/session table). `middleware.ts` validates the session server-side via `getUser()` (which also transparently refreshes an expiring token), redirects unauthenticated users away from protected paths, and has a documented, deliberate fix for refresh-token cookie propagation (`withRefreshedCookies`) so a token rotation during middleware doesn't wedge the session.

Login → open CRM → refresh → open another protected route → logout → attempt protected route: this exact flow was verified live earlier this session via the browser-based audit; no auth code changed since, so it stands.

Two informational notes (not gaps, see LOW):
- Cookie `httpOnly`/`secure`/`sameSite` attributes come from `@supabase/ssr`'s defaults rather than being explicitly set in this codebase — the library's defaults are secure, but they're implicit rather than asserted in code.
- No dedicated CSRF token exists; state-changing routes rely on cookie-based session auth. This is a common, defensible pattern given `SameSite` cookie defaults, but is worth a conscious note rather than silent reliance.

## Phase 0E — Tenant isolation / RLS (PASS)

31 tenant-scoped tables now covered by the structural test (26 previously + 5 added this pass). Confirmed by direct migration read: `account_invitations`, `ai_knowledge_chunks`, `ai_knowledge_documents`, `audit_log`, and `member_presence` all already had `ENABLE ROW LEVEL SECURITY` and `account_id` — this was a **test-coverage gap, not an RLS gap**. No table found anywhere in the migrations with `account_id` and no RLS.

Background jobs (cron) use the service-role client, which bypasses RLS by design — verified their queries are scoped by `account_id` explicitly rather than relying on a policy that doesn't apply to them.

## Phase 0F — RBAC (PASS)

Role model (`owner > admin > agent > viewer`) enforced server-side via `requireRole()`/`getCurrentAccount()`, layered on top of (not replacing) RLS. Every API route sampled — including ones not using the shared `requireRole` helper — has its own `supabase.auth.getUser()` check; none found with zero auth. IDOR spot-check on `/api/v1/contacts/[id]`, `/api/v1/conversations/[id]`, and `/api/contacts/[id]/tags` confirmed account-scoped queries, not raw-ID lookups.

## Phase 0G — API security (PASS, one HIGH follow-up)

No SQL injection surface found — all queries go through Supabase's parameterized query builder or `.rpc()` with typed args; no raw/template-literal SQL anywhere. `/api/v1/*` confirmed to enforce API-key auth + scope on every route including nested `[id]` routes.

**HIGH-1 (documented, not fixed in this pass — see below): raw Supabase/Postgres error messages returned to API clients.** Roughly 20 routes return `error.message` (or in two cases, `automations/route.ts` and `automations/[id]/route.ts`, a raw string from an internal helper — verified these are *not* raw Postgres error objects, just unformatted internal error strings) directly in the JSON response body on a 500. This is an information-disclosure smell (a client can infer constraint/column names) but **not a tenant-isolation or auth bypass** — RLS and `requireRole` still gate what data those errors could ever be about. Scoped as a follow-up rather than a blind rewrite across 20 files in this pass, per the "don't rewrite working code without evidence of a real defect per-file" instruction — see recommendation below.

## Phase 0H — File upload security (PASS, one gap fixed)

Upload path (`src/lib/storage/upload-media.ts`) is tenant-scoped by construction (`account-<id>/...` storage keys, enforced further by bucket RLS).

**HIGH-3 (fixed): media-download route had no ownership check.** `/api/whatsapp/media/[mediaId]` authenticated the *user* but not their right to *that specific mediaId* — it resolved the caller's own account's WhatsApp token and fetched whatever `mediaId` was in the URL from Meta, with no check that the media belonged to a message in the caller's account. Fixed by requiring a matching message row (queried through the caller's RLS-scoped client, so the check is enforced twice over — once by RLS, once explicitly) before proxying to Meta.

Two lower-severity notes carried to MEDIUM: no server-side MIME/extension allow-list on upload (relies on the bucket's blanket 16MB size cap), and per-media-kind size limits are caller-enforced rather than centralized.

## Phase 0I — Database health (PASS)

No duplicate/drifted table definitions found (every table name appears in exactly one `CREATE TABLE`, no `DROP TABLE`s in the migration history). High-traffic tables (`contacts`, `conversations`, `automation_logs`, `audit_log`) have `account_id` indexes. `messages` itself has no direct `account_id` column (by design — scoped via its `conversation_id` FK, migration 009's stated rationale) with RLS joining through `conversations`; functionally correct, flagged as a LOW performance note if per-account message reporting queries ever get heavy. Uniqueness constraints from migrations 026/038 (`api_keys.key_hash`, `channel_identities`/`channel_connections` external-id combos) confirmed actually applied, not just planned.

## Phase 0J/0K — UI click-through & mobile

Not re-run live in this pass. The prior browser-based click-through audit this session covered auth, dashboard, CRM (contacts/deals/pipelines), inbox/WhatsApp, and mobile-viewport inbox rendering, with two real bugs found and fixed (`51d02bc` inbox overflow, `f82c5c3` header title fallback). You explicitly said "don't audit, everything works perfect" after that pass. Nothing touched in this Phase 0 session changes rendered UI except the Settings → Activity log panel (already covered by its own component) — no new click-through was warranted. If you want the remaining surface (automation builder canvas, tablet breakpoint, broadcasts wizard) covered, say so and I'll resume it.

## Phase 0L — Error handling

Covered by HIGH-1 above (API error responses) — no unhandled-exception, infinite-loading, or blank-screen pattern found in the routes/components read across all six research passes this session (this one plus the prior UI audit).

## Phase 0M — Environment configuration (PASS)

`docs/OOTRIX-ENVIRONMENT.md` created — full inventory of the 13 env vars actually referenced in `src/`, classified required/optional/public/secret, with the production deployment checklist (all required vars set, `WHATSAPP_TEMPLATES_DRY_RUN` unset, cron secret matches the external pinger). No hardcoded secret literal found anywhere in source.

## Phase 0N — Production build (PASS)

```
TypeScript:  clean (npx tsc --noEmit)
Lint:        0 errors, 2 pre-existing warnings (unrelated to this session's changes)
Tests:       779 passed / 779 (72 files) — was 769 before this session's two commits
Build:       npm run build — clean, all routes compiled
```

## Phase 0O — Security headers (PASS)

Already present in `next.config.ts`: HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, a locked-down `Permissions-Policy`, and a `Content-Security-Policy-Report-Only` staged ahead of full enforcement. No change needed — this was already done correctly in an earlier commit, verified by reading `next.config.ts` directly rather than assumed from memory.

## Phase 0P — Audit logs (PASS)

`audit_log` (migration 040, this session) covers member role changes/removal and WhatsApp config updates/resets, service-role-write-only (tamper-evident), credential-redacting, any-member-readable via RLS. Confirmed RLS-correct via the tenant-isolation test addition above. Coverage is currently narrow (2 call sites) by design — expand as more admin actions are identified as worth auditing; not a gap, a starting point.

---

## CRITICAL ISSUES

None found.

## HIGH ISSUES

1. **API error responses leak raw Supabase/Postgres error text** to clients across ~20 routes (list: `automations/{route,[id]/route}.ts`, `flows/{route,[id]/route,[id]/activate/route}.ts`, `quick-replies/{route,[id]/route}.ts`, `channels/route.ts`, `contacts/[id]/tags/route.ts`, `automations/cron/route.ts`, `flows/cron/route.ts`, `ai/{draft,test,playground,config}/route.ts`). Not a tenant-isolation break (RLS/RBAC still gate the underlying data), but real information disclosure. **Not fixed in this pass** — recommend a dedicated follow-up: introduce one `safeErrorResponse()` helper, and swap each site's `error.message` for it, verifying each route's tests still pass. Estimated: 1 focused session, ~20 small diffs.
2. **WhatsApp webhook duplicate-delivery — FIXED** (migration 041 + pre-check, see above).
3. **Media-download IDOR — FIXED** (ownership check added, see above).

## MEDIUM ISSUES

- No server-side MIME/extension allow-list on file uploads (`src/lib/storage/upload-media.ts`) — relies on the bucket's blanket size cap; per-kind size limits are caller-enforced, not centrally guaranteed.
- Cookie security attributes (`httpOnly`/`secure`/`sameSite`) are implicit via `@supabase/ssr` defaults rather than explicitly asserted in this codebase.
- No dedicated CSRF token on cookie-authenticated state-changing routes (mitigated by SameSite cookie defaults, but worth a conscious decision rather than silent reliance).

## LOW ISSUES

- `messages` has no direct `account_id` column (by design, scoped via `conversation_id`) — a composite index would only matter if per-account message-volume reporting queries become a measured bottleneck. Not needed today.
- `api_keys` has a redundant plain index alongside its column-level `UNIQUE` constraint on `key_hash` — harmless, low-priority cleanup.

## EXTERNAL ACTIONS (yours, not code)

- **Meta payment method** — template delivery failures trace to Meta account/billing configuration, not application code (unchanged from the earlier diagnosis this session).
- **The ootrix.com "we build websites/apps/exe/mac" marketing claim** — still unresolved from earlier in this session; I declined to add it as false advertising and you haven't clarified intent since.

---

## Final Validation

```
TypeScript:                clean
Lint:                      0 errors (2 pre-existing warnings, unrelated)
Tests:                     779 / 779 passed
Production build:          clean
Tenant-isolation test:     67 assertions passed (31 tables, up from 26)
```

Not re-run live in this pass (no code touched that would change their outcome since they were last verified this session): cron end-to-end trigger test, browser click-through, RBAC live click-test. Automation/WhatsApp/cron code paths were read and traced fully but not re-executed against production, since `AUTOMATION_CRON_SECRET` and Meta credentials aren't available in this environment — the structural/code-level verification above is what's available without live production access.

## Next step

`041_message_dedup.sql` needs to run in Supabase SQL Editor before/alongside this deploy — same pattern as every prior migration.

Not starting Phase 1. Waiting for your review of the HIGH-1 error-message cleanup plan before I touch those ~20 files, and for your go-ahead on anything else here.
