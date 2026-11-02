import { describe, expect, it } from "vitest";
import {
  canOverrideDraftLock,
  draftLockBlocksUser,
  draftLockState,
  draftLockTargets,
  normalizeDraftLockNote,
  normalizeOverrideReason,
} from "@shared/draftLock";

const locked = { status: "draft", draftLockedBy: "locker", draftLockedByName: "خالد", draftLockedAt: "2026-11-02T10:00:00.000Z", draftLockNote: " ننتظر الأرقام " };

describe("draft lock rules", () => {
  it("blocks everyone except the locker while the article is a draft", () => {
    expect(draftLockBlocksUser(locked, "locker")).toBe(false);
    expect(draftLockBlocksUser(locked, "colleague")).toBe(true);
    expect(draftLockBlocksUser(locked, null)).toBe(true);
  });

  it("stops applying once the article leaves draft status", () => {
    for (const status of ["published", "scheduled", "archived", "ready_to_publish"]) {
      expect(draftLockBlocksUser({ ...locked, status }, "colleague")).toBe(false);
    }
    expect(draftLockBlocksUser({ status: "draft", draftLockedBy: null }, "colleague")).toBe(false);
  });

  it("describes the lock for the row badge and the editor banner", () => {
    expect(draftLockState(locked, "colleague")).toEqual({
      locked: true,
      lockedBy: { id: "locker", name: "خالد" },
      lockedAt: "2026-11-02T10:00:00.000Z",
      note: "ننتظر الأرقام",
      isOwner: false,
    });
    expect(draftLockState(locked, "locker").isOwner).toBe(true);
    expect(draftLockState({ ...locked, status: "published" }, "locker").locked).toBe(false);
  });

  it("lets only the system admin wildcard override a colleague's lock", () => {
    expect(canOverrideDraftLock(["*"])).toBe(true);
    expect(canOverrideDraftLock(["articles.publish", "articles.edit_any"])).toBe(false);
  });

  it("requires a real reason for an override and trims notes", () => {
    expect(normalizeOverrideReason("  ")).toBeNull();
    expect(normalizeOverrideReason("لا")).toBeNull();
    expect(normalizeOverrideReason("  الخبر   مطلوب الآن ")).toBe("الخبر مطلوب الآن");
    expect(normalizeDraftLockNote("x".repeat(500))).toHaveLength(200);
    expect(normalizeDraftLockNote(42)).toBeNull();
  });
});

describe("draft lock guard targets", () => {
  it("covers every web write on one article", () => {
    const cases: Array<[string, string]> = [
      ["PATCH", "/api/admin/articles/a1"],
      ["DELETE", "/api/admin/articles/a1"],
      ["POST", "/api/admin/articles/a1/publish"],
      ["POST", "/api/admin/articles/a1/archive"],
      ["DELETE", "/api/admin/articles/a1/permanent"],
      ["POST", "/api/admin/articles/a1/request-revision"],
      ["POST", "/api/admin/articles/a1/feature"],
      ["POST", "/api/admin/articles/a1/toggle-breaking"],
      ["POST", "/api/admin/articles/a1/lock"],
      ["POST", "/api/admin/articles/a1/revisions/r1/rollback"],
      ["POST", "/api/admin/articles/a1/versions/v1/restore"],
      ["PUT", "/api/dashboard/articles/a1"],
      ["DELETE", "/api/dashboard/articles/a1"],
      ["POST", "/api/my/articles/a1/submit-review"],
      ["POST", "/api/articles/a1/media-assets"],
      ["POST", "/api/articles/a1/auto-categorize"],
      ["POST", "/api/admin/opinion-writers/schedule-article/a1"],
    ];
    for (const [method, path] of cases) {
      expect(draftLockTargets("web", method, path), `${method} ${path}`).toEqual(["a1"]);
    }
  });

  it("leaves reads, the lock endpoints themselves and non-article routes alone", () => {
    expect(draftLockTargets("web", "GET", "/api/admin/articles/a1")).toBeNull();
    expect(draftLockTargets("web", "POST", "/api/admin/articles/a1/draft-lock")).toBeNull();
    expect(draftLockTargets("web", "DELETE", "/api/admin/articles/a1/draft-lock")).toBeNull();
    expect(draftLockTargets("web", "DELETE", "/api/admin/articles/a1/lock")).toBeNull();
    expect(draftLockTargets("web", "POST", "/api/admin/articles/a1/lock/heartbeat")).toBeNull();
    expect(draftLockTargets("web", "POST", "/api/admin/articles")).toBeNull();
    expect(draftLockTargets("web", "POST", "/api/admin/articles/update-order")).toBeNull();
    expect(draftLockTargets("web", "PATCH", "/api/admin/articles/metrics")).toBeNull();
  });

  it("reads the ids of bulk archive and bulk delete", () => {
    expect(draftLockTargets("web", "POST", "/api/admin/articles/bulk-archive", { articleIds: ["a", "b", 3] })).toEqual(["a", "b"]);
    expect(draftLockTargets("web", "POST", "/api/admin/articles/bulk-delete-permanent", { articleIds: [] })).toBeNull();
  });

  it("covers the mobile admin and resubmit writes under /api/v1", () => {
    expect(draftLockTargets("mobile", "PATCH", "/admin/articles/a1")).toEqual(["a1"]);
    expect(draftLockTargets("mobile", "POST", "/admin/articles/a1/publish")).toEqual(["a1"]);
    expect(draftLockTargets("mobile", "POST", "/admin/articles/a1/archive")).toEqual(["a1"]);
    expect(draftLockTargets("mobile", "DELETE", "/admin/articles/a1/permanent")).toEqual(["a1"]);
    expect(draftLockTargets("mobile", "PUT", "/articles/a1/resubmit")).toEqual(["a1"]);
    expect(draftLockTargets("mobile", "POST", "/articles/a1/view")).toBeNull();
    expect(draftLockTargets("mobile", "POST", "/admin/articles")).toBeNull();
  });
});
