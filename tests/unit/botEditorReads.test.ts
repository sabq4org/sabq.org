import { describe, expect, it, vi } from "vitest";
vi.mock("../../server/db", () => ({ db: { select: vi.fn(() => { throw new Error("unexpected database access"); }) } }));
import { listBotArticles, readBotArticle, readBotReference, relatedBotArticles } from "../../server/services/botEditorReads";

describe("bot editor read validation", () => {
  it.each([
    { limit: "0" }, { limit: "101" }, { limit: "1.5" }, { status: "opinion" },
    { source: "email" }, { cursor: "bad!" }, { from: "2026-02-30T00:00:00Z" },
    { from: "2026-01-01" }, { from: "2026-02-01T00:00:00Z", to: "2026-01-01T00:00:00Z" },
    { unknown: "x" }, { q: ["a", "b"] }, { q: "خب" },
  ])("rejects invalid list query %j before accessing the database", async query => {
    await expect(listBotArticles("ar", query)).rejects.toMatchObject({ httpStatus: 400, code: "validation_error" });
  });
  it.each([{ status: "ready", source: "all" }, { source: "manual", q: "عنوان" }])("accepts supported filters %j", async query => {
    await expect(listBotArticles("en", query)).rejects.toThrow("unexpected database access");
  });
  it("rejects malformed cursor dates before database access", async () => {
    const cursor = Buffer.from(JSON.stringify({ id: "article-1", createdAt: "2026-99-99 00:00:00.000000" })).toString("base64url");
    await expect(listBotArticles("ar", { cursor })).rejects.toMatchObject({ httpStatus: 400 });
  });
  it("rejects unsupported language, reference kind and extra single-article query", async () => {
    await expect(listBotArticles("ur" as "ar", {})).rejects.toMatchObject({ httpStatus: 400 });
    await expect(readBotReference("en", "users", {})).rejects.toMatchObject({ httpStatus: 400 });
    await expect(readBotArticle("ar", "id", { includePrivate: "true" })).rejects.toMatchObject({ httpStatus: 400 });
  });
  it.each([{ limit: 0 }, { limit: 21 }, { limit: "5" }, { ids: ["a"] }])("rejects invalid related request %j", async body => {
    await expect(relatedBotArticles("en", "id", body)).rejects.toMatchObject({ httpStatus: 400 });
  });
});
