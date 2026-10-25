import { describe, expect, it } from "vitest";
import {
  accumulateAnthropicCosts,
  accumulateOpenAiCosts,
  arabicDays,
  averageDailySpend,
  barFraction,
  buildBalancePush,
  buildBalanceSummaryText,
  buildDailySeries,
  compareBalancePriority,
  computeBalanceState,
  criticalThreshold,
  decideBalanceAlert,
  estimateBalance,
  estimateDaysLeft,
  formatBalanceAmount,
  formatCompact,
  nextBaseline,
  parseDeepSeekBalance,
  parseElevenLabsSubscription,
  recordSnapshot,
  spendFromSnapshots,
  appendTopup,
  MAX_TOPUP_HISTORY,
} from "../../server/services/aiBalanceMath";

const NOW = new Date("2026-10-25T19:20:00.000Z"); // 22:20 الرياض

describe("state math", () => {
  it("critical is a quarter of the threshold", () => {
    expect(criticalThreshold(100)).toBe(25);
    expect(criticalThreshold(20)).toBe(5);
  });

  it("healthy / low / critical boundaries", () => {
    expect(computeBalanceState(150, 100)).toBe("healthy");
    expect(computeBalanceState(100, 100)).toBe("healthy");
    expect(computeBalanceState(86.3, 100)).toBe("low");
    expect(computeBalanceState(25, 100)).toBe("low");
    expect(computeBalanceState(24.99, 100)).toBe("critical");
    expect(computeBalanceState(1.85, 20)).toBe("critical");
    expect(computeBalanceState(0, 20)).toBe("critical");
    expect(computeBalanceState(Number.NaN, 20)).toBe("critical");
  });

  it("estimated balance = baseline − spend since, never negative", () => {
    expect(estimateBalance(500, 413.7)).toBe(86.3);
    expect(estimateBalance(500, 0)).toBe(500);
    expect(estimateBalance(50, 80)).toBe(0);
    expect(estimateBalance(50, -3)).toBe(50);
  });

  it("bar fraction is clamped and null without a total", () => {
    expect(barFraction(86.3, 500)).toBeCloseTo(0.1726);
    expect(barFraction(600, 500)).toBe(1);
    expect(barFraction(5, null)).toBeNull();
    expect(barFraction(5, 0)).toBeNull();
  });
});

describe("series and days left", () => {
  it("builds a 30-day series ending today with zeros for gaps", () => {
    const s = buildDailySeries(new Map([["2026-10-25", 14.2], ["2026-10-20", 20]]), NOW);
    expect(s).toHaveLength(30);
    expect(s[29]).toEqual({ date: "2026-10-25", value: 14.2 });
    expect(s[0].date).toBe("2026-09-26");
    expect(s.find((p) => p.date === "2026-10-21")?.value).toBe(0);
  });

  it("averages the last 7 full days (excluding today)", () => {
    const map = new Map<string, number>();
    for (let d = 18; d <= 24; d++) map.set(`2026-10-${d}`, 20);
    map.set("2026-10-25", 500); // اليوم لا يدخل
    const avg = averageDailySpend(buildDailySeries(map, NOW), NOW);
    expect(avg).toBe(20);
    expect(estimateDaysLeft(86.3, avg)).toBe(4.3);
    expect(estimateDaysLeft(586.3, avg)).toBe(29.3);
  });

  it("no spend ⇒ no days-left estimate", () => {
    expect(averageDailySpend(buildDailySeries(new Map(), NOW), NOW)).toBeNull();
    expect(estimateDaysLeft(10, null)).toBeNull();
  });

  it("derives DeepSeek daily spend from balance snapshots, ignoring top-ups", () => {
    const spend = spendFromSnapshots({ "2026-10-22": 10, "2026-10-23": 7.5, "2026-10-24": 25, "2026-10-25": 22.2 });
    expect(spend.get("2026-10-23")).toBe(2.5);
    expect(spend.get("2026-10-24")).toBe(0);
    expect(spend.get("2026-10-25")).toBe(2.8);
  });

  it("keeps only the newest snapshots", () => {
    let days: Record<string, number> = {};
    for (let d = 1; d <= 40; d++) days = recordSnapshot(days, `2026-09-${String(d).padStart(2, "0")}`, d, 35);
    expect(Object.keys(days)).toHaveLength(35);
  });
});

