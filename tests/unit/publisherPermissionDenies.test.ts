import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  permissionData: vi.fn(),
  reads: [] as unknown[][],
  writes: [] as Record<string, unknown>[],
}));
vi.mock("../../server/rbac", () => ({ getUserPermissionData: state.permissionData }));
vi.mock("../../server/db", () => ({ db: {
  select: () => {
    const rows = state.reads.shift() ?? [];
    const query: any = { from: () => query, where: () => query, limit: () => query,
      then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(rows).then(resolve) };
    return query;
  },
  update: () => ({ set: (value: Record<string, unknown>) => {
    state.writes.push(value);
    return { where: () => Promise.resolve([]) };
  } }),
} }));
vi.mock("../../server/storage", () => ({ storage: {} }));
vi.mock("../../server/services/email", () => ({ sendEmailNotification: vi.fn() }));
vi.mock("../../server/services/publisherCreditService", () => ({ deductPublisherCreditSafely: vi.fn() }));
vi.mock("../../server/services/contentInvalidation", () => ({ invalidatePublishedContent: vi.fn() }));
vi.mock("../../server/memoryCache", () => ({ withCache: vi.fn(), memoryCache: { delete: vi.fn(), invalidatePattern: vi.fn() } }));

import { trustedPublisherCanPublish, submitPortalArticle } from "../../server/services/publisherPortalService";
import { denyPublish } from "../../server/services/publishGate";

const publisher = { id: "agency", autoPublish: true, isActive: true, publishingEndsAt: null };
beforeEach(() => {
  state.permissionData.mockReset().mockResolvedValue({ permissions: [], deniedPermissionCodes: ["articles.publish"] });
  state.reads = [[publisher]]; state.writes = [];
});
describe("publisher grant respects personal deny at execution", () => {
  it("refuses the trusted-publisher shortcut used by direct publish and submitForReview", async () => {
    expect(await trustedPublisherCanPublish("publisher")).toBe(false);
  });
  it("still grants a trusted publisher without a deny", async () => {
    state.permissionData.mockResolvedValue({ permissions: [], deniedPermissionCodes: [] });
    expect(await trustedPublisherCanPublish("publisher")).toBe(true);
  });
  it.each(["published", "scheduled"])("denies %s at the publishing service boundary", async nextStatus => {
    expect((await denyPublish("publisher", nextStatus))?.httpStatus).toBe(403);
  });
  it("keeps a denied publisher's portal submission in review rather than auto-publishing", async () => {
    state.reads.push([{ id: "article", status: "draft" }]);
    expect(await submitPortalArticle("publisher", "article")).toMatchObject({ ok: true, published: false });
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0]).toMatchObject({ publisherStatus: "pending" });
    expect(state.writes[0]).not.toHaveProperty("status", "published");
  });
  it("fails closed before writing when overrides cannot be read", async () => {
    state.permissionData.mockRejectedValue(new Error("permission store unavailable"));
    await expect(trustedPublisherCanPublish("publisher")).rejects.toThrow("permission store unavailable");
    state.reads = [[publisher], [{ id: "article", status: "draft" }]];
    await expect(submitPortalArticle("publisher", "article")).rejects.toThrow("permission store unavailable");
    expect(state.writes).toEqual([]);
  });
  it("allows ordinary draft saves without querying the permission store", async () => {
    expect(await denyPublish("publisher", "draft")).toBeNull();
    expect(state.permissionData).not.toHaveBeenCalled();
  });
});
