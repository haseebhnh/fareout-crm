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
  "attendance_records",
  "leave_types",
  "leave_requests",
  "holidays",
  "shifts",
  "roster_assignments",
  "job_openings",
  "candidates",
  "interviews",
  "goals",
  "performance_reviews",
  "employee_documents",
  "branches",
  "candidate_applications",
  "hr_settings",
  "employee_onboarding_items",
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

describe("HR — self-vs-admin scoping (§26: employee A must not see employee B's restricted data)", () => {
  const sql = readAllMigrations();

  // Unlike employees/departments (any member reads — a roster isn't
  // secret), attendance and leave are personal data. These tables must
  // NOT use the plain `is_account_member(account_id)` any-member-reads
  // policy shape — every SELECT policy must also require either
  // admin+ or a match against the caller's own linked employee row.
  for (const table of [
    "attendance_records",
    "leave_requests",
    "roster_assignments",
    "goals",
    "performance_reviews",
    "employee_documents",
    "employee_onboarding_items",
  ] as const) {
    it(`${table}: SELECT policy requires admin OR the caller's own employee row`, () => {
      const policy = sql.match(
        new RegExp(`CREATE POLICY \\w+ ON ${table} FOR SELECT[\\s\\S]*?;`, "i"),
      );
      expect(policy, `${table} has no SELECT policy`).not.toBeNull();
      expect(policy![0]).toMatch(/is_account_member\(account_id,\s*'admin'\)/);
      expect(policy![0]).toMatch(/e\.user_id\s*=\s*auth\.uid\(\)/);
    });

    it(`${table} has no bare any-member-reads SELECT policy`, () => {
      // A regression here would look like copying the employees_select
      // pattern (`USING (is_account_member(account_id))` with nothing
      // else) onto a personal-data table — this catches exactly that.
      const bareAnyMember = new RegExp(
        `CREATE POLICY \\w+ ON ${table} FOR SELECT USING \\(is_account_member\\(account_id\\)\\)`,
        "i",
      );
      expect(sql).not.toMatch(bareAnyMember);
    });
  }

  it("interviews: SELECT policy requires admin OR the assigned interviewer", () => {
    // Rule: "interviewers must only see permitted candidate
    // information" — an interviewer's own assignment, not every
    // interview in the account.
    const policy = sql.match(/CREATE POLICY \w+ ON interviews FOR SELECT[\s\S]*?;/i);
    expect(policy, "interviews has no SELECT policy").not.toBeNull();
    expect(policy![0]).toMatch(/is_account_member\(account_id,\s*'admin'\)/);
    expect(policy![0]).toMatch(/interviewer_id\s*=\s*auth\.uid\(\)/);
  });

  it("performance_reviews has no UPDATE policy — reviews are immutable once written", () => {
    // Rule: "Do not overwrite previous review results. Store
    // historical reviews." A missing UPDATE policy means RLS denies
    // every UPDATE by default (Postgres RLS is deny-by-default per
    // command), so this is a real enforcement, not just a convention.
    expect(sql).not.toMatch(/CREATE POLICY \w+ ON performance_reviews FOR UPDATE/i);
  });

  it("goals: a non-admin self-update is restricted to current_value/status by a trigger, not just the RLS policy", () => {
    // WITH CHECK can express "this column equals this value" but not
    // "no OTHER column changed" — that column-level restriction has
    // to be a BEFORE UPDATE trigger. Confirms the trigger exists and
    // is wired to the table, not just defined and forgotten.
    const fn = sql.match(
      /CREATE OR REPLACE FUNCTION goals_restrict_self_update_fields[\s\S]*?\$\$;/i,
    );
    expect(fn, "goals_restrict_self_update_fields is missing").not.toBeNull();
    expect(fn![0]).toMatch(/SECURITY DEFINER/i);
    expect(fn![0]).toMatch(/SET search_path\s*=\s*public/i);
    expect(sql).toMatch(
      /CREATE TRIGGER goals_restrict_self_update\s+BEFORE UPDATE ON goals/i,
    );
  });

  it("HR notification triggers are SECURITY DEFINER with a pinned search_path", () => {
    // Same privilege-escalation concern as is_account_member (§9's
    // guard test) — these functions write into `notifications`, whose
    // table itself has no client INSERT policy specifically so rows
    // can only come from a trusted, pinned-search-path function.
    for (const fnName of ["notify_leave_decision", "notify_shift_assigned"]) {
      const fn = sql.match(
        new RegExp(`CREATE OR REPLACE FUNCTION ${fnName}[\\s\\S]*?\\$\\$;`, "i"),
      );
      expect(fn, `${fnName} is missing`).not.toBeNull();
      expect(fn![0]).toMatch(/SECURITY DEFINER/i);
      expect(fn![0]).toMatch(/SET search_path\s*=\s*public/i);
    }
    expect(sql).toMatch(/CREATE TRIGGER trg_notify_leave_decision\s+AFTER UPDATE ON leave_requests/i);
    expect(sql).toMatch(
      /CREATE TRIGGER trg_notify_shift_assigned\s+AFTER INSERT OR UPDATE ON roster_assignments/i,
    );
  });

  it("is_manager_of is SECURITY DEFINER with a pinned search_path", () => {
    // Same privilege-escalation concern as is_account_member — walks
    // the employees.manager_id chain to decide "is the caller
    // somewhere above this employee", so a shadowed reference here
    // would be a real escalation vector, not just a bug.
    const fn = sql.match(/CREATE OR REPLACE FUNCTION is_manager_of[\s\S]*?\$\$;/i);
    expect(fn, "is_manager_of is missing").not.toBeNull();
    expect(fn![0]).toMatch(/SECURITY DEFINER/i);
    expect(fn![0]).toMatch(/SET search_path\s*=\s*public/i);
  });

  it("manager-chain visibility is wired into every personal-data SELECT policy", () => {
    // A table's SELECT policy is DROPped and CREATEd again in 053 —
    // take the LAST match in file order (migrations apply in filename
    // order, so the last redefinition is what's actually live), not
    // the first, which would be the original pre-053 definition.
    for (const table of [
      "attendance_records",
      "leave_requests",
      "roster_assignments",
      "goals",
      "performance_reviews",
      "employee_documents",
    ] as const) {
      const matches = [
        ...sql.matchAll(new RegExp(`CREATE POLICY \\w+ ON ${table} FOR SELECT[\\s\\S]*?;`, "gi")),
      ];
      expect(matches.length, `${table} has no SELECT policy`).toBeGreaterThan(0);
      const latest = matches[matches.length - 1]![0];
      expect(latest, `${table} SELECT policy doesn't check is_manager_of`).toMatch(
        /is_manager_of\(employee_id\)/,
      );
    }
  });

  it("a manager (not just admin) can approve leave and correct attendance for their reports", () => {
    expect(sql).toMatch(
      /CREATE POLICY leave_requests_update_manager ON leave_requests FOR UPDATE USING \(\s*is_manager_of\(employee_id\)\s*\)/i,
    );
    expect(sql).toMatch(
      /CREATE POLICY attendance_update_manager ON attendance_records FOR UPDATE USING \(\s*is_manager_of\(employee_id\)\s*\)/i,
    );
  });

  it("candidate_applications keeps candidates.stage/job_opening_id synced via a pinned-search-path trigger", () => {
    // The existing /hr/recruitment pipeline UI reads candidates.stage
    // directly and was NOT rewritten to know about the new
    // candidate_applications table (rule: don't touch the existing
    // pipeline) — this trigger is what makes a new-channel application
    // show up there without any UI change.
    const fn = sql.match(
      /CREATE OR REPLACE FUNCTION sync_candidate_primary_application[\s\S]*?\$\$;/i,
    );
    expect(fn, "sync_candidate_primary_application is missing").not.toBeNull();
    expect(fn![0]).toMatch(/SECURITY DEFINER/i);
    expect(fn![0]).toMatch(/SET search_path\s*=\s*public/i);
    expect(sql).toMatch(
      /CREATE TRIGGER trg_sync_candidate_primary_application\s+AFTER INSERT OR UPDATE ON candidate_applications/i,
    );
  });

  it("one candidate cannot have two applications to the same job", () => {
    // The concrete expression of "one candidate may apply to multiple
    // jobs... do not duplicate the person" — re-applying to the SAME
    // opening must update, not fork, a second application row.
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS candidate_applications[\s\S]*?UNIQUE\s*\(\s*candidate_id\s*,\s*job_opening_id\s*\)/i,
    );
  });

  it("leave_types.requires_approval is actually consumed by a trigger, not just stored", () => {
    // Existed since 046 with no consumer — Settings now exposes it as
    // an editable toggle, which would be a fake setting without this.
    const fn = sql.match(
      /CREATE OR REPLACE FUNCTION auto_approve_leave_if_not_required[\s\S]*?\$\$;/i,
    );
    expect(fn, "auto_approve_leave_if_not_required is missing").not.toBeNull();
    expect(fn![0]).toMatch(/SECURITY DEFINER/i);
    expect(fn![0]).toMatch(/SET search_path\s*=\s*public/i);
    expect(sql).toMatch(
      /CREATE TRIGGER trg_auto_approve_leave\s+AFTER INSERT ON leave_requests/i,
    );
  });

  it("an employee can only flip is_done on their own onboarding checklist, not retitle it", () => {
    const fn = sql.match(
      /CREATE OR REPLACE FUNCTION onboarding_restrict_self_update_fields[\s\S]*?\$\$;/i,
    );
    expect(fn, "onboarding_restrict_self_update_fields is missing").not.toBeNull();
    expect(fn![0]).toMatch(/SECURITY DEFINER/i);
    expect(fn![0]).toMatch(/SET search_path\s*=\s*public/i);
    expect(sql).toMatch(
      /CREATE TRIGGER onboarding_restrict_self_update\s+BEFORE UPDATE ON employee_onboarding_items/i,
    );
  });
});
