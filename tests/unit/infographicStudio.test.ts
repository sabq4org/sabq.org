// «إنفو للموقع»: plan validation (no invented numbers), templates, colour safety and layout checks.

import { beforeEach, describe, expect, it, vi } from "vitest";

const completeMock = vi.fn();
vi.mock("../../server/ai/gateway", () => ({
  aiGateway: { complete: (...args: unknown[]) => completeMock(...args) },
}));

import { INFOGRAPHIC_HEADLINE_PREFIX, infographicStudioRequestSchema, withInfographicPrefix } from "../../shared/infographicStudio";
import { checkBrief, generateInfographicBrief, heroPrompt, salvageBrief } from "../../server/services/infographicStudio/brief";
import {
  buildBodyHtml,
  buildVerticalHtml,
  buildWideHtml,
  ensureContrast,
  escapeHtml,
  titleLineHtml,
  withSafeColours,
} from "../../server/services/infographicStudio/templates";
import { contrastRatio, isLegible, layoutProblems } from "../../server/services/infographicStudio/render";

const source =
  "الربيعة: المملكة قدمت مساعدات إنسانية تجاوزت قيمتها (145) مليار دولار في (175) دولة، " +
  "فيما نفذ مركز الملك سلمان للإغاثة أكثر من (4,000) مشروع في (113) دولة، تجاوزت قيمتها (8.5) مليارات دولار.";

const plan = () => ({
  headline: "145 مليار دولار مساعدات سعودية في 175 دولة",
  kicker: "المملكة العربية السعودية",
  titleLines: ["عطاءٌ جذوره", "في 175 دولة"],
  highlight: "175 دولة",
  hero: { value: "145", unit: "مليار دولار", caption: "مساعدات إنسانية" },
  figures: [
    { value: "4,000", label: "مشروع" },
    { value: "113", label: "دولة" },
    { value: "8.5", label: "مليار دولار" },
  ],
  body: ["قدمت المملكة 145 مليار دولار في 175 دولة.", "ونفذ المركز 4,000 مشروع في 113 دولة."],
  sourceLine: "المصدر: د. عبدالله الربيعة",
  metaphor: "نخلة تمتد جذورها",
  imagePromptVertical: "A date palm with glowing roots",
  imagePromptWide: "A date palm with glowing roots, wide",
  textZone: "top",
  theme: "light",
  ink: "#2B1D0E",
  accent: "#A8741F",
  wash: "#F1E3C8",
});

const assets = {
  heroDataUri: "data:image/jpeg;base64,AAAA",
  logoWhiteSvg: "<svg></svg>",
  fonts: { handicraftsBlack: "data:a", alexandriaArabic: "data:b", alexandriaLatin: "data:c", plexSemiBold: "data:d", plexRegular: "data:e" },
};

beforeEach(() => completeMock.mockReset());

describe("request and headline", () => {
  it("adds the «إنفوجرافيك|» prefix once", () => {
    expect(withInfographicPrefix("145 مليار دولار")).toBe(`${INFOGRAPHIC_HEADLINE_PREFIX}145 مليار دولار`);
    expect(withInfographicPrefix("إنفوجرافيك| 145 مليار دولار")).toBe(`${INFOGRAPHIC_HEADLINE_PREFIX}145 مليار دولار`);
  });

  it("rejects a story too short to build on and unknown fields", () => {
    const base = { requestId: "7d3f4c1e-2b6a-4e1f-9c3d-1a2b3c4d5e6f", title: "عنوان الخبر", content: "x".repeat(100) };
    expect(infographicStudioRequestSchema.safeParse(base).success).toBe(true);
    expect(infographicStudioRequestSchema.safeParse({ ...base, content: "قصير" }).success).toBe(false);
    expect(infographicStudioRequestSchema.safeParse({ ...base, publish: true }).success).toBe(false);
  });
});

describe("checkBrief", () => {
  it("accepts a plan whose numbers all come from the story", () => {
    expect(checkBrief(plan(), source).problems).toEqual([]);
  });

  it("flags an invented figure, a body number not in the story and a stray highlight", () => {
    const p = plan();
    p.figures[1] = { value: "120", label: "دولة" };
    p.body = ["قدمت المملكة 150 مليار دولار."];
    p.highlight = "كلمة غير موجودة";
    const { problems } = checkBrief(p, source);
    expect(problems.join("\n")).toMatch(/120/);
    expect(problems.join("\n")).toMatch(/body/);
    expect(problems.join("\n")).toMatch(/highlight/);
  });

  it("salvage drops unverified figures and fails when fewer than two remain", () => {
    const p = checkBrief({ ...plan(), figures: [{ value: "4,000", label: "a" }, { value: "113", label: "b" }, { value: "999", label: "c" }] }, source).brief!;
    expect(salvageBrief(p, source)?.figures.map((f) => f.value)).toEqual(["4,000", "113"]);
    const q = checkBrief({ ...plan(), figures: [{ value: "4,000", label: "a" }, { value: "999", label: "c" }] }, source).brief!;
    expect(salvageBrief(q, source)).toBeNull();
  });
});

