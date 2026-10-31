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

import { DEFAULT_STAFF_ALERT_PREFS, staffAlertPrefsUpdateSchema } from "@shared/staffApp";
import {
  countStaffNewsItems,
  filterStaffNewsItems,
  isStaffNewsPending,
  sortStaffNewsItems,
  staffEditRequestApproveSchema,
  staffNewsChannel,
  staffNewsPersonLine,
  staffNewsReturnSchema,
  staffNewsScheduleError,
  type StaffNewsItem,
} from "@shared/staffNews";
import { notifyStaffDeskOfNewsItem } from "../../server/services/staffAppPushService";

const draft = (id: string, over: Partial<Extract<StaffNewsItem, { kind: "draft" }>> = {}): StaffNewsItem => ({
  kind: "draft",
  id,
  articleId: id,
  title: id,
  subtitle: null,
  channel: "app",
  reporterName: "مراسل",
  categoryName: null,
  imageUrl: null,
  thumbnailUrl: null,
  albumCount: 0,
  isBreaking: false,
  lockedBy: null,
  submittedAt: "2026-10-31T07:00:00.000Z",
  ...over,
});

const request = (id: string, over: Partial<Extract<StaffNewsItem, { kind: "edit_request" }>> = {}): StaffNewsItem => ({
  kind: "edit_request",
  id,
  articleId: `a-${id}`,
  title: id,
  articleStatus: "published",
  requesterName: "مراسل",
  urgent: false,
  note: null,
  fields: ["title"],
  label: "العنوان",
  imageUrl: null,
  submittedAt: "2026-10-31T06:00:00.000Z",
  ...over,
});

describe("staffNewsPersonLine", () => {
  it("shows the real sender and the byline when they differ", () => {
    expect(staffNewsPersonLine("علي الحازمي", "صحيفة سبق")).toBe("علي الحازمي · باسم صحيفة سبق");
    expect(staffNewsPersonLine("مراسل جدة", "مراسل جدة")).toBe("مراسل جدة");
    expect(staffNewsPersonLine(null, "صحيفة سبق")).toBe("صحيفة سبق");
    expect(staffNewsPersonLine("مراسل جدة", null)).toBe("مراسل جدة");
  });
});

