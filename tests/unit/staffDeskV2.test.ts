import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  sendStaffAdminPush: vi.fn(),
}));

vi.mock("../../server/db", () => ({
  db: {
    select: (...args: unknown[]) => mocks.dbSelect(...args),
  },
}));

vi.mock("../../server/services/staffAppPushService", async () => {
  const actual = await vi.importActual<
    typeof import("../../server/services/staffAppPushService")
  >("../../server/services/staffAppPushService");
  return {
    ...actual,
    sendStaffAdminPush: (...args: unknown[]) => mocks.sendStaffAdminPush(...args),
  };
});

import {
  computeStaffCanceledBySelf,
  resolveStaffSocialSenderKind,
  safeStaffAvatarUrl,
} from "../../shared/staffApp";
import {
  CANCEL_REASON_REQUIRED_MESSAGE,
  SocialPublishValidationError,
  resolveCancelReason,
} from "../../server/services/socialPublishing/socialPublishingService";
import {
  getStaffAlertPrefs,
  normalizeStaffAlertPrefs,
  staffAlertPrefsKey,
} from "../../server/services/staffAlertPrefsService";
import {
  mapAiModelStatus,
  summarizeAiHealth,
  toStaffHealthModel,
} from "../../server/services/staffSystemHealthService";
import {
  buildStaffAlertsResponse,
  sortStaffAlerts,
  type StaffAlertItem,
} from "../../server/services/staffAdminAlertsService";
import {
  CHAIN_EXHAUSTED_DEBOUNCE_MS,
  __resetStaffAiAlertStateForTests,
  budgetAlertMarkerKey,
  budgetThresholdReached,
  handleAiGatewayIncident,
  listRecentChainExhaustedIncidents,
  notifyStaffOfAiStatusChange,
  shortenAiError,
} from "../../server/services/staffAiAlertPush";
import { formatRiyadhTime } from "../../server/services/staffAppPushService";

