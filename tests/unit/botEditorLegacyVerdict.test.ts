import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ audit: vi.fn(), transaction: vi.fn(), select: vi.fn(), insert: vi.fn() }));
vi.mock("../../server/db", () => ({ db: { transaction: state.transaction } }));
vi.mock("../../server/services/botEditorAudit", () => ({ recordBotEditorAudit: state.audit }));
import { recordReviewerVerdict } from "../../server/services/publishFirstService";

describe("legacy nashr reviewer verdict", () => {
  it("writes verdict and its provenance audit in the same transaction", async () => {
    const article = { id: "a", source: "bot" };
    const verdictAt = new Date("2026-01-01");
    const row = { verdict: "ok", reviewerName: "نورة", note: null, verdictAt };
    const first = { from: () => ({ where: () => ({ limit: () => ({ for: async () => [article] }) }) }) };
    const second = { from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }) };
    state.select.mockReturnValueOnce(first).mockReturnValueOnce(second);
    state.insert.mockReturnValue({ values: () => ({ returning: async () => [row] }) });
    const tx = { select: state.select, insert: state.insert };
    state.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));
    state.audit.mockResolvedValue(undefined);
    await expect(recordReviewerVerdict({ articleId: "a", verdict: "ok", reviewerName: "نورة" }, true)).resolves.toMatchObject({ ok: true });
    expect(state.audit).toHaveBeenCalledWith(tx, expect.objectContaining({ actorId: null, operation: "verdict", originalSource: "bot", after: expect.objectContaining({ reviewerVerdict: row }) }));
  });
});
