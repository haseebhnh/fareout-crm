# Ootrix Platform — Target Architecture & Phased Plan

Companion to `OOTRIX-AUDIT.md`. Read that first.

Status: **proposal awaiting approval.** No destructive change has been
made. Nothing here is implemented.

---

## Questions that must be answered before Phase 2

### Question 1 — the stack (blocking everything)

§35 forbids Next.js, Supabase and PostgreSQL, and requires PHP/PDO/MySQL.
The application is built entirely on the former. See `OOTRIX-AUDIT.md` §0.

**Option A — keep the stack (recommended).**
Interpret §35 as the hosting constraint it most likely is: "must run on
Hostinger shared hosting, no Kubernetes." Already satisfied — the app
deploys to your Hostinger Node.js hosting from GitHub today.

- Preserves ~85% of existing code, 693 tests, 38 migrations
- Keeps RLS-enforced tenant isolation, which PHP would have to
  reimplement in application code and get right on every query
- Keeps websocket realtime for the shared inbox
- Phase 2 can start immediately

**Option B — rewrite in PHP/PDO/MySQL.**
Honours §35 literally.

- Discards 366 source files and every test
- Loses database-level tenant isolation; every leak becomes a code bug
- Loses realtime; the inbox becomes polling
- Realistically 6–12 months before parity with what runs today
- Contradicts §4 and §42 of your own brief

I recommend **A**, and will not proceed on either until you choose.

### Question 2 — subdomains: routing or separate apps?

**Recommended: one deployment, host-based routing.** `crm.ootrix.com`
and `hr.ootrix.com` are the same Next.js app selecting a product shell
from the `Host` header — the pattern already working today for
`ootrix.com` vs `app.ootrix.com`.

