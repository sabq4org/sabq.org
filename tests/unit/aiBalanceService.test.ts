import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// قاعدة بيانات وهمية: system_settings في خريطة، وصرف سبق المسجّل عبر trackedRows.
const state = vi.hoisted(() => ({
  settings: new Map<string, unknown>(),
  trackedRaw: 0,
  trackedDaily: [] as Array<{ date: string; total: number }>,
  /** السجل الخام لنافذة [الأمس، اليوم) — استعلام بحدّين زمنيين. */
  trackedRawYesterday: 0,
}));

vi.mock("../../server/db", () => {
  function chain(resolve: (ctx: { table: unknown; grouped: boolean; whereSql: unknown }) => unknown[]) {
    const ctx = { table: null as unknown, grouped: false, whereSql: null as unknown };
    const obj: Record<string, unknown> = {
      from(t: unknown) { ctx.table = t; return obj; },
      where(w: unknown) { ctx.whereSql = w; return obj; },
      groupBy() { ctx.grouped = true; return obj; },
      limit() { return obj; },
      then(ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) {
        try { return Promise.resolve(resolve(ctx)).then(ok, bad); } catch (e) { return Promise.reject(e).then(ok, bad); }
      },
    };
    return obj;
  }
  return {
    db: {
      select: (fields: Record<string, unknown>) =>
        chain((ctx) => {
          const name = (ctx.table as { [k: symbol]: unknown })?.[Symbol.for("drizzle:Name")];
          if (name === "system_settings") {
            // where(eq(key, x)) — نقرأ القيمة من آخر مفتاح معروف بالسلسلة.
            const key = findKey(ctx.whereSql);
            return key && state.settings.has(key) ? [{ value: state.settings.get(key) }] : [];
          }
          if (name === "ai_usage_daily") return state.trackedDaily;
          if (name === "ai_usage_logs") {
            return [{ total: countDates(ctx.whereSql) >= 2 ? state.trackedRawYesterday : state.trackedRaw }];
          }
          if (name === "ai_budgets") return [];
          void fields;
          return [];
        }),
      insert: () => ({
        values: (row: { key: string; value: unknown }) => {
          const apply = () => { state.settings.set(row.key, row.value); return [{ id: row.key }]; };
          return {
            onConflictDoUpdate: (opts: { set: { value: unknown } }) => {
              const run = () => { state.settings.set(row.key, opts.set.value); return [{ id: row.key }]; };
              return { returning: () => Promise.resolve(run()), then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok) };
            },
            onConflictDoNothing: () => ({ returning: () => Promise.resolve(apply()) }),
          };
        },
      }),
    },
  };

  function countDates(node: unknown, seen = new Set<unknown>()): number {
    if (node instanceof Date) return 1;
    if (!node || typeof node !== "object" || seen.has(node)) return 0;
    seen.add(node);
    let n = 0;
    for (const child of Object.values(node as Record<string, unknown>)) {
      if (Array.isArray(child)) for (const c of child) n += countDates(c, seen);
      else n += countDates(child, seen);
    }
    return n;
  }

  function findKey(node: unknown, seen = new Set<unknown>()): string | null {
    if (!node || typeof node !== "object" || seen.has(node)) return null;
    seen.add(node);
    const v = (node as { value?: unknown }).value;
    if (typeof v === "string" && v.startsWith("staff_app.")) return v;
    for (const child of Object.values(node as Record<string, unknown>)) {
      if (Array.isArray(child)) {
        for (const c of child) { const k = findKey(c, seen); if (k) return k; }
      } else if (child && typeof child === "object") {
        const k = findKey(child, seen); if (k) return k;
      }
    }
    return null;
  }
});

import {
  clearAiBalanceCache,
  configKey,
  getAllBalances,
  getProviderBalance,
  saveBalanceThreshold,
  saveBalanceTopup,
  AiBalanceInputError,
} from "../../server/services/aiBalanceService";

// مفاتيح وهمية تُبنى وقت التشغيل (آمنة لـ gitleaks).
const fakeKey = (p: string) => [p, "test", "x".repeat(12)].join("-");
const NOW = new Date("2026-10-25T19:20:00.000Z");
const ENV_NAMES = [
  "DEEPSEEK_API_KEY", "ELEVENLABS_API_KEY", "OPENAI_ADMIN_KEY", "ANTHROPIC_ADMIN_KEY",
  "AI_INTEGRATIONS_GEMINI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY",
];
const savedEnv: Record<string, string | undefined> = {};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  for (const n of ENV_NAMES) { savedEnv[n] = process.env[n]; delete process.env[n]; }
  state.settings.clear();
  state.trackedRaw = 0;
  state.trackedDaily = [];
  state.trackedRawYesterday = 0;
  clearAiBalanceCache();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  for (const n of ENV_NAMES) { if (savedEnv[n] === undefined) delete process.env[n]; else process.env[n] = savedEnv[n]; }
  vi.unstubAllGlobals();
});

