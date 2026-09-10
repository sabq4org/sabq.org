// Publishing gate — the rule that six article endpoints now share.
//
// The audit found the same bug five separate ways, and the most subtle one was
// that "scheduled" is a publishing status: publishScheduledArticles() in
// server/notificationWorker.ts promotes `scheduled` rows to `published` with no
// permission check of its own, so gating only "published" lets a contributor
// publish by scheduling. That is exactly the kind of rule that regresses
// silently, which is what these tests are for.

import { describe, expect, it } from "vitest";
import {
  decidePublish,
  isPublishingStatus,
  type PublishGateState,
} from "../../server/services/publishGateRules";

const NO_PUBLISHER: PublishGateState = { allowed: true, code: "NO_PUBLISHER", publisher: null };

function publisherGate(over: Partial<PublishGateState> & { autoPublish?: boolean }): PublishGateState {
  const { autoPublish, ...rest } = over;
  return {
    allowed: true,
    code: "OK",
    publisher: { autoPublish: autoPublish ?? false },
    ...rest,
  };
}

describe("isPublishingStatus", () => {
  it("treats scheduled as publishing — the scheduler promotes it unchecked", () => {
    expect(isPublishingStatus("scheduled")).toBe(true);
  });

  it("treats published as publishing", () => {
    expect(isPublishingStatus("published")).toBe(true);
  });

  it.each(["draft", "pending", "archived", "review", ""])(
    "leaves %s alone — the gate is only about reaching readers",
    (status) => {
      expect(isPublishingStatus(status)).toBe(false);
    },
  );

  it.each([undefined, null, 42, {}, ["published"]])("rejects non-string %s", (status) => {
    expect(isPublishingStatus(status)).toBe(false);
  });
});

describe("decidePublish", () => {
  it.each(["published", "scheduled"])("personal deny blocks trusted-publisher %s", nextStatus => {
    expect(decidePublish({
      nextStatus, gate: publisherGate({ autoPublish: true }),
      permissions: ["articles.publish"], deniedPermissionCodes: ["articles.publish"],
    })?.httpStatus).toBe(403);
  });

  it("personal publish denial still permits saving a draft", () => {
    expect(decidePublish({
      nextStatus: "draft", gate: publisherGate({ autoPublish: true }),
      permissions: [], deniedPermissionCodes: ["articles.publish"],
    })).toBeNull();
  });

  it("lets a draft through for a user with no publish permission", () => {
    expect(
      decidePublish({ nextStatus: "draft", gate: NO_PUBLISHER, permissions: [] }),
    ).toBeNull();
  });

  it("blocks publishing without articles.publish", () => {
    const denial = decidePublish({
      nextStatus: "published",
      gate: NO_PUBLISHER,
      permissions: ["articles.edit_own"],
    });
    expect(denial?.httpStatus).toBe(403);
    expect(denial?.code).toBe("NO_PUBLISH_PERMISSION");
  });

  it("blocks SCHEDULING without articles.publish — the bypass the audit found", () => {
    const denial = decidePublish({
      nextStatus: "scheduled",
      gate: NO_PUBLISHER,
      permissions: ["articles.edit_own"],
    });
    expect(denial?.httpStatus).toBe(403);
  });

  it("allows publishing with articles.publish", () => {
    expect(
      decidePublish({
        nextStatus: "published",
        gate: NO_PUBLISHER,
        permissions: ["articles.publish"],
      }),
    ).toBeNull();
  });

  it("allows scheduling with articles.publish", () => {
    expect(
      decidePublish({
        nextStatus: "scheduled",
        gate: NO_PUBLISHER,
        permissions: ["articles.publish"],
      }),
    ).toBeNull();
  });

  it("blocks a publisher whose publishing window has closed, even with the permission", () => {
    const denial = decidePublish({
      nextStatus: "published",
      gate: publisherGate({
        allowed: false,
        code: "WINDOW_CLOSED",
        message: "انتهت فترة النشر",
      }),
      permissions: ["articles.publish"],
    });
    expect(denial?.httpStatus).toBe(403);
    expect(denial?.code).toBe("WINDOW_CLOSED");
  });

  it("blocks an inactive publisher", () => {
    const denial = decidePublish({
      nextStatus: "published",
      gate: publisherGate({ allowed: false, code: "INACTIVE", message: "معطل" }),
      permissions: ["articles.publish"],
    });
    expect(denial?.code).toBe("INACTIVE");
  });

  it("lets an auto_publish publisher through without articles.publish", () => {
    expect(
      decidePublish({
        nextStatus: "published",
        gate: publisherGate({ autoPublish: true }),
        permissions: [],
      }),
    ).toBeNull();
  });

  it("does not let a CLOSED-window publisher through on autoPublish", () => {
    const denial = decidePublish({
      nextStatus: "published",
      gate: publisherGate({ allowed: false, code: "WINDOW_CLOSED", autoPublish: true }),
      permissions: [],
    });
    expect(denial).not.toBeNull();
  });

  it("never blocks a non-publishing status, whatever the publisher state", () => {
    expect(
      decidePublish({
        nextStatus: "draft",
        gate: publisherGate({ allowed: false, code: "WINDOW_CLOSED" }),
        permissions: [],
      }),
    ).toBeNull();
  });
});
