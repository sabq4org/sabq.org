import { beforeEach, describe, expect, it, vi } from "vitest";

const notify = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../../server/services/opinionWritersService", () => ({
  notifyOpinionArticleSubmittedForReview: notify,
}));

import {
  scheduleOpinionResubmitNotification,
  shouldNotifyOpinionResubmit,
} from "../../server/services/opinionResubmitNotify";

const flush = () => new Promise((r) => setImmediate(r));

// PUT /api/v1/articles/:id/resubmit (mobileApiRoutes) يستدعي هذا بعد تحديث المقال.
describe("mobile resubmit → opinion draft alert", () => {
  beforeEach(() => notify.mockClear());

  const updated = {
    id: "art-1",
    title: "مقال معدّل",
    slug: "maqal",
    authorId: "writer-1",
    articleType: "opinion",
    reviewStatus: "pending_review",
  };

  it("notifies like a web submit when an opinion goes needs_changes → pending_review", async () => {
    expect(scheduleOpinionResubmitNotification("needs_changes", updated)).toBe(true);
    expect(notify).not.toHaveBeenCalled(); // في الخلفية، بعد الاستجابة
    await flush();
    expect(notify).toHaveBeenCalledWith({ id: "art-1", title: "مقال معدّل", slug: "maqal", authorId: "writer-1" });
  });

  it("does not notify for news, for non-pending results, or when it was already pending", async () => {
    expect(shouldNotifyOpinionResubmit("needs_changes", { articleType: "news", reviewStatus: "pending_review" })).toBe(false);
    expect(shouldNotifyOpinionResubmit("needs_changes", { articleType: "opinion", reviewStatus: "needs_changes" })).toBe(false);
    expect(shouldNotifyOpinionResubmit("pending_review", { articleType: "opinion", reviewStatus: "pending_review" })).toBe(false);
    expect(scheduleOpinionResubmitNotification("needs_changes", { ...updated, articleType: "news" })).toBe(false);
    await flush();
    expect(notify).not.toHaveBeenCalled();
  });

  it("logs and swallows a failing notify (fire-and-forget)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    notify.mockRejectedValueOnce(new Error("boom"));
    expect(scheduleOpinionResubmitNotification("needs_changes", updated)).toBe(true);
    await flush();
    await flush();
    expect(errSpy).toHaveBeenCalledWith("[Mobile API] opinion resubmit notify failed:", expect.any(Error));
    errSpy.mockRestore();
  });
});