describe("generateInfographicBrief", () => {
  it("retries once with the problems, then returns the corrected plan", async () => {
    const bad = { ...plan(), hero: { value: "146", unit: "مليار", caption: "x" } };
    completeMock.mockResolvedValueOnce({ content: JSON.stringify(bad) }).mockResolvedValueOnce({ content: "```json\n" + JSON.stringify(plan()) + "\n```" });
    const { brief } = await generateInfographicBrief({ title: "مساعدات المملكة", content: `<p>${source}</p>` });
    expect(brief.hero.value).toBe("145");
    expect(completeMock).toHaveBeenCalledTimes(2);
    const retry = completeMock.mock.calls[1][0].messages.at(-1).content as string;
    expect(retry).toMatch(/146/);
  });

  it("refuses a story with no numbers without calling the model", async () => {
    await expect(generateInfographicBrief({ title: "خبر", content: "<p>نص بلا أرقام إطلاقًا</p>" })).rejects.toThrow();
    expect(completeMock).not.toHaveBeenCalled();
  });
});

describe("templates", () => {
  it("escapes model text and wraps the highlight", () => {
    expect(escapeHtml(`<script>"x"</script>`)).toBe("&lt;script&gt;&quot;x&quot;&lt;/script&gt;");
    expect(titleLineHtml("في 175 دولة", "175 دولة")).toBe('في <span class="hl">175 دولة</span>');
    const p = checkBrief({ ...plan(), kicker: "<img src=x onerror=alert(1)>" }, source).brief!;
    const html = buildVerticalHtml(p, assets);
    expect(html).not.toContain("<img src=x");
    expect(buildBodyHtml(["<b>a</b>"])).toBe("<p>&lt;b&gt;a&lt;/b&gt;</p>");
  });

  it("builds both canvases with the AI label, logo and measurable zones", () => {
    const p = checkBrief(plan(), source).brief!;
    for (const html of [buildVerticalHtml(p, assets), buildWideHtml(p, assets)]) {
      expect(html).toContain("صورة مولدة بالذكاء الاصطناعي");
      expect(html).toContain('data-qa="logo"');
      expect(html).toContain('data-zone="main"');
      expect(html).toContain("window.__fit");
    }
    expect(buildVerticalHtml(p, assets)).toContain("width:1080px;height:1920px");
    expect(buildWideHtml(p, assets)).toContain("width:1920px;height:1080px");
  });

  it("darkens a weak accent on a light wash and keeps a strong one", () => {
    const fixed = ensureContrast("#E8C46A", "#F6EEDC", 4.5);
    expect(contrastRatio(hex(fixed), hex("#F6EEDC"))).toBeGreaterThanOrEqual(4.5);
    expect(ensureContrast("#111111", "#F6EEDC", 4.5)).toBe("#111111");
    const safe = withSafeColours({ ink: "#999999", accent: "#FFD27A", wash: "#FFFFFF" });
    expect(contrastRatio(hex(safe.ink), [255, 255, 255])).toBeGreaterThanOrEqual(7);
  });

  it("keeps the text zone calm in both image prompts", () => {
    const p = checkBrief(plan(), source).brief!;
    expect(heroPrompt(p, "vertical")).toMatch(/upper 45%/);
    expect(heroPrompt(p, "wide")).toMatch(/right 55%/);
    expect(heroPrompt(p, "wide")).toMatch(/No text/);
  });
});

describe("layout checks", () => {
  const ok = { scale: 1, fontsLoaded: true, overflow: [], overlaps: [], titleLines: 2, lowContrast: [], blank: false };

  it("blocks blank output, missing fonts and overflow; warns on the rest", () => {
    expect(layoutProblems(ok)).toEqual({ hard: [], warnings: [] });
    expect(layoutProblems({ ...ok, blank: true }).hard).toHaveLength(1);
    expect(layoutProblems({ ...ok, fontsLoaded: false }).hard).toHaveLength(1);
    expect(layoutProblems({ ...ok, overflow: ["main"] }).hard).toHaveLength(1);
    const soft = layoutProblems({ ...ok, overlaps: ["a/b"], titleLines: 3, scale: 0.74, lowContrast: ["hero:1"] });
    expect(soft.hard).toEqual([]);
    expect(soft.warnings).toHaveLength(4);
  });

  it("judges legibility by contrast and background busyness", () => {
    expect(isLegible([0, 0, 0], [255, 255, 255], 80)).toBe(true);
    expect(isLegible([120, 90, 30], [180, 150, 120], 10)).toBe(false);
    expect(isLegible([60, 40, 10], [240, 230, 210], 30)).toBe(true);
  });
});

function hex(h: string): number[] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