describe("staff news pending rules", () => {
  it("classifies the channel from articles.source", () => {
    expect(staffNewsChannel("email")).toBe("email");
    expect(staffNewsChannel("url")).toBe("email");
    expect(staffNewsChannel("ios-app")).toBe("app");
    expect(staffNewsChannel("android-app")).toBe("app");
    expect(staffNewsChannel("manual")).toBe("web");
    expect(staffNewsChannel(null)).toBe("web");
  });

  it("shows reporter drafts sent for review and unreviewed email drafts, never opinion", () => {
    const base = { articleType: "news", status: "draft", reviewStatus: "pending_review", source: "ios-app" };
    expect(isStaffNewsPending(base)).toBe(true);
    expect(isStaffNewsPending({ ...base, articleType: "opinion" })).toBe(false);
    expect(isStaffNewsPending({ ...base, status: "scheduled" })).toBe(false);
    expect(isStaffNewsPending({ ...base, reviewStatus: "needs_changes" })).toBe(false);
    expect(isStaffNewsPending({ ...base, reviewStatus: null, source: "email" })).toBe(true);
    expect(isStaffNewsPending({ ...base, reviewStatus: null, source: "manual" })).toBe(false);
  });

  it("sorts urgent first, then oldest waiting", () => {
    const items = [
      draft("new", { submittedAt: "2026-10-31T08:00:00.000Z" }),
      request("old"),
      draft("breaking", { isBreaking: true, submittedAt: "2026-10-31T09:00:00.000Z" }),
    ];
    expect(sortStaffNewsItems(items).map((i) => i.id)).toEqual(["breaking", "old", "new"]);
  });

  it("filters and counts by tab", () => {
    const items = [draft("app"), draft("mail", { channel: "email" }), request("r1")];
    expect(countStaffNewsItems(items)).toEqual({ all: 3, reporters: 1, editRequests: 1, email: 1 });
    expect(filterStaffNewsItems(items, "reporters").map((i) => i.id)).toEqual(["app"]);
    expect(filterStaffNewsItems(items, "email").map((i) => i.id)).toEqual(["mail"]);
    expect(filterStaffNewsItems(items, "edit_requests").map((i) => i.id)).toEqual(["r1"]);
    expect(filterStaffNewsItems(items, "all")).toHaveLength(3);
  });

  it("validates schedule time window", () => {
    const now = new Date("2026-10-31T08:00:00.000Z");
    expect(staffNewsScheduleError(new Date("2026-10-31T08:00:30.000Z"), now)).toMatch(/دقيقة/);
    expect(staffNewsScheduleError(new Date("2026-10-31T09:00:00.000Z"), now)).toBeNull();
    expect(staffNewsScheduleError(new Date("2027-02-01T09:00:00.000Z"), now)).toMatch(/60/);
    expect(staffNewsScheduleError(new Date("nope"), now)).not.toBeNull();
  });

  it("validates request bodies", () => {
    expect(staffNewsReturnSchema.safeParse({ note: "  " }).success).toBe(false);
    expect(staffNewsReturnSchema.safeParse({ note: "أضف المصدر" }).success).toBe(true);
    expect(staffEditRequestApproveSchema.safeParse({ fields: ["title", "albumImages"] }).success).toBe(true);
    expect(staffEditRequestApproveSchema.safeParse({ fields: ["status"] }).success).toBe(false);
    expect(staffEditRequestApproveSchema.safeParse({ extra: 1 }).success).toBe(false);
  });

  it("adds the newsDrafts preference, on by default", () => {
    expect(DEFAULT_STAFF_ALERT_PREFS.newsDrafts).toBe(true);
    expect(staffAlertPrefsUpdateSchema.safeParse({ newsDrafts: false }).success).toBe(true);
  });
});

describe("desk push for reporter news and edit requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.candidates = [
      { id: "editor", role: "editor" },
      { id: "muted", role: "editor" },
      { id: "reporter-1", role: "reporter" },
      { id: "nobody", role: "editor" },
    ];
    h.grants = {
      editor: ["articles.publish"],
      muted: ["articles.publish"],
      "reporter-1": ["articles.publish"],
    };
    h.prefs = new Map([["muted", { ...DEFAULT_STAFF_ALERT_PREFS, newsDrafts: false }]]);
  });

  it("pushes a new reporter draft to articles.publish holders, skipping the sender and muted members", async () => {
    const sent = await notifyStaffDeskOfNewsItem({
      kind: "draft",
      articleId: "art-1",
      title: "أمطار على جدة",
      senderName: "مراسل جدة",
      senderId: "reporter-1",
    });
    expect(sent).toBe(1);
    const [target, bundle, message] = h.sendPushToUserApp.mock.calls[0] as any[];
    expect(target).toBe("editor");
    expect(bundle).toBe("com.sabq.desk");
    expect(message).toMatchObject({
      title: "خبر جديد من مراسل جدة",
      type: "desk.news_draft",
      deeplink: "sabqdesk://news/art-1",
      data: { articleId: "art-1" },
    });
  });

  it("deep-links an edit request to its review screen", async () => {
    await notifyStaffDeskOfNewsItem({
      kind: "edit_request",
      articleId: "art-2",
      requestId: "req-9",
      title: "معرض الكتاب",
      senderName: "مراسل الرياض",
      senderId: "reporter-1",
      urgent: true,
      label: "العنوان والنص",
    });
    const [, , message] = h.sendPushToUserApp.mock.calls[0] as any[];
    expect(message).toMatchObject({
      title: "طلب تعديل عاجل من مراسل الرياض",
      body: "العنوان والنص: معرض الكتاب",
      type: "desk.edit_request",
      deeplink: "sabqdesk://news/edit-request/req-9",
      data: { articleId: "art-2", editRequestId: "req-9" },
    });
  });
});
