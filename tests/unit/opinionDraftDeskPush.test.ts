import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const chain = (rows: unknown[]): any => {
    const obj: any = {};
    for (const m of ["from", "where", "innerJoin", "leftJoin", "limit"]) obj[m] = () => obj;
    obj.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject);
    return obj;
  };
  return {
    chain,
    candidates: [] as { id: string; role: string }[],
    grants: {} as Record<string, string[]>,
    prefs: new Map<string, any>(),
    sendPushToUserApp: vi.fn(async () => ({ attempted: 1, sent: 1, failed: 0, errors: [] })),
  };
});

vi.mock("../../server/db", () => ({
  db: { select: vi.fn(() => h.chain(h.candidates)) },
}));
vi.mock("../../server/rbac", () => ({
  userHasPermission: vi.fn(async (userId: string, code: string) => (h.grants[userId] ?? []).includes(code)),
}));
vi.mock("../../server/services/userAppPushService", () => ({
  sendPushToUserApp: h.sendPushToUserApp,
}));
vi.mock("../../server/services/staffAlertPrefsService", () => ({
  getStaffAlertPrefsForUsers: vi.fn(async () => h.prefs),
}));

import { DEFAULT_STAFF_ALERT_PREFS } from "@shared/staffApp";
import {
  OPINION_DESK_RECIPIENT_PERMISSIONS,
  listOpinionDeskRecipientUserIds,
  notifyStaffDeskOfOpinionDraft,
} from "../../server/services/staffAppPushService";

describe("desk push for new opinion drafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.candidates = [
      { id: "reviewer", role: "editor" },
      { id: "scheduler", role: "editor" },
      { id: "muted", role: "editor" },
      { id: "nobody", role: "editor" },
      { id: "writer-1", role: "opinion_author" },
    ];
    h.grants = {
      reviewer: ["opinion.review"],
      scheduler: ["articles.schedule"],
      muted: ["opinion.review", "articles.schedule"],
      "writer-1": ["opinion.review"],
    };
    h.prefs = new Map([["muted", { ...DEFAULT_STAFF_ALERT_PREFS, opinionDrafts: false }]]);
  });

  it("uses the real permission codes opinion.review OR articles.schedule", async () => {
    expect([...OPINION_DESK_RECIPIENT_PERMISSIONS]).toEqual(["opinion.review", "articles.schedule"]);
    const ids = await listOpinionDeskRecipientUserIds("writer-1");
    expect(ids.sort()).toEqual(["muted", "reviewer", "scheduler"]);
  });

  it("pushes to com.sabq.desk with the opinion deep link, skipping muted members and the author", async () => {
    const sent = await notifyStaffDeskOfOpinionDraft({
      articleId: "art-1",
      title: "مقال رأي جديد: سعد",
      body: "«ع» — بلا موعد ثابت",
      authorId: "writer-1",
      nextSlot: null,
    });
    expect(sent).toBe(2);
    const targets = h.sendPushToUserApp.mock.calls.map((c: any[]) => c[0]).sort();
    expect(targets).toEqual(["reviewer", "scheduler"]);
    const [, bundle, message] = h.sendPushToUserApp.mock.calls[0] as any[];
    expect(bundle).toBe("com.sabq.desk");
    expect(message).toMatchObject({
      title: "مقال رأي جديد: سعد",
      type: "desk.opinion_draft",
      deeplink: "sabqdesk://opinion/art-1",
      data: { articleId: "art-1" },
      collapseId: "desk-opinion-art-1",
    });
    // No ticketId/postId: the current iOS build must not misroute it as a ticket/tweet.
    expect(message.data).not.toHaveProperty("ticketId");
    expect(message.data).not.toHaveProperty("postId");
  });

  it("does not throw when APNs fails", async () => {
    h.sendPushToUserApp.mockRejectedValue(new Error("apns"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      notifyStaffDeskOfOpinionDraft({ articleId: "a", title: "t", body: "b", authorId: null }),
    ).resolves.toBe(0);
    errSpy.mockRestore();
  });
});
