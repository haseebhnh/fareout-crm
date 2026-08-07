import { describe, expect, it } from "vitest";
import { extractMetaMessages } from "./meta-messaging";

// extractMetaMessages parses an unauthenticated webhook body, so it is
// tested against hostile and malformed input as hard as against the
// happy path. Anything it mishandles is reachable by anyone who knows
// the callback URL.

const messagingBody = (event: unknown) => ({
  object: "instagram",
  entry: [{ id: "PAGE_1", messaging: [event] }],
});

describe("extractMetaMessages", () => {
  it("flattens a normal inbound DM", () => {
    const out = extractMetaMessages(
      messagingBody({
        sender: { id: "IGSID_1" },
        recipient: { id: "IG_BIZ_1" },
        timestamp: 1700000000000,
        message: { mid: "mid.1", text: "hello" },
      }),
      "instagram",
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      channel: "instagram",
      senderId: "IGSID_1",
      recipientId: "IG_BIZ_1",
      messageId: "mid.1",
      text: "hello",
      isEcho: false,
    });
  });

  it("marks echoes so our own replies are not re-ingested", () => {
    // Meta echoes messages the business sent. Persisting them as
    // inbound would duplicate every agent reply and inflate unread.
    const out = extractMetaMessages(
      messagingBody({
        sender: { id: "IG_BIZ_1" },
        recipient: { id: "IGSID_1" },
        message: { mid: "mid.echo", text: "our reply", is_echo: true },
      }),
      "instagram",
    );
    expect(out[0].isEcho).toBe(true);
  });

  it("picks up the first attachment url", () => {
    const out = extractMetaMessages(
      messagingBody({
        sender: { id: "IGSID_1" },
        recipient: { id: "IG_BIZ_1" },
        message: {
          mid: "mid.2",
          attachments: [{ payload: { url: "https://cdn/img.jpg" } }],
        },
      }),
      "instagram",
    );
    expect(out[0].mediaUrl).toBe("https://cdn/img.jpg");
    expect(out[0].text).toBeNull();
  });

  it("accepts numeric ids, which Meta sends unquoted in some payloads", () => {
    const out = extractMetaMessages(
      messagingBody({
        sender: { id: 12345 },
        recipient: { id: 67890 },
        message: { mid: "mid.3", text: "hi" },
      }),
      "messenger",
    );
    expect(out[0].senderId).toBe("12345");
    expect(out[0].recipientId).toBe("67890");
  });

  it("returns [] for a WhatsApp payload", () => {
    // The endpoint is shared. A WhatsApp body must fall through to the
    // WhatsApp handler untouched rather than be half-parsed here.
    const whatsapp = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA",
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "123" },
                messages: [{ id: "wamid.1", from: "1555", type: "text" }],
              },
            },
          ],
        },
      ],
    };
    expect(extractMetaMessages(whatsapp, "instagram")).toEqual([]);
  });

  it.each([
    ["null", null],
    ["a string", "not-an-object"],
    ["a number", 42],
    ["no entry", {}],
    ["entry as an object", { entry: {} }],
    ["entry as a string", { entry: "x" }],
    ["messaging as an object", { entry: [{ messaging: {} }] }],
    ["null entries", { entry: [null] }],
    ["null events", { entry: [{ messaging: [null] }] }],
  ])("returns [] and does not throw for %s", (_, body) => {
    // A throw here 500s the webhook, and Meta retries anything that is
    // not a fast 200 — so a crafted body would become a retry storm.
    expect(() => extractMetaMessages(body, "instagram")).not.toThrow();
    expect(extractMetaMessages(body, "instagram")).toEqual([]);
  });

  it("skips events missing sender, recipient, or message id", () => {
    const cases = [
      { recipient: { id: "B" }, message: { mid: "m" } },
      { sender: { id: "A" }, message: { mid: "m" } },
      { sender: { id: "A" }, recipient: { id: "B" } },
      { sender: { id: "A" }, recipient: { id: "B" }, message: {} },
    ];
    for (const event of cases) {
      expect(extractMetaMessages(messagingBody(event), "instagram")).toEqual([]);
    }
  });

  it("rejects non-primitive ids rather than passing them to a query", () => {
    const out = extractMetaMessages(
      messagingBody({
        sender: { id: { $ne: null } },
        recipient: { id: ["B"] },
        message: { mid: "m" },
      }),
      "instagram",
    );
    expect(out).toEqual([]);
  });

  it("falls back to now() for a missing or bogus timestamp", () => {
    const out = extractMetaMessages(
      messagingBody({
        sender: { id: "A" },
        recipient: { id: "B" },
        timestamp: "not-a-number",
        message: { mid: "m", text: "x" },
      }),
      "instagram",
    );
    expect(Number.isNaN(Date.parse(out[0].timestamp))).toBe(false);
  });

  it("collects messages across several entries and events", () => {
    const body = {
      object: "page",
      entry: [
        {
          messaging: [
            { sender: { id: "A" }, recipient: { id: "P" }, message: { mid: "1", text: "a" } },
            { sender: { id: "B" }, recipient: { id: "P" }, message: { mid: "2", text: "b" } },
          ],
        },
        {
          messaging: [
            { sender: { id: "C" }, recipient: { id: "P" }, message: { mid: "3", text: "c" } },
          ],
        },
      ],
    };
    expect(extractMetaMessages(body, "messenger").map((m) => m.messageId)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });
});
