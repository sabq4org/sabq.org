import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadRoster: vi.fn() }));
vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/services/contentDuty/dutyMetricsService", () => ({
  loadRoster: mocks.loadRoster,
  loadDutyData: vi.fn(),
  trackingSince: vi.fn(async () => 0),
}));
vi.mock("../../server/services/contentDuty/dutyRosterStore", () => ({
  ContentDutyNotReadyError: class extends Error {},
  getAlertSettings: vi.fn(async () => (({ quietHours: { enabled: true, startMinute: 120, endMinute: 360 }, enabled: {} }))),
  getThresholds: vi.fn(async () => ({})),
  loadNames: vi.fn(async () => new Map()),
}));

import { runDutyAlertsTick } from "../../server/services/contentDuty/dutyAlertsEngine";

describe("engine before the migration", () => {
  it("logs once, skips quietly, never throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const err = Object.assign(new Error('relation "content_duty_alerts" does not exist'), { code: "42P01" });
    mocks.loadRoster.mockRejectedValue(err);
    const t0 = Date.parse("2026-11-26T11:00:00Z");
    expect(await runDutyAlertsTick(t0)).toMatchObject({ skipped: "not_ready" });
    // خلال 10 دقائق لا يلمس القاعدة أصلًا
    expect(await runDutyAlertsTick(t0 + 60_000)).toMatchObject({ skipped: "not_ready" });
    expect(mocks.loadRoster).toHaveBeenCalledTimes(1);
    // بعدها يعيد المحاولة، ولا يكرر السطر في السجل
    expect(await runDutyAlertsTick(t0 + 11 * 60_000)).toMatchObject({ skipped: "not_ready" });
    expect(mocks.loadRoster).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
  it("other errors are logged and swallowed", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.loadRoster.mockRejectedValue(new Error("boom"));
    await expect(runDutyAlertsTick(Date.parse("2026-11-27T11:00:00Z"))).resolves.toMatchObject({ inserted: 0 });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