Separate apps per subdomain would mean 10 deployments, 10 copies of
Core, and 10 places to fix each bug. §36 asks for exactly this
("shared platform/core architecture rather than copying the entire
application into every subdomain").

### Question 3 — org hierarchy depth

§6 wants Organization → Branch → Department → Team. Today there is one
flat level (`accounts`). Do you need all four now, or is
Tenant → Branch enough for the first customers? Each level multiplies
RBAC and reporting complexity.

### Question 4 — CRM's current home

CRM lives at `app.ootrix.com` today and works. §21 wants `app.*` to be a
launcher and CRM to move to `crm.ootrix.com`. Moving it changes every
bookmark and **the Meta webhook callback URL**. Recommendation: serve
CRM on both, canonicalise later.

---

## Target architecture

```
                    ┌─────────────────┐
                    │   OOTRIX CORE   │
                    ├─────────────────┤
                    │ Identity / Auth │
                    │ Tenants / Orgs  │
                    │ RBAC            │
                    │ Entitlements    │
                    │ Branding        │
                    │ Notifications   │
                    │ Audit           │
                    │ Search          │
                    │ Billing         │
                    │ Files           │
                    └────────┬────────┘
                             │  one database, one auth, one session
   ┌──────────┬──────────┬───┴────┬──────────┬──────────┐
  CRM        HR       Staff     Tasks      Sales    …6 more
crm.*       hr.*     staff.*   task.*     sales.*
```

**One Next.js deployment. One Supabase project. One session.** The
`Host` header selects the product shell.

### CRM absorbs communication, automation and AI

Per §9–§11 — and this is already true in the code. WhatsApp, Instagram,
Messenger, automations, flows and AI are all CRM-domain modules today.
No data migration is required; this is a navigation change.

```
crm.ootrix.com
├── Dashboard
├── Customers ── Leads · Companies · Timeline
├── Deals ────── Pipelines · Quotations
├── Communication ─ WhatsApp · Instagram · Messenger · Email · SMS
│                   Templates · Quick replies · Broadcasts · Campaigns
├── Automation ── Rules · Workflows (visual) · AI
├── Activities ── Calls · Meetings · Tasks · Calendar
├── Support ───── Tickets · Forms
└── Settings
```

---

## The three foundational changes

### 1. Entitlements — the gate everything else needs

```sql
-- New. Nothing existing changes.
CREATE TABLE tenant_products (
  account_id  uuid REFERENCES accounts(id) ON DELETE CASCADE,
  product     text NOT NULL,           -- 'crm' | 'hr' | 'tasks' | …
  status      text NOT NULL,           -- 'active' | 'trial' | 'locked'
  trial_ends_at timestamptz,
  PRIMARY KEY (account_id, product)
);
```

Backfill every existing account with `('crm','active')` so current
behaviour is unchanged on day one. The launcher and product shells read
this; a locked product renders the upgrade state from §21.

### 2. RBAC — additive, never a rewrite

The risk is that 155 RLS policies depend on `is_account_member()`.
So that function keeps working, unchanged, throughout.

```sql
CREATE TABLE role_permissions (
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
  role       account_role_enum NOT NULL,
  permission text NOT NULL,            -- 'crm.leads.view'
  PRIMARY KEY (account_id, role, permission)
);

-- New helper, sits alongside the old one rather than replacing it.
CREATE FUNCTION has_permission(account_id uuid, permission text)
RETURNS boolean …
```

Migration order, strictly:

1. Add the table and helper. Seed it so today's four roles grant exactly
   the permissions they already imply. **Behaviour identical.**
2. New policies use `has_permission()`. Old policies keep using
   `is_account_member()`.
3. Migrate policies one table at a time, verifying isolation after each.
4. Only once nothing calls it, retire `is_account_member()`.

At no point is there a flag day.

### 3. Cross-subdomain SSO

Supabase session cookies are host-scoped today. For §24, the cookie
domain becomes `.ootrix.com` so every subdomain sees one session.

This is a **security-sensitive change** — a domain-scoped cookie is
readable by *every* subdomain, so any future subdomain becomes
session-bearing. It must be staged on a throwaway subdomain and verified
before touching production, and it argues for never pointing an
untrusted app at `*.ootrix.com`.

---

## Phased plan

Each phase ships independently and leaves the app working. **No phase
starts before the previous one is verified.**

| Phase | Scope | Risk |
| --- | --- | --- |
| **0** | Unblock: cron secret, Meta billing, **UI click-through audit** | None |
| **1** | This audit — *complete, awaiting approval* | None |
| **2** | Core: entitlements, branding, audit log, notification service | Low — additive |
| **3** | Org hierarchy: branches, departments, teams | Medium |
| **4** | RBAC migration (3 sub-steps above) | **High** |
| **5** | Product shell + launcher + subdomain routing | Medium |
| **6** | CRM consolidation — nav restructure, no data change | Low |
| **7** | Rate limiting, universal search | Low |
| **8** | Billing / subscriptions (Stripe) | Medium |
| **9+** | Tasks → HR → Staff → Support → Sales → Marketing → Finance → Operations → Reports | Per product |
| **Last** | Industry templates, AI expansion | Low |

**Phase 0 is not optional.** Building nine products on an app whose UI
has never been click-tested is how you get a platform that demos and
doesn't work.

### Why Tasks first among the new products

§14 says CRM automation must be able to create a task that appears in
both places. Tasks is the smallest product, and building it first proves
the cross-product pattern — shared Core, shared identity, cross-product
references — on something cheap. Get that wrong on HR and every
subsequent product inherits the mistake.

---

## What I will not do without explicit approval

- Rewrite the stack (Question 1)
- Change the Supabase cookie domain (session risk)
- Migrate RLS policies (tenant-isolation risk)
- Move CRM off `app.ootrix.com` (breaks the Meta webhook URL)
- Remove `ACCEPTED_KEY_PREFIXES` or `LEGACY_STORAGE_KEYS` — these
  revoke live API keys and reset user preferences respectively
- Delete any existing module

---

## Documents

Written: `OOTRIX-AUDIT.md`, `OOTRIX-ARCHITECTURE.md`.

Deferred until the phase that makes them real, so they describe shipped
behaviour rather than intent: `OOTRIX-DATABASE.md`, `OOTRIX-API.md`,
`OOTRIX-SUBDOMAINS.md`, `OOTRIX-RBAC.md`, `OOTRIX-MULTI-TENANCY.md`,
`OOTRIX-AUTOMATION.md`, `OOTRIX-WHATSAPP.md`, `OOTRIX-DEPLOYMENT.md`.
