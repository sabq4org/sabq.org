import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ audit: vi.fn(), transaction: vi.fn(), insert: vi.fn(), select: vi.fn() }));
vi.mock("../../server/db", () => ({ db: { transaction: state.transaction } }));
vi.mock("../../server/services/botEditorAudit", () => ({ recordBotEditorAudit: state.audit }));
vi.mock("../../shared/articleHistory", () => ({
  snapshotFromArticle: (row: { title: string }) => ({ title: row.title }),
  changedSnapshotFields: () => ["title"],
}));
import { isLegacyNashr, legacyArabicWrite } from "../../server/services/botEditorLegacyAudit";

const before = { id: "a", title: "قبل", source: "agency", updatedAt: new Date("2026-01-01") };
const after = { ...before, title: "بعد" };
const tx = {
  select: state.select,
  insert: state.insert,
};
beforeEach(() => {
  vi.clearAllMocks();
  state.transaction.mockImplementation(async (fn: (arg: typeof tx) => unknown) => fn(tx));
  state.select.mockReturnValue({ from: () => ({ where: () => ({ limit: () => {
    const result = Promise.resolve([{ id: "version" }]);
    return Object.assign(result, { for: async () => [before] });
  } }) }) });
  state.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
  state.audit.mockResolvedValue(undefined);
});
describe("legacy Arabic audit", () => {
  it("only identifies the environment nashr identity", () => {
    expect(isLegacyNashr({ name: "nashr-sabq" })).toBe(true);
    expect(isLegacyNashr({ name: "grok-bot" })).toBe(false);
    expect(isLegacyNashr({ name: "nashr-sabq", personal: {} as never })).toBe(false);
  });
  it("locks and audits the actual before and after in the write transaction", async () => {
    const write = vi.fn().mockResolvedValue(after);
    await expect(legacyArabicWrite({ name: "nashr-sabq" }, "a", "scheduled", write)).resolves.toEqual(after);
    expect(write).toHaveBeenCalledWith(tx);
    expect(state.audit).toHaveBeenCalledWith(tx, expect.objectContaining({
      actorId: null, originalSource: "agency", operation: "scheduled", before, after,
    }));
    expect(state.insert).toHaveBeenCalledTimes(1);
  });
  it("propagates audit failure to abort the transaction", async () => {
    state.audit.mockRejectedValue(new Error("audit failed"));
    await expect(legacyArabicWrite({ name: "nashr-sabq" }, "a", "ready", async () => after as never)).rejects.toThrow("audit failed");
  });
  it("does not start a transaction for other bot identities", async () => {
    await legacyArabicWrite({ name: "grok-bot" }, "a", "ready", async () => after as never);
    expect(state.transaction).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
  });
});
