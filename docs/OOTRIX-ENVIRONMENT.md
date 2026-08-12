# Ootrix — Environment Variables

Every environment variable the application reads, what it's for, and how to classify it. No values are recorded here — only names and purpose.

## Required — production breaks or degrades unsafely without these

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. Used by every browser and server client. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key — RLS-gated, safe to expose to the browser (it's public by design). |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret.** Bypasses RLS entirely. Used only in server-side admin clients (cron drains, webhook processing, audit log writer). Never exposed to a client bundle. |
| `ENCRYPTION_KEY` | **Secret.** AES-256-GCM key for WhatsApp/channel access tokens and app secrets at rest. Losing/rotating this without a migration plan orphans every stored credential. |
| `META_APP_ID` | Meta app ID — used to build OAuth/config flows for WhatsApp/Instagram/Messenger. |
| `META_APP_SECRET` | **Secret.** Verifies inbound webhook signatures (`x-hub-signature-256`) and is required for any Meta Graph API call that needs app-secret proof. |
| `AUTOMATION_CRON_SECRET` | **Secret.** Gates `/api/automations/cron` and `/api/flows/cron` via `x-cron-secret`, checked with `timingSafeEqual`. **Confirmed fail-closed**: both routes return 503 before any DB access if this is unset — the scheduler cannot silently start accepting unauthenticated drain requests. |

## Optional — has a safe default or only affects a specific feature

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical app URL, used for building absolute links (invite emails, webhook callback URLs shown in the UI). |
| `NEXT_PUBLIC_APP_LOCALE` | Default locale for next-intl if the request doesn't resolve one. |
| `ALLOWED_INVITE_HOSTS` | Allow-list of hosts an invite-link redirect may point at, to stop an invite payload directing a click to an arbitrary external origin. |
| `AI_CONTEXT_MESSAGE_LIMIT` | How many prior messages the AI draft/auto-reply feature includes as context. |
| `AI_REQUEST_TIMEOUT_MS` | Timeout for outbound AI provider calls. |
| `WHATSAPP_TEMPLATES_DRY_RUN` | When set, template submit/sync/delete short-circuit before calling Meta's API — used for local development against accounts with no real WhatsApp Business config. **Must be unset in production** — see Phase 0N verification below. |

## Public vs. secret

- **Public** (safe in a client bundle, prefixed `NEXT_PUBLIC_*`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_LOCALE`.
- **Secret** (server-only, never logged, never returned in an API response): `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY`, `META_APP_SECRET`, `AUTOMATION_CRON_SECRET`.
- `META_APP_ID` is not sensitive on its own (Meta app IDs are effectively public — they appear in OAuth redirect URLs) but is not `NEXT_PUBLIC_*` because it's only consumed server-side today.

## Verified: no hardcoded secrets, no accidental exposure

- Grepped `src/` for every `process.env.*` reference — the table above is the complete list; nothing referenced outside it.
- No secret value literal (token, key, password) found committed in source. Encrypted credentials (WhatsApp access tokens, app secrets) are stored per-account in Postgres via `ENCRYPTION_KEY`, never in env vars or source.
- `logAuditEvent`'s `redact()` helper (`src/lib/audit/log.ts`) strips credential-shaped keys before any before/after snapshot reaches the audit table, independent of what a call site passes in.

## Production deployment checklist

Confirm on Hostinger before/at each deploy:

1. All six "Required" variables above are set.
2. `WHATSAPP_TEMPLATES_DRY_RUN` is **not set** (or explicitly `false`) — if left on from a dev/staging copy, template submit/sync silently no-ops against Meta.
3. `AUTOMATION_CRON_SECRET` matches the `x-cron-secret` header configured in the external pinger (cron-job.org or equivalent) hitting `/api/automations/cron` and `/api/flows/cron`.
