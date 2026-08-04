import { describe, expect, it } from "vitest";
import {
  extractPhoneNumberId,
  resolveAppSecretForPayload,
} from "./webhook-app-secret";
import { encrypt } from "./encryption";

// extractPhoneNumberId is the part that parses hostile input, so it is
// unit-tested hard here: everything it returns is fed into a database
// query, and anything it mishandles is reachable by an unauthenticated
// POST to the public webhook URL.

describe("extractPhoneNumberId", () => {
  const wrap = (metadata: unknown) =>
    JSON.stringify({ entry: [{ changes: [{ value: { metadata } }] }] });

  it("pulls the id out of a well-formed payload", () => {
    expect(extractPhoneNumberId(wrap({ phone_number_id: "12345" }))).toBe(
      "12345",
    );
  });

  it("returns the first id when several changes are batched", () => {
    const body = JSON.stringify({
      entry: [
        { changes: [{ value: { metadata: { phone_number_id: "first" } } }] },
        { changes: [{ value: { metadata: { phone_number_id: "second" } } }] },
      ],
    });
    expect(extractPhoneNumberId(body)).toBe("first");
  });

  it("returns null for malformed JSON rather than throwing", () => {
    // A throw here would 500 the webhook and let an attacker knock the
    // endpoint over with a garbage body.
    expect(extractPhoneNumberId("not json{{{")).toBeNull();
  });

  it.each([
    ["missing entry", "{}"],
    ["entry not an array", '{"entry":{}}'],
    ["empty entry", '{"entry":[]}'],
    ["missing changes", '{"entry":[{}]}'],
    ["missing value", '{"entry":[{"changes":[{}]}]}'],
    ["missing metadata", '{"entry":[{"changes":[{"value":{}}]}]}'],
  ])("returns null when %s", (_, body) => {
    expect(extractPhoneNumberId(body)).toBeNull();
  });

  it.each([
    ["an object", { phone_number_id: { $ne: null } }],
    ["an array", { phone_number_id: ["12345"] }],
    ["a number", { phone_number_id: 12345 }],
    ["null", { phone_number_id: null }],
    ["an empty string", { phone_number_id: "" }],
  ])("rejects a phone_number_id that is %s", (_, metadata) => {
    // Non-string values must never reach .eq(). Returning null makes the
    // caller fall back to the global secret, which the attacker also
    // does not hold — so the request still fails signature verification.
    expect(extractPhoneNumberId(wrap(metadata))).toBeNull();
  });

  it("returns null for template-lifecycle events, which carry no metadata", () => {
    const body = JSON.stringify({
      entry: [
        {
          changes: [
            {
              field: "message_template_status_update",
              value: { event: "APPROVED", message_template_id: "1" },
            },
          ],
        },
      ],
    });
    expect(extractPhoneNumberId(body)).toBeNull();
  });
});

describe("resolveAppSecretForPayload", () => {
  const GLOBAL = process.env.META_APP_SECRET!;

  const bodyFor = (phoneNumberId: string) =>
    JSON.stringify({
      entry: [
        { changes: [{ value: { metadata: { phone_number_id: phoneNumberId } } }] },
      ],
    });

  /** Minimal stub of the supabase query chain this module uses. */
  const stubClient = (result: {
    data?: { app_secret: string | null } | null;
    error?: unknown;
  }) => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => result }),
      }),
    }),
  });

  it("returns the account's own secret, decrypted", async () => {
    const client = stubClient({ data: { app_secret: encrypt("tenant-secret") } });
    await expect(
      resolveAppSecretForPayload(bodyFor("999"), client),
    ).resolves.toBe("tenant-secret");
  });

  it("falls back to the global secret when the account has none", async () => {
    // The common case: the number is connected under the operator's own
    // Meta app, so there is no per-account secret to use.
    const client = stubClient({ data: { app_secret: null } });
    await expect(
      resolveAppSecretForPayload(bodyFor("999"), client),
    ).resolves.toBe(GLOBAL);
  });

  it("falls back to the global secret for an unknown phone_number_id", async () => {
    const client = stubClient({ data: null });
    await expect(
      resolveAppSecretForPayload(bodyFor("unknown"), client),
    ).resolves.toBe(GLOBAL);
  });

  it("falls back to the global secret when the lookup errors", async () => {
    const client = stubClient({ data: null, error: new Error("db down") });
    await expect(
      resolveAppSecretForPayload(bodyFor("999"), client),
    ).resolves.toBe(GLOBAL);
  });

  it("does not throw when decryption fails, e.g. after an ENCRYPTION_KEY rotation", async () => {
    // Must degrade to the global secret rather than surfacing an
    // exception — a throw here would 500 the public webhook endpoint.
    const client = stubClient({ data: { app_secret: "not-valid-ciphertext" } });
    await expect(
      resolveAppSecretForPayload(bodyFor("999"), client),
    ).resolves.toBe(GLOBAL);
  });

  it("never consults the database for a payload with no phone_number_id", async () => {
    let queried = false;
    const client = {
      from: () => {
        queried = true;
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({}) }) }) };
      },
    };
    await expect(resolveAppSecretForPayload("{}", client)).resolves.toBe(GLOBAL);
    expect(queried).toBe(false);
  });
});
