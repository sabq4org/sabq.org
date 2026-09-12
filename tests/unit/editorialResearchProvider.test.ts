import { afterEach, describe, expect, it, vi } from "vitest";
import { agentsRequest, extractResearch, researchSessionBody, type AgentItem } from "../../server/services/editorialResearchProvider";
const bundle = { summary: "ملخص بحث تحريري مستند إلى المصدر الرسمي المفتوح مع ملاحظة الحدود.", sources: [{ title: "NASA", url: "https://science.nasa.gov/mars/facts/", evidence: "يفسر المصدر لون المريخ." }], openQuestions: [] };
const items = (): AgentItem[] => [
  { type: "message", turn_id: "turn-1", phase: "final_answer", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(bundle) }] },
  { type: "web_search_call", turn_id: "turn-1", status: "completed", action: { type: "open_page", url: bundle.sources[0].url } },
];
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("editorial research provider", () => {
  it("accepts completed final output with an opened source, not commentary or another turn", () => {
    expect(extractResearch(items(), "turn-1")).toEqual(bundle);
    expect(() => extractResearch(items(), "turn-2")).toThrow();
    const commentary = items(); commentary[0].phase = "commentary";
    expect(() => extractResearch(commentary, "turn-1")).toThrow();
  });
  it("rejects invented sources, search-only evidence and incomplete tool calls", () => {
    const invented = items(); invented[1].action!.url = "https://example.com/";
    expect(() => extractResearch(invented, "turn-1")).toThrow(/فتح/);
    const pending = items(); pending[1].status = "in_progress";
    expect(() => extractResearch(pending, "turn-1")).toThrow();
    const search = items(); search[1].action!.type = "search";
    expect(() => extractResearch(search, "turn-1")).toThrow();
  });
  it("keeps secrets, private tools and subagents out of the sandbox", () => {
    const body = researchSessionBody("request-1", "موضوع تجريبي عام");
    expect(body.environment).toEqual({ type: "openai_hosted", network: { access: "disabled" } });
    expect(body.agent.multi_agent.enabled).toBe(false);
    expect(body.agent.tools.map(t => t.type)).toEqual(["web_search"]);
    expect(body.metadata.request_id).toBe("request-1");
  });
  it("does not retry ambiguous creation and keeps upstream bodies out of errors", async () => {
    vi.stubEnv("OPENAI_API_KEY", "synthetic-secret");
    const fetcher = vi.fn().mockRejectedValue(new Error("synthetic-secret")); vi.stubGlobal("fetch", fetcher);
    await expect(agentsRequest("sessions", "POST", {})).rejects.toMatchObject({ code: "provider_unreachable" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockResolvedValue(new Response('{"error":"synthetic-secret"}', { status: 403 }));
    await expect(agentsRequest("sessions")).rejects.toMatchObject({ code: "provider_access" });
  });
  it("treats already-deleted session cleanup as successful", async () => {
    vi.stubEnv("OPENAI_API_KEY", "synthetic-secret"); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    await expect(agentsRequest("sessions/sess_owned", "DELETE")).resolves.toBeNull();
  });
});
