// Opt-in paid evaluation using public research evidence only. No production DB or notifications.
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
const recorded = vi.hoisted(() => ({ usage: [] as unknown[] }));
vi.mock("../../server/ai/gateway", async () => {
  const { AIGateway } = await import("../../server/ai/gateway/gateway");
  const { CircuitBreaker } = await import("../../server/ai/gateway/circuitBreaker");
  const { getDefaultFeatureConfig, getDefaultModel } = await import("../../server/ai/gateway/defaults");
  const { getAdapter } = await import("../../server/ai/gateway/registry");
  return { aiGateway: new AIGateway({ getFeatureConfig: async (key: string) => getDefaultFeatureConfig(key), getModel: async (ref: { provider: string; modelId: string }) => getDefaultModel(ref.provider, ref.modelId), getAdapter, breaker: new CircuitBreaker({ failureThreshold: 3, cooldownMs: 60000 }), logUsage: (entry: unknown) => recorded.usage.push(entry), notifyIncident: () => {}, concurrency: 1, timeoutMs: 90000 }) };
});
import { runEditorialTask } from "../../server/services/editorialAiService";
import { extractResearch } from "../../server/services/editorialResearchProvider";
const enabled = process.env.EDITORIAL_RESEARCH_LIVE_EVAL === "1";
(enabled ? describe : describe.skip)("editorial research live formatting", () => {
  it("turns a real completed public research session into a reviewable Sabq report", async () => {
    const evidence = JSON.parse(readFileSync(process.env.EDITORIAL_RESEARCH_LIVE_EVIDENCE!, "utf8"));
    expect(evidence.turns[0].status).toBe("completed");
    const research = extractResearch(evidence.items, evidence.turns[0].id);
    const result = await runEditorialTask({ type: "report", material: process.env.EDITORIAL_RESEARCH_LIVE_TOPIC ?? "تقرير تفسيري موجز عن سبب اللون الأحمر للمريخ وفق مصدر ناسا الرسمي", verificationContext: JSON.stringify(research), instructions: "اكتب تقريرًا من 100 إلى 150 كلمة باستخدام المصدر المرفق فقط. لا تضف وقائع أو روابط خارج ملف البحث." });
    expect(result.body.length).toBeGreaterThan(150); expect(result.headline.length).toBeGreaterThan(10);
    expect(result.meta.verificationProvided).toBe(true); expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources.every(s => research.sources.some(r => r.url === s.url))).toBe(true);
    writeFileSync(process.env.EDITORIAL_RESEARCH_LIVE_OUTPUT!, JSON.stringify({ result, research, researchUsage: evidence.session.usage, editingUsage: recorded.usage }, null, 2));
  }, 240000);
});