beforeEach(() => {
  mocks.dbSelect.mockReset();
  mocks.sendStaffAdminPush.mockReset();
  mocks.sendStaffAdminPush.mockResolvedValue(1);
  __resetStaffAiAlertStateForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("sender kinds + avatars (contract §1)", () => {
  it("maps social sender kinds: agency, writer, reporter, organization", () => {
    expect(resolveStaffSocialSenderKind({ isAgency: true, roles: ["opinion_author"] })).toBe("agency");
    expect(resolveStaffSocialSenderKind({ isAgency: false, roles: ["reader", "opinion_author"] })).toBe("writer");
    // كاتب الرأي يسبق المراسل
    expect(resolveStaffSocialSenderKind({ isAgency: false, roles: ["reporter", "opinion_author"] })).toBe("writer");
    expect(resolveStaffSocialSenderKind({ isAgency: false, roles: ["reporter"] })).toBe("reporter");
    expect(resolveStaffSocialSenderKind({ isAgency: false, roles: ["journalist"] })).toBe("reporter");
    expect(resolveStaffSocialSenderKind({ isAgency: false, roles: ["correspondent"] })).toBe("reporter");
    expect(resolveStaffSocialSenderKind({ isAgency: false, roles: ["system_admin"] })).toBe("organization");
    expect(resolveStaffSocialSenderKind({ isAgency: false, roles: ["editor", "chief_editor"] })).toBe("organization");
    expect(resolveStaffSocialSenderKind({ isAgency: false, roles: [] })).toBe("organization");
    // أدوار غير معروفة (فشل الجلب) ⇒ السلوك القديم
    expect(resolveStaffSocialSenderKind({ isAgency: false, roles: null })).toBe("writer");
    expect(resolveStaffSocialSenderKind({ isAgency: false })).toBe("writer");
  });

  it("passes through only absolute https avatar URLs", () => {
    expect(safeStaffAvatarUrl("https://media.sabq.org/a.webp")).toBe("https://media.sabq.org/a.webp");
    expect(safeStaffAvatarUrl("  https://imagedelivery.net/x/y/public  ")).toBe(
      "https://imagedelivery.net/x/y/public",
    );
    expect(safeStaffAvatarUrl("http://media.sabq.org/a.webp")).toBeNull();
    expect(safeStaffAvatarUrl("/objects/avatars/a.webp")).toBeNull();
    expect(safeStaffAvatarUrl("javascript:alert(1)")).toBeNull();
    expect(safeStaffAvatarUrl("https://")).toBeNull();
    expect(safeStaffAvatarUrl("")).toBeNull();
    expect(safeStaffAvatarUrl(null)).toBeNull();
    expect(safeStaffAvatarUrl(42)).toBeNull();
  });

  it("computes canceledBySelf", () => {
    expect(computeStaffCanceledBySelf({ status: "canceled", canceledByUserId: "u1", createdByUserId: "u1" })).toBe(true);
    expect(computeStaffCanceledBySelf({ status: "canceled", canceledByUserId: "u2", createdByUserId: "u1" })).toBe(false);
    expect(computeStaffCanceledBySelf({ status: "canceled", canceledByUserId: null, createdByUserId: "u1" })).toBeNull();
    expect(computeStaffCanceledBySelf({ status: "draft", canceledByUserId: "u1", createdByUserId: "u1" })).toBeNull();
  });
});

describe("cancel reason rule (task 2)", () => {
  it("lets the owner withdraw without a reason", () => {
    expect(resolveCancelReason({ createdByUserId: "u1" }, "u1", undefined)).toBeNull();
    expect(resolveCancelReason({ createdByUserId: "u1" }, "u1", "  ")).toBeNull();
    expect(resolveCancelReason({ createdByUserId: "u1" }, "u1", " سحب ")).toBe("سحب");
  });

  it("requires a non-empty trimmed reason when rejecting someone else's post", () => {
    for (const raw of [undefined, null, "", "   \n "]) {
      try {
        resolveCancelReason({ createdByUserId: "u1" }, "editor-9", raw);
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(SocialPublishValidationError);
        expect((err as SocialPublishValidationError).status).toBe(400);
        expect((err as Error).message).toBe(CANCEL_REASON_REQUIRED_MESSAGE);
      }
    }
    expect(resolveCancelReason({ createdByUserId: "u1" }, "editor-9", "  صياغة تسويقية ")).toBe("صياغة تسويقية");
  });

  it("treats a post without a creator as someone else's", () => {
    expect(() => resolveCancelReason({ createdByUserId: null }, "editor-9", "")).toThrow(
      CANCEL_REASON_REQUIRED_MESSAGE,
    );
  });
});

describe("alert prefs defaults (contract §3)", () => {
  it("normalizes missing/invalid values to ON", () => {
    expect(normalizeStaffAlertPrefs(undefined)).toEqual({ aiAlerts: true, adminAlerts: true });
    expect(normalizeStaffAlertPrefs({ aiAlerts: "no" })).toEqual({ aiAlerts: true, adminAlerts: true });
    expect(normalizeStaffAlertPrefs({ aiAlerts: false })).toEqual({ aiAlerts: false, adminAlerts: true });
    expect(normalizeStaffAlertPrefs({ aiAlerts: false, adminAlerts: false })).toEqual({
      aiAlerts: false,
      adminAlerts: false,
    });
  });

  it("returns both ON when the system_settings row is missing", async () => {
    const where = vi.fn(() => ({ limit: () => Promise.resolve([]) }));
    mocks.dbSelect.mockImplementation(() => ({ from: () => ({ where }) }));
    await expect(getStaffAlertPrefs("admin-1")).resolves.toEqual({ aiAlerts: true, adminAlerts: true });
    expect(staffAlertPrefsKey("admin-1")).toBe("staff_app.alert_prefs:admin-1");
  });

  it("reads the stored row", async () => {
    mocks.dbSelect.mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([{ value: { aiAlerts: false } }]) }) }),
    }));
    await expect(getStaffAlertPrefs("admin-1")).resolves.toEqual({ aiAlerts: false, adminAlerts: true });
  });
});

