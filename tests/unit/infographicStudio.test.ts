// «إنفو للموقع»: plan validation (no invented numbers), templates, colour safety and layout checks.

import { beforeEach, describe, expect, it, vi } from "vitest";

const completeMock = vi.fn();
vi.mock("../../server/ai/gateway", () => ({
  aiGateway: { complete: (...args: unknown[]) => completeMock(...args) },
}));

import { INFOGRAPHIC_HEADLINE_PREFIX, infographicStudioRequestSchema, withInfographicPrefix } from "../../shared/infographicStudio";
import { checkBrief, generateInfographicBrief, heroPrompt, numbersFromStory, salvageBrief } from "../../server/services/infographicStudio/brief";
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
    expect(infographicStudioRequestSchema.safeParse({ requestId: base.requestId, content: base.content }).success).toBe(true);
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

  it("works without a title and plans points for a story without numbers", async () => {
    completeMock.mockResolvedValueOnce({ content: JSON.stringify(pointsPlan()) });
    const { brief } = await generateInfographicBrief({ title: "", content: `<p>${tips}</p>` });
    expect(brief.mode).toBe("points");
    expect(brief.hero).toBeNull();
    expect(completeMock.mock.calls[0][0].messages[1].content).toMatch(/لا يوجد عنوان/);
  });
});

const tips =
  "ينصح أطباء التغذية بشرب الماء بانتظام خلال اليوم، وتناول الخضراوات الورقية في كل وجبة، " +
  "وتقليل السكريات المضافة والمشروبات الغازية، والحرص على وجبة إفطار متوازنة قبل الخروج من المنزل.";

const pointsPlan = () => ({
  ...plan(),
  mode: "points",
  headline: "أربع عادات غذائية يومية لصحة أفضل",
  titleLines: ["عاداتك اليومية", "على المائدة"],
  highlight: "المائدة",
  hero: null,
  figures: [],
  points: [
    { title: "الماء أولًا", text: "اشربه بانتظام خلال اليوم" },
    { title: "خضراوات ورقية", text: "في كل وجبة" },
    { title: "سكر أقل", text: "قلّل المضاف والمشروبات الغازية" },
    { title: "إفطار متوازن", text: "قبل الخروج من المنزل" },
  ],
  body: ["ينصح أطباء التغذية بعادات يومية بسيطة.", "أبرزها الماء والخضراوات وتقليل السكر."],
  sourceLine: "المصدر: أطباء التغذية",
});

describe("numbers written as words and points mode", () => {
  const falcons =
    "بيعت ثلاثة صقور بمبلغ 310 آلاف ريال في الليلة الـ19 من ليالي مزاد المركز الوطني للصقور 2026. " +
    "وعُرض فرخ شاهين اشترك في طرحه أربعة طواريح، وبيع بمبلغ 102 ألف ريال، واختُتمت الليلة بفرخ اشترك في طرحه ثمانية طواريح وبيع بمبلغ 106 آلاف ريال.";

  it("counts Arabic number words and thousands as story numbers", () => {
    const n = numbersFromStory(falcons);
    for (const v of ["3", "4", "8", "310000", "310,000", "102,000"]) expect(n.split(/\s/)).toContain(v);
    expect(numbersFromStory("يوم الثلاثاء")).not.toMatch(/\n3/);
    // Compound words and decimals never vouch for a wrong number.
    expect(numbersFromStory("شارك ثلاثة عشر متسابقًا").split(/\s/)).not.toContain("3");
    expect(numbersFromStory("شارك ثلاثة عشر متسابقًا").split(/\s/)).not.toContain("10");
    expect(numbersFromStory("خمسة وعشرون طالبًا وثلاثة آلاف زائر").split(/\s/)).not.toContain("5");
    const dec = numbersFromStory("بلغت القيمة 8.5 ألف ريال").split(/\s/);
    expect(dec).toContain("8,500");
    expect(dec).not.toContain("5000");
  });

  it("accepts the falcon story's figures, including those written as words", () => {
    const p = {
      ...plan(),
      headline: "3 صقور بـ310 آلاف ريال",
      titleLines: ["3 صقور", "في ليلة واحدة"],
      highlight: "3 صقور",
      hero: { value: "310", unit: "ألف ريال", caption: "قيمة الصقور الثلاثة" },
      figures: [
        { value: "102", label: "ألف ريال" },
        { value: "106", label: "ألف ريال" },
        { value: "8", label: "طواريح" },
      ],
      body: ["بيعت 3 صقور بمبلغ 310,000 ريال.", "واشترك 4 طواريح في طرح أحدها."],
    };
    expect(checkBrief(p, falcons).problems).toEqual([]);
  });

  it("validates points mode and its numbers", () => {
    expect(checkBrief(pointsPlan(), tips).problems).toEqual([]);
    const bad = pointsPlan();
    bad.points[0] = { title: "8 أكواب", text: "يوميًا" };
    expect(checkBrief(bad, tips).problems.join()).toMatch(/8 أكواب/);
    expect(checkBrief({ ...pointsPlan(), points: pointsPlan().points.slice(0, 2) }, tips).problems.join()).toMatch(/points mode/);
  });

  it("salvage falls back to points and keeps verified sentences", () => {
    const p = checkBrief({ ...pointsPlan(), mode: "figures", hero: { value: "99", unit: "", caption: "x" }, body: ["جملة صحيحة. وجملة فيها 77 رقمًا."] }, tips).brief!;
    const s = salvageBrief(p, tips)!;
    expect(s.mode).toBe("points");
    expect(s.hero).toBeNull();
    expect(s.body).toEqual(["جملة صحيحة."]);
  });

  it("builds a points canvas without a hero number", () => {
    const p = checkBrief(pointsPlan(), tips).brief!;
    const v = buildVerticalHtml(p, assets);
    expect(v.match(/data-qa="point"/g)).toHaveLength(4);
    expect(v).not.toContain('data-qa="hero"');
    expect(v).toContain(">01<");
    expect(buildWideHtml(p, assets)).not.toContain('data-qa="hero"');
    expect(heroPrompt(p, "vertical")).toMatch(/60%/);
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
