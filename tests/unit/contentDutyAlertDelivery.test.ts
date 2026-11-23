import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  whereUpdate: vi.fn(async () => undefined),
  loadRoster: vi.fn(),
}));
vi.mock("../../server/db", () => ({
  db: {
    execute: mocks.execute,
    update: () => ({ set: () => ({ where: mocks.whereUpdate }) }),
  },
}));

import {
  DUTY_ALERT_SIGNATURE_HEADER,
  DUTY_ALERT_TIMESTAMP_HEADER,
  buildAlertWebhookBody,
  buildDigestWebhookBody,
  deliverPendingDutyAlerts,
  dutyRetryDelayMin,
  dutyWebhookConfig,
  postDutyWebhook,
  toDutyAlertWire,
} from "../../server/services/contentDuty/dutyAlertDelivery";
import { DEFAULT_DUTY_ALERT_SETTINGS } from "../../shared/contentDutyAlerts";

const quiet = DEFAULT_DUTY_ALERT_SETTINGS.quietHours;
const row = (id: number, extra: Record<string, unknown> = {}) => ({
  id, kind: "absent", user_id: "u1", occurrence_key: "s1:2026-11-26:u1",
  payload: { label: "غاب عن اللوحة", text: "لا نشاط لفلان", userName: "فلان", data: { since: 1, minutes: 60 }, deferred: false },
  created_at: "2026-11-26T11:00:00.000Z", deferred_until: null, delivery_attempts: 1, ...extra,
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.whereUpdate.mockResolvedValue(undefined);
  fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("config", () => {
  it("is a no-op when DUTY_ALERT_WEBHOOK_URL is unset: nothing claimed, nothing sent", async () => {
    vi.stubEnv("DUTY_ALERT_WEBHOOK_URL", "");
    expect(dutyWebhookConfig()).toBeNull();
    expect(await deliverPendingDutyAlerts(quiet)).toEqual({ sent: 0, failed: 0, digest: 0 });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("reads only the two dedicated env vars (not the desk ones)", () => {
    vi.stubEnv("DESK_ALERT_WEBHOOK_URL", "https://desk.example.test");
    vi.stubEnv("DUTY_ALERT_WEBHOOK_URL", "");
    expect(dutyWebhookConfig()).toBeNull();
    vi.stubEnv("DUTY_ALERT_WEBHOOK_URL", " https://duty.example.test/hook ");
    vi.stubEnv("DUTY_ALERT_WEBHOOK_SECRET", " s3cret ");
    expect(dutyWebhookConfig()).toEqual({ url: "https://duty.example.test/hook", secret: "s3cret" });
  });
  it("backs off 1, 2, 4, 8, 8 minutes", () => {
    expect([1, 2, 3, 4, 5].map(dutyRetryDelayMin)).toEqual([1, 2, 4, 8, 8]);
  });
});

describe("signing", () => {
  it("sends the raw secret in Authorization (like the desk webhook) plus an HMAC-SHA256 of `${ts}.${body}`", async () => {
    const res = await postDutyWebhook({ url: "https://duty.example.test/hook", secret: "s3cret" }, { type: "duty_alert", id: "1" }, "kind=absent id=1");
    expect(res.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://duty.example.test/hook");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("s3cret");
    const ts = headers[DUTY_ALERT_TIMESTAMP_HEADER];
    const expected = `sha256=${createHmac("sha256", "s3cret").update(`${ts}.${init.body as string}`).digest("hex")}`;
    expect(headers[DUTY_ALERT_SIGNATURE_HEADER]).toBe(expected);
  });
  it("omits auth and signature headers when the secret is empty, and never logs the secret", async () => {
    await postDutyWebhook({ url: "https://duty.example.test/hook", secret: "" }, { a: 1 }, "x");
    const headers = (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(headers[DUTY_ALERT_SIGNATURE_HEADER]).toBeUndefined();

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fetchMock.mockRejectedValueOnce(new Error("connect failed with s3cret in message"));
    const res = await postDutyWebhook({ url: "https://duty.example.test/hook", secret: "s3cret" }, { a: 1 }, "x");
    expect(res.ok).toBe(false);
    expect(warn.mock.calls.flat().join(" ")).not.toContain("s3cret");
    warn.mockRestore();
  });
});

describe("payload shape", () => {
  it("single alert", () => {
    const body = buildAlertWebhookBody(toDutyAlertWire({ id: 7, kind: "absent", userId: "u1", occurrenceKey: "k", payload: row(7).payload, createdAt: "2026-11-26T11:00:00.000Z", deferredUntil: null }), new Date("2026-11-26T11:01:00Z"));
    expect(body).toMatchObject({
      type: "duty_alert", id: "7", kind: "absent", label: "غاب عن اللوحة", text: "لا نشاط لفلان", userId: "u1", userName: "فلان",
      occurrenceKey: "k", createdAt: "2026-11-26T11:00:00.000Z", deferred: false, deferredUntil: null, data: { since: 1, minutes: 60 },
      sentAt: "2026-11-26T11:01:00.000Z",
    });
    expect(body.url).toMatch(/\/dashboard\/content-duty$/);
  });
  it("digest", () => {
    const wires = [3, 2].map((id) => toDutyAlertWire({ id, kind: "summary", userId: "u2", occurrenceKey: "k", payload: { text: `t${id}` }, createdAt: `2026-11-25T23:0${id}:00.000Z`, deferredUntil: "2026-11-26T03:00:00.000Z" }));
    const body = buildDigestWebhookBody(wires, quiet);
    expect(body).toMatchObject({ type: "duty_digest", id: "digest:2-3", count: 2, window: { startMinute: 120, endMinute: 360, timeZone: "Asia/Riyadh" } });
    expect(body.text.split("\n")[1]).toBe("• 02:02 t2");
    expect(body.alerts.every((a) => a.deferred)).toBe(true);
  });
});

describe("delivery", () => {
  beforeEach(() => {
    vi.stubEnv("DUTY_ALERT_WEBHOOK_URL", "https://duty.example.test/hook");
    vi.stubEnv("DUTY_ALERT_WEBHOOK_SECRET", "s3cret");
  });
  it("claims atomically (FOR UPDATE SKIP LOCKED), posts each real-time alert, marks delivered", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [row(1), row(2)] }).mockResolvedValueOnce({ rows: [] });
    const res = await deliverPendingDutyAlerts(quiet);
    expect(res).toEqual({ sent: 2, failed: 0, digest: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const claimSql = JSON.stringify(mocks.execute.mock.calls[0][0]);
    expect(claimSql).toContain("FOR UPDATE SKIP LOCKED");
    expect(claimSql).toContain("delivery_attempts + 1");
    expect(mocks.whereUpdate).toHaveBeenCalledTimes(2);
  });
  it("on HTTP failure schedules a bounded retry instead of marking delivered", async () => {
    fetchMock.mockResolvedValueOnce(new Response("no", { status: 502 }));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.execute.mockResolvedValueOnce({ rows: [row(1)] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValue({ rows: [] });
    const res = await deliverPendingDutyAlerts(quiet);
    expect(res).toEqual({ sent: 0, failed: 1, digest: 0 });
    expect(mocks.whereUpdate).not.toHaveBeenCalled();
    const retrySql = JSON.stringify(mocks.execute.mock.calls.map((c) => c[0]));
    expect(retrySql).toContain("next_attempt_at = now() + make_interval");
  });
  it("sends due deferred alerts as ONE digest", async () => {
    const d = { deferred_until: "2026-11-26T03:00:00.000Z" };
    mocks.execute.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [row(5, d), row(6, d), row(7, d)] });
    const res = await deliverPendingDutyAlerts(quiet);
    expect(res).toEqual({ sent: 0, failed: 0, digest: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.type).toBe("duty_digest");
    expect(body.count).toBe(3);
  });
});