describe("provider payload parsing", () => {
  it("DeepSeek prefers USD and reads string balances", () => {
    expect(
      parseDeepSeekBalance({
        is_available: true,
        balance_infos: [
          { currency: "CNY", total_balance: "110.00" },
          { currency: "USD", total_balance: "1.85" },
        ],
      }),
    ).toEqual({ amount: 1.85, unit: "usd", isAvailable: true });
    expect(parseDeepSeekBalance({ is_available: false, balance_infos: [{ currency: "CNY", total_balance: "0.00" }] })).toEqual({
      amount: 0,
      unit: "cny",
      isAvailable: false,
    });
    expect(parseDeepSeekBalance({})).toBeNull();
    expect(parseDeepSeekBalance(null)).toBeNull();
  });

  it("ElevenLabs remaining characters and reset date", () => {
    expect(
      parseElevenLabsSubscription({ character_count: 317_600, character_limit: 500_000, next_character_count_reset_unix: 1_793_750_400 }),
    ).toEqual({ used: 317_600, limit: 500_000, remaining: 182_400, resetsAt: new Date(1_793_750_400_000).toISOString() });
    expect(parseElevenLabsSubscription({ character_count: 1 })).toBeNull();
  });

  it("OpenAI costs are dollars per daily bucket", () => {
    const map = new Map<string, number>();
    accumulateOpenAiCosts(
      {
        data: [
          {
            start_time: Date.UTC(2026, 9, 24) / 1000,
            results: [{ amount: { value: 12.5, currency: "usd" } }, { amount: { value: 7.7, currency: "usd" } }],
          },
          { start_time: Date.UTC(2026, 9, 25) / 1000, results: [] },
        ],
      },
      map,
    );
    expect(map.get("2026-10-24")).toBeCloseTo(20.2);
    expect(map.get("2026-10-25")).toBe(0);
  });

  it("Anthropic cost_report amounts are cents as decimal strings", () => {
    const map = new Map<string, number>();
    accumulateAnthropicCosts(
      { data: [{ starting_at: "2026-10-24T00:00:00Z", results: [{ amount: "123.45", currency: "USD" }, { amount: "100", currency: "USD" }] }] },
      map,
    );
    expect(map.get("2026-10-24")).toBeCloseTo(2.2345);
  });
});

describe("top-ups", () => {
  const topupAt = new Date("2026-10-02T09:00:00.000Z");
  it("first top-up starts the estimate at its own date", () => {
    expect(nextBaseline({ mode: "add", amountUsd: 500, topupAt, now: NOW, currentEstimate: null })).toEqual({ amountUsd: 500, at: topupAt });
  });
  it("later top-up adds to the current estimate from now", () => {
    expect(nextBaseline({ mode: "add", amountUsd: 500, topupAt, now: NOW, currentEstimate: 86.3 })).toEqual({ amountUsd: 586.3, at: NOW });
  });
  it("dashboard balance replaces the estimate from now", () => {
    expect(nextBaseline({ mode: "set", amountUsd: 412.4, topupAt, now: NOW, currentEstimate: 86.3 })).toEqual({ amountUsd: 412.4, at: NOW });
  });
  it("a future top-up date is clamped to now", () => {
    expect(nextBaseline({ mode: "add", amountUsd: 5, topupAt: new Date("2027-01-01T00:00:00Z"), now: NOW, currentEstimate: null }).at).toBe(NOW);
  });
  it("history keeps the newest entries", () => {
    let h = appendTopup(undefined, { mode: "add", amountUsd: 1, topupAt: "", savedAt: "", byUserId: "u", byName: "علي", balanceAfterUsd: 1 });
    for (let i = 0; i < 30; i++) h = appendTopup(h, { ...h[0], amountUsd: i });
    expect(h).toHaveLength(MAX_TOPUP_HISTORY);
    expect(h[0].amountUsd).toBe(29);
  });
});

