import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ setArgs: [] as unknown[], lockRows: [] as Array<{ user_name?: string }> }));
vi.mock("../../server/db", () => ({
  db: {
    update: () => ({ set: (fields: unknown) => { state.setArgs.push(fields); return { where: async () => undefined }; } }),
    execute: async () => ({ rows: state.lockRows }),
  },
}));
vi.mock("../../server/services/imageOptimizationService", () => ({ generateLiteOptimizedImage: async () => "https://lite.example/a.webp" }));

import { articleWriteConflict, refreshArticleLiteImage, setArticleDerivedFields } from "../../server/services/articleDerivedWrites";

describe("article derived writes keep the editor's save version", () => {
  beforeEach(() => { state.setArgs = []; state.lockRows = []; });

  it("writes only the derived columns, never updatedAt", async () => {
    await setArticleDerivedFields("a", { aiBullets: ["x"], aiBulletsGeneratedAt: new Date() });
    await refreshArticleLiteImage("a", "https://img.example/a.jpg");
    expect(state.setArgs).toHaveLength(2);
    for (const fields of state.setArgs) expect(fields).not.toHaveProperty("updatedAt");
    expect(state.setArgs[1]).toEqual({ liteOptimizedImageUrl: "https://lite.example/a.webp" });
  });

  it("skips the lite image when the article has no image", async () => {
    await refreshArticleLiteImage("a", null);
    expect(state.setArgs).toHaveLength(0);
  });

  it("names another editor's live lock instead of a version conflict", async () => {
    state.lockRows = [{ user_name: "سارة" }];
    expect(await articleWriteConflict("a", "me")).toMatchObject({ code: "ARTICLE_LOCKED" });
    state.lockRows = [];
    expect(await articleWriteConflict("a", "me")).toMatchObject({ code: "ARTICLE_VERSION_CONFLICT" });
  });
});
