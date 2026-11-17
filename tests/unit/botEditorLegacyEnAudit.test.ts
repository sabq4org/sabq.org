import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ audit: vi.fn(), transaction: vi.fn() }));
vi.mock("../../server/db", () => ({ db: { transaction: state.transaction } }));
vi.mock("../../server/services/botEditorAudit", () => ({ recordBotEditorAudit: state.audit }));
import { legacyEnAuditedWrite } from "../../server/services/botEditorLegacyEnAudit";

describe("legacy English audit", () => {
  it("uses the locked prior source and rolls back if audit fails", async () => {
    const before = { id: "en", seoMetadata: { source: "bot" }, status: "draft" };
    const after = { ...before, status: "scheduled" };
    const tx = { select: () => ({ from: () => ({ where: () => ({ limit: () => ({ for: async () => [before] }) }) }) }) };
    state.transaction.mockImplementation(async (callback: (arg: unknown) => unknown) => callback(tx));
    state.audit.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("audit failed"));
    await expect(legacyEnAuditedWrite({ name: "nashr-sabq" }, "en", "scheduled", async () => after as never)).resolves.toEqual(after);
    expect(state.audit).toHaveBeenCalledWith(tx, expect.objectContaining({ before, after, actorId: null, originalSource: "bot" }));
    await expect(legacyEnAuditedWrite({ name: "nashr-sabq" }, "en", "scheduled", async () => after as never)).rejects.toThrow("audit failed");
  });
});