describe("system health summary (contract §4)", () => {
  it("maps raw breaker statuses", () => {
    expect(mapAiModelStatus("healthy")).toBe("up");
    expect(mapAiModelStatus(null)).toBe("up");
    expect(mapAiModelStatus("degraded")).toBe("degraded");
    expect(mapAiModelStatus("down")).toBe("down");
    expect(mapAiModelStatus("quota_exceeded")).toBe("down");
  });

  it("summarizes ok / partial / down with Arabic titles", () => {
    expect(summarizeAiHealth([]).status).toBe("ok");
    expect(summarizeAiHealth([{ status: "up" }, { status: "up" }])).toMatchObject({
      status: "ok",
      title: "كل النماذج تعمل",
    });
    expect(summarizeAiHealth([{ status: "up" }, { status: "degraded" }])).toMatchObject({
      status: "partial",
      title: "تعطّل جزئي",
    });
    expect(summarizeAiHealth([{ status: "up" }, { status: "down" }]).status).toBe("partial");
    expect(summarizeAiHealth([{ status: "down" }, { status: "down" }])).toMatchObject({
      status: "down",
      title: "النماذج متوقفة",
    });
    expect(summarizeAiHealth([{ status: "degraded" }, { status: "degraded" }]).status).toBe("partial");
  });

  it("shortens model errors to ≤140 chars and strips keys", () => {
    // Fake key assembled at runtime so the secret scanner doesn't flag a literal fixture.
    const fakeKey = ["sk", "abcdefghijklmnopqrstuvwxyz123456"].join("-");
    const longErr = `401 invalid api_key=${fakeKey} Bearer abc.def.ghi ${"x".repeat(300)}`;
    const model = toStaffHealthModel(
      {
        provider: "openai",
        modelId: "gpt-5.1",
        health: {
          id: "h1",
          provider: "openai",
          modelId: "gpt-5.1",
          status: "quota_exceeded",
          failCount: 3,
          lastError: longErr,
          lastErrorCode: "QUOTA_EXCEEDED",
          cooldownUntil: new Date("2026-10-25T10:00:00Z"),
          lastCheckedAt: new Date("2026-10-25T09:00:00Z"),
          updatedAt: new Date("2026-10-25T08:00:00Z"),
        },
      },
      { requests: 10, failures: 4 },
    );
    expect(model).toMatchObject({
      providerLabel: "OpenAI",
      status: "down",
      rawStatus: "quota_exceeded",
      since: "2026-10-25T08:00:00.000Z",
      lastCheckAt: "2026-10-25T09:00:00.000Z",
      requests24h: 10,
      failures24h: 4,
    });
    expect(model.lastError?.code).toBe("QUOTA_EXCEEDED");
    expect(model.lastError!.message!.length).toBeLessThanOrEqual(140);
    expect(model.lastError!.message).not.toContain("sk-abcdefghijkl");
    expect(model.lastError!.message).not.toContain("abc.def.ghi");
    expect(shortenAiError("AIzaSyA1234567890abcdefghijklmnop failed")).not.toContain("AIzaSy");
  });

  it("reports healthy models without an error", () => {
    const model = toStaffHealthModel({ provider: "anthropic", modelId: "claude-sonnet-4-6", health: null }, undefined);
    expect(model).toMatchObject({ status: "up", rawStatus: "healthy", lastError: null, since: null, requests24h: 0 });
  });
});