describe("alert decisions", () => {
  it("pushes once per escalation and re-arms on recovery", () => {
    expect(decideBalanceAlert("none", "low")).toEqual({ push: "low", store: "low" });
    expect(decideBalanceAlert("low", "low")).toEqual({ push: null, store: null });
    expect(decideBalanceAlert("low", "critical")).toEqual({ push: "critical", store: "critical" });
    expect(decideBalanceAlert("none", "critical")).toEqual({ push: "critical", store: "critical" });
    expect(decideBalanceAlert("critical", "critical")).toEqual({ push: null, store: null });
    expect(decideBalanceAlert("critical", "low")).toEqual({ push: null, store: "low" });
    expect(decideBalanceAlert("critical", "healthy")).toEqual({ push: null, store: "none" });
    expect(decideBalanceAlert("low", "unavailable")).toEqual({ push: null, store: null });
    expect(decideBalanceAlert("none", "not_configured")).toEqual({ push: null, store: null });
  });

  it("first run after deploy seeds the current level silently (no push burst)", () => {
    expect(decideBalanceAlert("unseeded", "critical")).toEqual({ push: null, store: "critical" });
    expect(decideBalanceAlert("unseeded", "low")).toEqual({ push: null, store: "low" });
    expect(decideBalanceAlert("unseeded", "healthy")).toEqual({ push: null, store: "none" });
    expect(decideBalanceAlert("unseeded", "not_configured")).toEqual({ push: null, store: null });
    expect(decideBalanceAlert("unseeded", "unavailable")).toEqual({ push: null, store: null });
  });

  it("push copy matches the approved concept", () => {
    const ds = buildBalancePush({
      provider: "deepseek", label: "DeepSeek", kind: "actual", unit: "usd", level: "critical",
      amount: 1.85, total: null, threshold: 20, daysLeft: 4.2, resetsAt: null,
    });
    expect(ds.title).toBe("رصيد DeepSeek شبه نافد");
    expect(ds.body).toBe("بقي $1.85 فقط (رصيد فعلي)، ويكفي نحو 4 أيام. اشحن من لوحة DeepSeek لتجنّب توقّف المهام.");
    const oa = buildBalancePush({
      provider: "openai", label: "OpenAI", kind: "estimated", unit: "usd", level: "low",
      amount: 86.3, total: 500, threshold: 100, daysLeft: 5, resetsAt: null,
    });
    expect(oa.title).toBe("رصيد OpenAI التقديري تحت الحد");
    expect(oa.body).toBe("نحو $86 من شحنة $500 (حدّك $100). اضغط لتحديث الرصيد بعد الشحن.");
  });
});

describe("copy helpers", () => {
  it("formats amounts", () => {
    expect(formatBalanceAmount(1.85, "usd")).toBe("$1.85");
    expect(formatBalanceAmount(500, "usd", { whole: true })).toBe("$500");
    expect(formatBalanceAmount(12.4, "cny")).toBe("¥12.40");
    expect(formatBalanceAmount(182_400, "characters")).toBe("182.4K حرف");
    expect(formatCompact(500_000)).toBe("500K");
    expect(formatCompact(1_250_000)).toBe("1.3M");
  });
  it("Arabic day counts", () => {
    expect(arabicDays(0.4)).toBe("أقل من يوم");
    expect(arabicDays(1)).toBe("يوم واحد");
    expect(arabicDays(2)).toBe("يومين");
    expect(arabicDays(4.2)).toBe("4 أيام");
    expect(arabicDays(35)).toBe("35 يومًا");
  });
  it("assistant summary", () => {
    expect(
      buildBalanceSummaryText([
        { label: "DeepSeek", state: "critical" },
        { label: "OpenAI", state: "low" },
        { label: "Anthropic", state: "not_configured" },
        { label: "Gemini", state: "healthy" },
      ]),
    ).toBe("رصيد DeepSeek شبه نافد، وOpenAI تحت الحد. أنصح بشحن الاثنين اليوم.");
    expect(buildBalanceSummaryText([{ label: "OpenAI", state: "low" }])).toBe("رصيد OpenAI تحت الحد. أنصح بشحنه اليوم.");
    expect(buildBalanceSummaryText([{ label: "Gemini", state: "healthy" }])).toBe("كل الأرصدة فوق حدود التنبيه.");
  });
  it("sorts by priority", () => {
    const list = [
      { provider: "gemini" as const, state: "healthy" as const },
      { provider: "anthropic" as const, state: "not_configured" as const },
      { provider: "openai" as const, state: "low" as const },
      { provider: "deepseek" as const, state: "critical" as const },
    ].sort(compareBalancePriority);
    expect(list.map((p) => p.provider)).toEqual(["deepseek", "openai", "anthropic", "gemini"]);
  });
});
