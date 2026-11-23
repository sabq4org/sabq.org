import { describe, expect, it, vi } from "vitest";

const rows = vi.hoisted(() => ({ value: [] as unknown[], error: null as unknown }));
vi.mock("../../server/db", () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: async () => {
      if (rows.error) throw rows.error;
      return rows.value;
    },
  };
  return { db: { select: () => chain } };
});

import { DutyAlertsNotReadyError, listDutyAlerts } from "../../server/services/contentDuty/dutyBotService";

const row = (id: number) => ({
  id, kind: "late", userId: "u1", occurrenceKey: "k", payload: { text: `t${id}` },
  createdAt: new Date("2026-11-26T11:15:00Z"), deferredUntil: null, deliveredAt: null,
});

describe("listDutyAlerts", () => {
  it("returns limit rows, the last id as cursor, and hasMore", async () => {
    rows.error = null;
    rows.value = [row(5), row(6), row(7)];
    const page = await listDutyAlerts(4, 2);
    expect(page.alerts.map((a) => a.id)).toEqual(["5", "6"]);
    expect(page).toMatchObject({ nextCursor: "6", hasMore: true });
    expect(page.alerts[0]).toMatchObject({ kind: "late", text: "t5", deferred: false, createdAt: "2026-11-26T11:15:00.000Z" });
  });
  it("keeps the caller's cursor when nothing new", async () => {
    rows.value = [];
    expect(await listDutyAlerts(9, 50)).toEqual({ alerts: [], nextCursor: "9", hasMore: false });
  });
  it("maps a missing table to DutyAlertsNotReadyError", async () => {
    rows.error = Object.assign(new Error("missing"), { code: "42P01" });
    await expect(listDutyAlerts(0, 10)).rejects.toBeInstanceOf(DutyAlertsNotReadyError);
    rows.error = null;
  });
});
