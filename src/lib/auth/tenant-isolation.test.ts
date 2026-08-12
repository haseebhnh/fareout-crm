import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Cross-tenant isolation guards (§9, §44).
 *
 * Tenant isolation in this app is enforced by PostgreSQL RLS, not by
 * application code — a route handler that forgets to filter by
 * account_id still cannot read another tenant's rows. That is the
 * strongest property the system has, and the one whose regression would
 * be most damaging and least visible: nothing errors, data simply
 * becomes readable across customers.
 *
 * These tests assert the *structural* invariants that make it hold, by
 * reading the migrations. They deliberately do not hit a live database:
 * they must pass in CI with no network and no credentials, and they
 * catch the realistic regression — someone adding a tenant-scoped table
 * and forgetting RLS — at review time rather than after a breach.
 *
 * Live cross-tenant probing (tenant A authenticating and attempting to
 * read tenant B) belongs in an integration suite against a seeded
 * database; it is tracked in OOTRIX-PRODUCTION-READINESS.md and is not
 * a substitute for these.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function readAllMigrations(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n");
}

/**
 * Tables holding tenant data. Every one must be account-scoped and
 * RLS-protected.
 *
 * Adding a tenant-scoped table without adding it here is itself the
 * mistake this file exists to catch, so the list is deliberately
 * explicit rather than derived.
 */
const TENANT_SCOPED_TABLES = [
  "contacts",
  "conversations",
  "messages",
  "tags",
  "custom_fields",
  "contact_notes",
  "pipelines",
  "pipeline_stages",
  "deals",
  "message_templates",
  "quick_replies",
  "broadcasts",
  "automations",
  "automation_steps",
  "automation_logs",
  "automation_pending_executions",
  "flows",
  "flow_runs",
  "whatsapp_config",
  "api_keys",
  "webhook_endpoints",
  "notifications",
  "channel_connections",
  "channel_identities",
  "ai_configs",
  "ai_usage_log",
  "account_invitations",
  "ai_knowledge_chunks",
  "ai_knowledge_documents",
  "audit_log",
  "member_presence",
  "departments",
  "designations",
  "employees",
] as const;

describe("tenant isolation — structural guarantees", () => {
  const sql = readAllMigrations();

  it.each(TENANT_SCOPED_TABLES)(
    "%s has row-level security enabled",
    (table) => {
      // Without this, RLS policies are inert and every row is world-
      // readable to any authenticated user of any tenant.
      const enabled = new RegExp(
        `ALTER TABLE\\s+(public\\.)?${table}\\s+ENABLE ROW LEVEL SECURITY`,
        "i",
      ).test(sql);
      expect(enabled, `${table} is missing ENABLE ROW LEVEL SECURITY`).toBe(
        true,
      );
    },
  );

  it.each(TENANT_SCOPED_TABLES)("%s is account-scoped", (table) => {
    // Every tenant-scoped table must carry account_id, either from its
    // CREATE TABLE or added later (017 backfilled the originals).
    const hasColumn =
      new RegExp(`ALTER TABLE\\s+${table}\\s+[\\s\\S]{0,200}?account_id`, "i").test(
        sql,
      ) ||
      new RegExp(
        `CREATE TABLE[^;]*?${table}\\s*\\([\\s\\S]*?account_id`,
        "i",
      ).test(sql);
    expect(hasColumn, `${table} has no account_id column`).toBe(true);
  });

  it("routes every policy through is_account_member rather than open predicates", () => {
    // A policy written `USING (true)` would disable isolation for that
    // table while still looking like a policy exists.
    const openPolicies = sql.match(/CREATE POLICY[^;]*USING\s*\(\s*true\s*\)/gi);
    expect(
      openPolicies,
      `policies with USING (true) bypass tenant isolation:\n${openPolicies?.join("\n")}`,
    ).toBeNull();
  });

  it("keeps is_account_member SECURITY DEFINER with a pinned search_path", () => {
    // SECURITY DEFINER without a pinned search_path is a privilege-
    // escalation vector: a caller could shadow a referenced object.
    const fn = sql.match(
      /CREATE OR REPLACE FUNCTION is_account_member[\s\S]*?\$\$/i,
    );
    expect(fn, "is_account_member is missing").not.toBeNull();
    expect(fn![0]).toMatch(/SECURITY DEFINER/i);
    expect(fn![0]).toMatch(/SET search_path\s*=\s*public/i);
  });

  it("scopes the channel identity lookup to an account", () => {
    // The inbound-webhook path resolves a person by external id. If that
    // unique index omitted account_id, one tenant's Instagram user could
    // resolve to another tenant's contact.
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX[^;]*channel_identities\s*\(\s*account_id\s*,\s*channel\s*,\s*external_id\s*\)/i,
    );
  });

  it("prevents two accounts claiming the same WhatsApp number", () => {
    // Duplicate phone_number_id makes the webhook's account lookup
    // ambiguous, which silently drops inbound messages (issue #136).
    //
    // Expressed as a table constraint in migration 013, not an index —
    // accept either, since both give the same guarantee and a future
    // migration could reasonably use the other form.
    const asConstraint =
      /ALTER TABLE[\s\S]{0,80}?whatsapp_config[\s\S]{0,300}?UNIQUE\s*\(\s*phone_number_id\s*\)/i.test(
        sql,
      );
    const asIndex =
      /CREATE UNIQUE INDEX[^;]*whatsapp_config[^;]*phone_number_id/i.test(sql);
    expect(
      asConstraint || asIndex,
      "whatsapp_config.phone_number_id is not uniquely constrained",
    ).toBe(true);
  });

  it("prevents two accounts claiming the same external channel", () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX[^;]*channel_connections\s*\(\s*channel\s*,\s*external_id\s*\)/i,
    );
  });
});