describe("alerts sorting (contract §5)", () => {
  const item = (id: string, severity: "urgent" | "info", occurredAt: string): StaffAlertItem => ({
    id,
    kind: "ai_incident",
    severity,
    title: id,
    body: "",
    occurredAt,
    deeplink: null,
    action: null,
  });

  it("puts urgent first, then newest first, capped at 50", () => {
    const sorted = sortStaffAlerts([
      item("info-new", "info", "2026-10-25T12:00:00Z"),
      item("urgent-old", "urgent", "2026-10-24T12:00:00Z"),
      item("urgent-new", "urgent", "2026-10-25T11:00:00Z"),
      item("info-old", "info", "2026-10-20T12:00:00Z"),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["urgent-new", "urgent-old", "info-new", "info-old"]);

    const many = Array.from({ length: 70 }, (_, n) =>
      item(`i${n}`, n % 2 ? "info" : "urgent", new Date(Date.UTC(2026, 9, 1, 0, n)).toISOString()),
    );
    const res = buildStaffAlertsResponse(many, new Date("2026-10-25T00:00:00Z"));
    expect(res.items).toHaveLength(50);
    expect(res.counts).toEqual({ urgent: 35, info: 15 });
    expect(res.items[0].severity).toBe("urgent");
    expect(res.generatedAt).toBe("2026-10-25T00:00:00.000Z");
  });
});

describe("AI pushes (contract §6)", () => {
  const incident = (featureKey: string, kind: "chain_exhausted" | "failover" = "chain_exhausted") => ({
    kind,
    featureKey,
    provider: "anthropic",
    modelId: "claude-sonnet-4-6",
    errorCode: "TIMEOUT",
    message: "all models failed",
  });

  it("ignores non chain_exhausted incidents", async () => {
    await expect(handleAiGatewayIncident(incident("seo", "failover"))).resolves.toBe(false);
    expect(mocks.sendStaffAdminPush).not.toHaveBeenCalled();
    expect(listRecentChainExhaustedIncidents()).toHaveLength(0);
  });

  it("debounces chain_exhausted ≥10 min per featureKey but records every incident", async () => {
    let t = Date.parse("2026-10-25T10:00:00Z");
    const now = () => t;

    await expect(handleAiGatewayIncident(incident("seo"), now)).resolves.toBe(true);
    t += 5 * 60 * 1000;
    await expect(handleAiGatewayIncident(incident("seo"), now)).resolves.toBe(false);
    // ميزة أخرى لها نافذتها الخاصة
    await expect(handleAiGatewayIncident(incident("tts"), now)).resolves.toBe(true);
    t += CHAIN_EXHAUSTED_DEBOUNCE_MS;
    await expect(handleAiGatewayIncident(incident("seo"), now)).resolves.toBe(true);

    expect(mocks.sendStaffAdminPush).toHaveBeenCalledTimes(3);
    const [pref, message] = mocks.sendStaffAdminPush.mock.calls[0];
    expect(pref).toBe("aiAlerts");
    expect(message).toMatchObject({ type: "ai_status", deeplink: "sabqdesk://system" });
    expect(message.body).toMatch(/\d{2}:\d{2}$/);

    const recent = listRecentChainExhaustedIncidents(new Date(t));
    expect(recent).toHaveLength(4);
    expect(recent[0].featureKey).toBe("seo");
    // خارج نافذة 24 ساعة لا يظهر
    expect(listRecentChainExhaustedIncidents(new Date(t + 25 * 60 * 60 * 1000))).toHaveLength(0);
  });

  it("status-change push follows the 15-min cooldown and skips healthy→healthy", async () => {
    let t = Date.parse("2026-10-25T10:00:00Z");
    const now = () => t;
    const change = {
      provider: "openai" as const,
      modelId: "gpt-5.1",
      prevStatus: "healthy" as const,
      newStatus: "down" as const,
      lastErrorCode: "SERVER_ERROR",
    };
    await expect(notifyStaffOfAiStatusChange(change, now)).resolves.toBe(true);
    t += 60 * 1000;
    await expect(notifyStaffOfAiStatusChange(change, now)).resolves.toBe(false);
    await expect(
      notifyStaffOfAiStatusChange({ ...change, prevStatus: "down", newStatus: "healthy" }, now),
    ).resolves.toBe(true);
    await expect(
      notifyStaffOfAiStatusChange({ ...change, prevStatus: "healthy", newStatus: "healthy" }, now),
    ).resolves.toBe(false);
    t += 15 * 60 * 1000;
    await expect(notifyStaffOfAiStatusChange(change, now)).resolves.toBe(true);
    expect(mocks.sendStaffAdminPush).toHaveBeenCalledTimes(3);
    expect(mocks.sendStaffAdminPush.mock.calls[1][1].title).toBe("تعافى نموذج الذكاء الاصطناعي");
  });

  it("budget thresholds respect alertAt80/alertAt100 flags", () => {
    const base = {
      id: "b1",
      scope: "global",
      scopeKey: "",
      monthlyLimitUsd: 100,
      alertAt80: true,
      alertAt100: true,
      isEnabled: true,
      spentThisMonthUsd: 0,
    };
    expect(budgetThresholdReached({ ...base, spentThisMonthUsd: 79 })).toBeNull();
    expect(budgetThresholdReached({ ...base, spentThisMonthUsd: 80 })).toBe(80);
    expect(budgetThresholdReached({ ...base, spentThisMonthUsd: 120 })).toBe(100);
    expect(budgetThresholdReached({ ...base, spentThisMonthUsd: 120, alertAt100: false })).toBe(80);
    expect(budgetThresholdReached({ ...base, spentThisMonthUsd: 90, alertAt80: false })).toBeNull();
    expect(budgetThresholdReached({ ...base, spentThisMonthUsd: 120, isEnabled: false })).toBeNull();
    expect(budgetThresholdReached({ ...base, monthlyLimitUsd: 0, spentThisMonthUsd: 5 })).toBeNull();
    expect(budgetAlertMarkerKey("b1", "2026-10", 80)).toBe("staff_app.ai_budget_alert:b1:2026-10:80");
  });

  it("formats Riyadh time as HH:mm with Latin digits", () => {
    expect(formatRiyadhTime(new Date("2026-10-25T21:05:00Z"))).toBe("00:05");
    expect(formatRiyadhTime(new Date("2026-10-25T09:30:00Z"))).toBe("12:30");
  });
});