describe("aiBalanceService", () => {
  it("DeepSeek reads the real balance and never echoes the key", async () => {
    const key = fakeKey("sk");
    process.env.DEEPSEEK_API_KEY = key;
    fetchMock.mockResolvedValue(jsonResponse({ is_available: true, balance_infos: [{ currency: "USD", total_balance: "1.85" }] }));
    const b = await getProviderBalance("deepseek", { now: NOW });
    expect(b).toMatchObject({ kind: "actual", unit: "usd", amount: 1.85, state: "critical", threshold: { low: 20, critical: 5 } });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.deepseek.com/user/balance");
    expect(JSON.stringify(b)).not.toContain(key);
    expect(state.settings.has("staff_app.ai_balance_snapshots:deepseek")).toBe(true);
  });

  it("missing key ⇒ unavailable/missing_key, provider errors are sanitized", async () => {
    expect(await getProviderBalance("elevenlabs", { now: NOW })).toMatchObject({ state: "unavailable", reason: "missing_key" });
    const key = fakeKey("sk");
    process.env.DEEPSEEK_API_KEY = key;
    fetchMock.mockRejectedValue(new Error(`boom Bearer ${key}`));
    const b = await getProviderBalance("deepseek", { now: NOW, fresh: true });
    expect(b.state).toBe("unavailable");
    expect(b.error).not.toContain(key);
  });

  it("OpenAI without a top-up is not configured", async () => {
    const b = await getProviderBalance("openai", { now: NOW });
    expect(b).toMatchObject({ kind: "estimated", state: "not_configured", reason: "no_topup", spendSource: "sabq_tracked" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("OpenAI estimate uses the Costs API when OPENAI_ADMIN_KEY is set", async () => {
    process.env.OPENAI_ADMIN_KEY = fakeKey("sk-admin");
    state.settings.set(configKey("openai"), {
      baseline: { amountUsd: 500, at: "2026-10-02T09:00:00.000Z", source: "provider_admin_api", offsetUsd: 0 },
    });
    const buckets = [];
    for (let d = 2; d <= 25; d++) {
      buckets.push({ start_time: Date.UTC(2026, 9, d) / 1000, results: [{ amount: { value: d === 25 ? 14.2 : 17.375, currency: "usd" } }] });
    }
    fetchMock.mockResolvedValue(jsonResponse({ data: buckets, has_more: false }));
    const b = await getProviderBalance("openai", { now: NOW });
    expect(String(fetchMock.mock.calls[0][0])).toContain("https://api.openai.com/v1/organization/costs?");
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toMatch(/^Bearer /);
    expect(b.spendSource).toBe("provider_admin_api");
    expect(b.spentSinceBaseline).toBeCloseTo(413.83, 1);
    expect(b.amount).toBeCloseTo(86.17, 1);
    expect(b.state).toBe("low");
    expect(b.todaySpend).toBe(14.2);
    expect(b.series).toHaveLength(30);
  });

  it("OpenAI falls back to tracked spend if the Costs API fails", async () => {
    process.env.OPENAI_ADMIN_KEY = fakeKey("sk-admin");
    state.settings.set(configKey("openai"), {
      baseline: { amountUsd: 500, at: "2026-10-20T09:00:00.000Z", source: "provider_admin_api", offsetUsd: 0 },
    });
    state.trackedRaw = 413.7;
    fetchMock.mockResolvedValue(jsonResponse({ error: "nope" }, 401));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const b = await getProviderBalance("openai", { now: NOW });
    warn.mockRestore();
    expect(b.spendSource).toBe("sabq_tracked");
    expect(b.amount).toBe(86.3);
  });

  it("Anthropic uses tracked spend without an admin key", async () => {
    state.settings.set(configKey("anthropic"), {
      baseline: { amountUsd: 300, at: "2026-10-20T09:00:00.000Z", source: "sabq_tracked", offsetUsd: 0 },
    });
    state.trackedRaw = 50;
    const b = await getProviderBalance("anthropic", { now: NOW });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(b).toMatchObject({ spendSource: "sabq_tracked", amount: 250, state: "healthy" });
  });

  it("a tracked-source baseline stays on tracked spend after the Costs API recovers", async () => {
    process.env.OPENAI_ADMIN_KEY = fakeKey("sk-admin");
    // حُفظ عند الظهر أثناء تعطل الواجهة: لا إزاحة لصرف الصباح ($40).
    state.settings.set(configKey("openai"), {
      baseline: { amountUsd: 100, at: "2026-10-25T12:00:00.000Z", source: "sabq_tracked", offsetUsd: 0 },
    });
    state.trackedRaw = 0;
    fetchMock.mockResolvedValue(jsonResponse({
      data: [{ start_time: Date.UTC(2026, 9, 25) / 1000, results: [{ amount: { value: 40, currency: "usd" } }] }],
      has_more: false,
    }));
    const b = await getProviderBalance("openai", { now: NOW });
    expect(b.spendSource).toBe("provider_admin_api");
    expect(b.spentSinceBaseline).toBe(0);
    expect(b.amount).toBe(100);
  });

  it("covers yesterday from raw logs before the nightly rollup, without double counting", async () => {
    const early = new Date("2026-10-25T01:00:00.000Z");
    state.settings.set(configKey("anthropic"), {
      baseline: { amountUsd: 300, at: "2026-10-20T09:00:00.000Z", source: "sabq_tracked", offsetUsd: 0 },
    });
    state.trackedRaw = 5;
    state.trackedRawYesterday = 12;
    const before = await getProviderBalance("anthropic", { now: early, fresh: true });
    expect(before.series.find((p) => p.date === "2026-10-24")?.value).toBe(12);
    expect(before.monthSpend).toBe(17);

    state.trackedDaily = [{ date: "2026-10-24", total: 12 }];
    state.trackedRawYesterday = 999; // لا يُقرأ عند وجود ملخص الأمس
    clearAiBalanceCache();
    const after = await getProviderBalance("anthropic", { now: early, fresh: true });
    expect(after.series.find((p) => p.date === "2026-10-24")?.value).toBe(12);
    expect(after.monthSpend).toBe(17);
  });

  it("month spend on day 31 includes the 1st (outside the 30-day chart)", async () => {
    process.env.OPENAI_ADMIN_KEY = fakeKey("sk-admin");
    const day31 = new Date("2026-10-31T12:00:00.000Z");
    const buckets = [1, 2, 31].map((d) => ({ start_time: Date.UTC(2026, 9, d) / 1000, results: [{ amount: { value: 10, currency: "usd" } }] }));
    fetchMock.mockResolvedValue(jsonResponse({ data: buckets, has_more: false }));
    const b = await getProviderBalance("openai", { now: day31, fresh: true });
    expect(b.series).toHaveLength(30);
    expect(b.series[0].date).toBe("2026-10-02");
    expect(b.monthSpend).toBe(30);
    expect(b.todaySpend).toBe(10);
  });

  it("first top-up then threshold save persist to system_settings", async () => {
    state.trackedRaw = 0;
    const actor = { id: "u1", name: "علي" };
    const res = await saveBalanceTopup("openai", { mode: "add", amountUsd: 500, topupAt: "2026-10-25T19:24:00.000Z" }, actor, NOW);
    expect(res.balance).toMatchObject({ amount: 500, state: "healthy", lastTopup: { amount: 500, byName: "علي" } });
    expect(state.settings.get("staff_app.ai_balance_alert:openai")).toMatchObject({ level: "none" });
    const t = await saveBalanceThreshold("openai", 600, actor, NOW);
    expect(t.balance).toMatchObject({ state: "low", threshold: { low: 600, critical: 150, isDefault: false } });
  });

  it("rejects top-ups for actual-balance providers and non-budget modes for Gemini", async () => {
    const actor = { id: "u1", name: "علي" };
    await expect(saveBalanceTopup("deepseek", { mode: "add", amountUsd: 10 }, actor, NOW)).rejects.toBeInstanceOf(AiBalanceInputError);
    await expect(saveBalanceTopup("gemini", { mode: "add", amountUsd: 10 }, actor, NOW)).rejects.toBeInstanceOf(AiBalanceInputError);
    const g = await saveBalanceTopup("gemini", { mode: "budget", amountUsd: 120 }, actor, NOW);
    expect(g.balance).toMatchObject({ kind: "budget", total: 120 });
  });

  it("list is sorted by priority with a summary", async () => {
    process.env.DEEPSEEK_API_KEY = fakeKey("sk");
    fetchMock.mockResolvedValue(jsonResponse({ is_available: true, balance_infos: [{ currency: "USD", total_balance: "1.85" }] }));
    const list = await getAllBalances({ now: NOW });
    expect(list.providers[0].provider).toBe("deepseek");
    expect(list.summary.critical).toBe(1);
    expect(list.summary.text).toContain("DeepSeek");
    expect(list.providers.every((p) => !("series" in p))).toBe(true);
  });
});
