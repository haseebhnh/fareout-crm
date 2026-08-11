# Ootrix Platform — Audit of the Existing Application

**Audited:** commit `a4b2580`, live at `app.ootrix.com`
**Method:** repository inspection, live production probing, database
inspection via service role, and the functional audit run earlier in
this engagement.

---

## 0. The one finding that changes the plan

**§35 of the brief contradicts the application that exists.**

The brief says: keep the backend on *PHP / PDO / MySQL*, and do **not**
introduce Next.js, Supabase, or PostgreSQL.

The application is built *entirely* on the stack that section forbids:

| | |
| ------------------------ | ------------------------------------------ |
| Framework                | Next.js 16.2.12 (App Router, React 19)     |
| Backend                  | Next.js route handlers — 56 of them        |
| Database                 | PostgreSQL, via Supabase                   |
| Auth                     | Supabase Auth                              |
| Realtime                 | Supabase Realtime (websockets)             |
| Tenant isolation         | PostgreSQL Row-Level Security, 155 policies |
| PHP files in repo        | **0**                                      |
| MySQL usage              | **none** — 38 PostgreSQL migrations        |

Honouring §35 literally means **discarding all 366 source files and
rewriting from zero in PHP** — which directly contradicts §4 ("existing
working features must continue to work"), the opening instruction ("DO
NOT rebuild everything from scratch"), and §42 ("do not delete working
code without evidence").

It would also lose things PHP on shared hosting cannot easily replace:
RLS-enforced tenant isolation at the database layer, and websocket
realtime for the shared inbox.

**This needs your decision before any architecture work proceeds.** It is
the single highest-impact open question, and it is Question 1 in
`OOTRIX-ARCHITECTURE.md`.

My read: §35 was written to protect a *hosting constraint* — "must run
on Hostinger shared hosting, don't force me onto Kubernetes." That
constraint is already satisfied. The app runs on your Hostinger Node.js
hosting today, auto-deploying from GitHub, at `app.ootrix.com`. If that
was the intent, the section is met and the stack should stay.

---

## 1. Current architecture

```
Next.js 16 App Router (single deployment)
├── src/app/(marketing)/     public site — ootrix.com
├── src/app/(auth)/          login, signup, forgot-password
├── src/app/(dashboard)/     the product — 22 pages
├── src/app/api/             56 route handlers
│   ├── /api/v1/*            public REST API, API-key auth
│   ├── /api/whatsapp/*      Meta Cloud API + webhook
│   ├── /api/channels/*      Instagram / Messenger
│   ├── /api/ai/*            BYO-key AI assistant
│   ├── /api/automations/*   rule engine + cron
│   └── /api/flows/*         visual flow engine + cron
├── src/components/          104 components
├── src/lib/                 26 domain modules
└── supabase/migrations/     38 SQL migrations
```

**Scale:** 366 TS/TSX files, 69 test files, 693 passing assertions.

Hosting: one Next.js app on Hostinger, GitHub auto-deploy from `main`,
serving three hostnames (`ootrix.com`, `app.ootrix.com`,
`crm.fareouttravel.com` → 307).

---

## 2. Existing modules, mapped to the target architecture

| Existing | Target home | State |
| --- | --- | --- |
| Inbox (shared, multi-agent) | CRM → WhatsApp | **Complete**, in production use |
| Contacts + tags + custom fields | CRM → Customers | Complete |
| Pipelines / deals (Kanban) | CRM → Deals | Complete |
| Broadcasts | CRM → Campaigns | Complete, blocked on Meta billing |
| Automations (rule engine) | CRM → Automation | Complete; **cron disabled** |
| Flows (visual builder) | CRM → Workflows | Complete; **cron disabled** |
| AI assistant (BYO key) | CRM → AI | Complete |
| Templates, quick replies | CRM → Communication | Complete |
| Notifications | Core → Notifications | Partial (in-app only) |
| Public REST API `/api/v1` | Core → API layer | Complete |
| Outbound webhooks | Core → API layer | Complete, unused |
| Accounts / members / invites | Core → Organizations | Complete |
| API keys | Core → Identity | Complete |
| Presence | Core | Complete |

**Everything that exists already belongs to CRM or Core.** Nothing needs
relocating to a different product — which makes the CRM-centric
consolidation in §8–§11 largely a *navigation* change, not a data
migration. That is the most important structural finding after §0.

**Products that do not exist at all:** HR, Staff, Tasks/Projects, Sales,
Marketing, Support, Finance, Operations, Reports. Nine of the twelve.

---

## 3. Database

38 migrations, 38 tables, all verified present in production.

**Core:** `accounts`, `profiles`, `account_invitations`, `api_keys`,
`webhook_endpoints`, `notifications`, `member_presence`

**CRM:** `contacts`, `contact_tags`, `tags`, `custom_fields`,
`contact_custom_values`, `contact_notes`, `conversations`, `messages`,
`message_reactions`, `channel_identities`, `channel_connections`,
`whatsapp_config`, `message_templates`, `quick_replies`, `broadcasts`,
`broadcast_recipients`, `pipelines`, `pipeline_stages`, `deals`

**Automation:** `automations`, `automation_steps`, `automation_logs`,
`automation_pending_executions`, `flows`, `flow_nodes`, `flow_runs`,
`flow_run_events`

**AI:** `ai_configs`, `ai_usage_log`, `ai_knowledge_documents`,
`ai_knowledge_chunks`

### Tenancy model

Every tenant-scoped table carries `account_id` referencing `accounts`.
`accounts` **is** the tenant. The brief's Organization → Branch →
Department → Team hierarchy does not exist — there is one flat level.

### Assessment

The schema is sound and normalised. Migration `038` recently introduced
a channel dimension (`conversations.channel`, uniqueness on
`(account, contact, channel)`, `channel_identities`), which is exactly
the kind of extensibility the platform needs, and it was done without
breaking existing rows.

**Do not rebuild this schema.** Extend it.

---

## 4. Authentication

Supabase Auth — email/password, email verification, password reset,
session cookies via `@supabase/ssr`, middleware-refreshed.

**Present:** login, logout, sessions, password reset, invitations.
**Absent:** OTP, MFA, SSO across subdomains.

Cookies are currently scoped to the app host. **Cross-subdomain SSO
(§24) requires cookie-domain work** — see the architecture doc.

---

## 5. Authorization — the largest gap after products

Current model: four flat roles with capability predicates.

```
owner (4) > admin (3) > agent (2) > viewer (1)

canManageMembers   → admin+
canEditSettings    → admin+
canSendMessages    → agent+
canDeleteAccount   → owner
canTransferOwnership → owner
```

Enforced in two places that deliberately mirror each other: TypeScript
predicates in `src/lib/auth/roles.ts`, and the SQL function
`is_account_member(account_id, min_role)` used by every RLS policy.

**Gap:** the brief wants `product.module.action` granularity
(`crm.leads.view`, `hr.employee.create`). The current model cannot
express "may view leads but not delete them", nor "has CRM but not HR".

**This is the single biggest refactor in the plan**, because every RLS
policy and every route guard consumes the current model. It must be done
additively — see the architecture doc.

---

## 6. Tenant isolation — the strongest part of the system

Verified empirically, not assumed:

- **155 `CREATE POLICY` statements** across the migrations
- RLS enabled on **36 tables**
- **96 `auth.uid()` references** in policies
- Anonymous reads tested against **14 tables** → **zero rows returned**
- Cross-account integrity checked → no mismatches, no orphans
- Two live tenants coexist with no contamination

Isolation is enforced *at the database*, not in application code. A
route handler that forgets to filter by `account_id` still cannot leak
data. This is a materially stronger position than most SaaS codebases,
and stronger than what a PHP/PDO rewrite would produce by default.

---

## 7. Security review (§34)

| Area | Finding |
| --- | --- |
| Tenant isolation | **Strong** — RLS verified empirically |
| API authorization | **Strong** — 16/16 routes 401 unauthenticated |
| Credentials at rest | **Strong** — AES-256-GCM for tokens/secrets |
| Webhook verification | **Strong** — HMAC-SHA256, fails closed, per-account secrets |
| API keys | **Strong** — SHA-256 hashed, scoped, prefix-identified |
| SQL injection | **Low risk** — PostgREST/Supabase parameterises |
| Secrets in client bundle | **Verified clean** — no service-role key, no 64-hex key |
| Rate limiting | **Absent** — no throttling on any endpoint |
| Audit logging | **Partial** — `automation_logs` only; no user-action audit |
| MFA | Absent |
| IDOR | Mitigated by RLS rather than by explicit checks |

**Two real gaps for a commercial SaaS: rate limiting and audit logging.**
Both are Core concerns and both are additive.

---

## 8. Known defects and technical debt

### Blocking production use

1. **`AUTOMATION_CRON_SECRET` unset** → `/api/automations/cron` and
   `/api/flows/cron` return 503. **Wait steps and scheduled flows never
   fire.** Fail-closed, so silent. Config fix, not code.
2. **No Meta payment method** → template sends are accepted by Meta then
   fail at delivery. Three failures observed in production.
3. **Meta app unpublished** → limits webhook delivery to app roles.

### Technical debt

4. **19 suppressed lint warnings** — `react-hooks/set-state-in-effect`,
   all effect-based data fetching. Rule downgraded with rationale in
   `eslint.config.mjs`. Not defects; would disappear under a
   data-fetching library.
5. **No UI click-through audit has ever been performed.** Every claim in
   this document is server-side. Forms, drag-and-drop, and wizards are
   unverified.
6. **Duplicate "Sales Pipeline"** — one per account, correct but
   confusing.
7. **Abandoned draft flow** ("j", no nodes) in production data.
8. **`.claude/launch.json`** was renamed to `ootrix-crm`; the dev-server
   tooling still references the old name.

### Deliberate compatibility debt (do not "clean up")

9. `ACCEPTED_KEY_PREFIXES` retains `fareout_crm_live_` and `wacrm_live_`.
   Removing them **revokes live API keys**.
10. `LEGACY_STORAGE_KEYS` retains old localStorage names. Removing them
    silently resets every user's saved theme and layout.

---

## 9. What is missing for a commercial multi-tenant SaaS

Ordered by how much they block selling to a second customer:

1. **Billing / subscriptions** — nothing exists. The pricing tiers on
   `ootrix.com` are marketing copy with no enforcement behind them.
2. **Feature flags / product entitlement** — no way to say "this tenant
   has CRM but not Finance".
3. **Granular RBAC** — §6 above.
4. **Product/subdomain architecture** — one app, one shell today.
5. **Cross-subdomain SSO** — §24.
6. **Nine products** — HR, Staff, Tasks, Sales, Marketing, Support,
   Finance, Operations, Reports.
7. **Org hierarchy** — branches, departments, teams.
8. **Per-tenant branding** — logo, colours, terminology.
9. **Universal search**, **notification engine**, **audit log**,
   **reporting layer**.
10. **Rate limiting**.

---

## 10. Reuse assessment (§24–26 of the brief)

**Reuse as-is — do not touch:**
`whatsapp/*` (20 modules, Meta API, webhook, encryption), `channels/*`,
`automations/*`, `flows/*`, `ai/*`, `contacts/dedupe`, `api-keys/*`,
`webhooks/*`, all 38 migrations, all 69 test files.

**Refactor additively:**
`auth/roles.ts` → permission-based model (keep predicates as a
compatibility layer). `components/layout/*` → product shell.
Settings IA → per-product settings.

**Build new:**
Core services (entitlement, branding, audit, search, notifications),
product registry, subdomain routing, billing, and the nine products.

**Estimated reusable proportion: ~85% of existing code carries forward
unchanged.** The work is mostly *additive*, which is the good case.

---

## 11. Migration risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| PHP rewrite per §35 | **Critical** | Resolve Question 1 before any work |
| RBAC refactor touching 155 RLS policies | **High** | Additive migration; keep `is_account_member` working throughout |
| Cookie-domain change breaking sessions | **High** | Stage on a spare subdomain first |
| Splitting into subdomains prematurely | **Medium** | Single deployment, host-based routing; do not fork the codebase |
| Org hierarchy changing `account_id` semantics | **Medium** | Add `branch_id`/`team_id` as nullable; never repurpose `account_id` |
| Building 9 products before CRM is verified | **High** | Finish the UI audit first |

---

## 12. Recommended immediate sequence

Before *any* platform work:

1. **Answer Question 1** (stack). Everything depends on it.
2. **Set `AUTOMATION_CRON_SECRET`** — 5 minutes, unblocks automation.
3. **Add a Meta payment method** — unblocks templates and broadcasts.
4. **Run the UI click-through audit** — the one part of "does it work?"
   still unanswered.

Then Phase 2 (Core) as laid out in `OOTRIX-ARCHITECTURE.md`.
