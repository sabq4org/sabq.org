import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ execute: vi.fn(), select: vi.fn(), exists: true }));
vi.mock("../../server/db", () => ({ db: { execute: mocks.execute, select: mocks.select } }));
vi.mock("../../server/services/botDraftsService", () => ({ BotDraftError: class extends Error { constructor(public status: number, public code: string, message: string) { super(message); } } }));
import { listBotEditorRevisions } from "../../server/services/botEditorHistory";

beforeEach(() => {
  mocks.exists = true;
  mocks.execute.mockReset().mockResolvedValue({ rows: [
    { kind: "version", id: "v1", created_at: new Date("2026-01-02") },
    { kind: "revision", id: "r1", created_at: new Date("2026-01-01") },
  ] });
  mocks.select.mockReset().mockImplementation((selection: Record<string, unknown>) => ({
    from: () => ({ where: () => ({
      limit: async () => mocks.exists ? [{ id: "article" }] : [],
      then: (resolve: (v: unknown) => void) => resolve([{ id: "v1", action: "updated", hasSnapshot: "snapshot" in selection }]),
    }) }),
  }));
});
describe("bot editor history", () => {
  it("checks scope and pages keys before fetching details, excluding snapshots by default", async () => {
    const result = await listBotEditorRevisions("ar", "article", { limit: "1" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ kind: "version", data: { hasSnapshot: false } });
    expect(result.nextOffset).toBe(1);
    expect(mocks.execute).toHaveBeenCalledOnce();
  });
  it("loads snapshots only with includeDetails=1", async () => {
    const result = await listBotEditorRevisions("ar", "article", { limit: "1", includeDetails: "1" });
    expect(result.items[0].data).toMatchObject({ hasSnapshot: true });
  });
  it("rejects unknown articles and invalid pagination before reading history", async () => {
    mocks.exists = false;
    await expect(listBotEditorRevisions("ar", "missing")).rejects.toMatchObject({ status: 404 });
    await expect(listBotEditorRevisions("en", "id", { limit: "101" })).rejects.toMatchObject({ status: 400 });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
