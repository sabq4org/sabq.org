import { describe, expect, it } from "vitest";
import { parseMailerLiteWebhooks } from "../../server/services/mailerlite";

describe("MailerLite webhook payload normalization", () => {
  it("normalizes current top-level event payloads and batched legacy events", async () => {
    const fixture = (await import("../fixtures/mailerlite/subscriber-events.json")).default;
    const events = parseMailerLiteWebhooks(fixture);

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("subscriber.unsubscribed");
    expect(events[0].data.subscriber?.email).toBe("reader@example.invalid");
    expect(events[1].type).toBe("subscriber.bounced");
    expect(events[1].data.subscriber?.email).toBe("bounced@example.invalid");
  });

  it("keeps the single-event compatibility parser", () => {
    const event = parseMailerLiteWebhooks({
      event: "subscriber.unsubscribed",
      id: "one",
      email: "reader@example.invalid",
    })[0];
    expect(event?.data.subscriber?.email).toBe("reader@example.invalid");
  });
});
