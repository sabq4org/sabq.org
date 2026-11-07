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
  buildDesignedHtml,
  buildVerticalHtml,
  buildWideHtml,
  ensureContrast,
  escapeHtml,
  splitFigureValue,
  stretchWord,
  titleLineHtml,
  verticalPhotoHeight,
  WIDE_PHOTO_WIDTH,
  withSafeColours,
  wordsToStretch,
} from "../../server/services/infographicStudio/templates";
import { designContractProblems, parseDesign, sanitizeDesignCss, sanitizeDesignHtml } from "../../server/services/infographicStudio/designer";
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
    const p = checkBrief({ ...plan(), figures: [{ value: "4,000", label: "مشروع" }, { value: "113", label: "دولة" }, { value: "999", label: "رقم" }] }, source).brief!;
    expect(salvageBrief(p, source)?.figures.map((f) => f.value)).toEqual(["4,000", "113"]);
    const q = checkBrief({ ...plan(), figures: [{ value: "4,000", label: "مشروع" }, { value: "999", label: "رقم" }] }, source).brief!;
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
  });
});

describe("templates", () => {
  it("escapes model text and wraps the highlight", () => {
    expect(escapeHtml(`<script>"x"</script>`)).toBe("&lt;script&gt;&quot;x&quot;&lt;/script&gt;");
    expect(titleLineHtml("في 175 دولة", "175 دولة")).toBe('في <span class="hl">175 دولـــة</span>');
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

  it("asks for one centred square photo that fades into the wash", () => {
    const p = checkBrief(plan(), source).brief!;
    expect(heroPrompt(p)).toMatch(/Square frame/);
    expect(heroPrompt(p)).toContain(p.wash);
    expect(heroPrompt(p)).toMatch(/No text/);
  });

  it("stretches title words with house kashida where the letters join", () => {
    expect(stretchWord("الحوار")).toBe("الحـــوار");
    expect(stretchWord("الصقور")).toBe("الصقـــور");
    expect(stretchWord("ليلة")).toBe("ليـــلة");
    expect(stretchWord("بيوتهم")).toBe("بيـــوتهم"); // middle of the word, as the guide asks
    expect(stretchWord("ريال")).toBe("ريـــال");
    expect(stretchWord("آلاف")).toBe("آلاف"); // never inside lam-alef, never after the first letter
    expect(stretchWord("مزاد")).toBe("مزاد");
    expect(stretchWord("في")).toBe("في");
    expect(stretchWord("2026")).toBe("2026");
    expect(stretchWord("تفكّك")).toBe("تفـــكّك");
    expect(stretchWord("شدّة")).toBe("شدّة"); // too short once joins are counted
    expect(stretchWord("محمّدية")).toContain("ّ"); // the shadda stays on its letter
    expect(Array.from(wordsToStretch("ليلة مزاد الصقور الكبرى"))).toHaveLength(2);
  });

  it("splits a figure into a big number and a small unit", () => {
    expect(splitFigureValue("102 ألف ريال")).toEqual({ num: "102", unit: "ألف ريال" });
    expect(splitFigureValue("8.5%")).toEqual({ num: "8.5%", unit: "" });
    expect(splitFigureValue("4,000")).toEqual({ num: "4,000", unit: "" });
    expect(splitFigureValue("ثلاثة")).toEqual({ num: "ثلاثة", unit: "" });
  });

  it("keeps the photo in its own panel, never under the text", () => {
    const p = checkBrief(plan(), source).brief!;
    const v = buildVerticalHtml(p, assets);
    expect(v).toContain(`.photo{left:0;right:0;bottom:0;height:${verticalPhotoHeight(p)}px}`);
    expect(v).toMatch(/\.canvas\{[^}]*background:#[0-9A-F]{6}\}/i);
    expect(buildWideHtml(p, assets)).toContain(`width:${WIDE_PHOTO_WIDTH}px`);
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

describe("plan normalisation", () => {
  it("trims over-long layout fields instead of refusing the plan", () => {
    const raw = {
      ...plan(),
      kicker: "المركز الوطني للصقور ".repeat(5),
      titleLines: ["ليلة مزاد الصقور التاسعة عشرة في الرياض", "ثلاثة صقور", "سطر ثالث"],
      wash: "#fe9",
      theme: "warm",
    };
    const c = checkBrief(raw, source);
    expect(c.brief).not.toBeNull();
    expect(c.brief!.kicker.length).toBeLessThanOrEqual(48);
    expect(c.brief!.titleLines).toHaveLength(2);
    expect(c.brief!.titleLines[0].length).toBeLessThanOrEqual(26);
    expect(c.brief!.titleLines[0].endsWith(" ")).toBe(false);
    expect(c.brief!.wash).toBe("#FFEE99");
    expect(c.brief!.theme).toBe("light");
  });

  it("still refuses a number that is not in the story after trimming", () => {
    const c = checkBrief({ ...plan(), hero: { value: "999", unit: "", caption: "رقم مخترع" } }, source);
    expect(c.problems.join(" ")).toMatch(/999/);
  });
});

describe("art director step", () => {
  const sample = [
    "<concept>بطاقة مزاد</concept>",
    "<image_vertical>A falcon in the lower half</image_vertical>",
    "<image_wide>A falcon on the left</image_wide>",
    "<css_vertical>.ph{background:var(--photo) center/cover;background-image:url(https://x.test/a.png)}@import url(https://x.test/b.css);</css_vertical>",
    '<html_vertical><div class="ph"></div><div data-qa="logo">{{LOGO_WHITE}}</div><div data-zone="z"><div data-qa="title">ليلة</div></div><div data-qa="ai-label">{{AI_LABEL}}</div><span data-qa="source">المصدر</span><script>alert(1)</script><img src="https://x.test/c.png" onerror="alert(2)"><div onclick="x()">a</div></html_vertical>',
    "<css_wide>.ph{background:var(--photo)}</css_wide>",
    '<html_wide><div class="ph"></div><div data-qa="logo">{{LOGO_COLOR}}</div><div data-zone="z"><div data-qa="title">ليلة</div></div><div data-qa="ai-label">{{AI_LABEL}}</div></html_wide>',
  ].join("\n");

  it("parses the tagged answer and finds no contract problem in a complete design", () => {
    const d = parseDesign(sample)!;
    expect(d.concept).toBe("بطاقة مزاد");
    expect(designContractProblems(d)).toEqual([]);
  });

  it("strips scripts, handlers, images and remote URLs", () => {
    const d = parseDesign(sample)!;
    const html = sanitizeDesignHtml(d.htmlVertical);
    expect(html).not.toMatch(/script|alert|<img|onerror|onclick/);
    const css = sanitizeDesignCss(d.cssVertical);
    expect(css).not.toMatch(/x\.test|@import/);
    expect(css).toContain("var(--photo)");
  });

  it("reports a design that misses the logo, label or title", () => {
    const d = parseDesign(sample.replace("{{AI_LABEL}}", "").replace('data-qa="title">ليلة</div></div><div data-qa="ai-label">{{AI_LABEL}}</div></html_wide>', 'data-qa="x">ليلة</div></div></html_wide>'))!;
    const problems = designContractProblems(d).join(" ");
    expect(problems).toMatch(/vertical: \{\{AI_LABEL\}\}/);
    expect(problems).toMatch(/wide: the title/);
  });

  it("fills the logo and label inside the house shell", () => {
    const p = checkBrief(plan(), source).brief!;
    const d = parseDesign(sample)!;
    const html = buildDesignedHtml(p, assets, "wide", { css: sanitizeDesignCss(d.cssWide), html: sanitizeDesignHtml(d.htmlWide) });
    expect(html).toContain("صورة مولدة بالذكاء الاصطناعي");
    expect(html).not.toContain("{{");
    expect(html).toContain("width:1920px;height:1080px");
    // Only the nonce'd fitter may run; inline handlers are blocked by the page policy.
    const nonce = html.match(/script-src 'nonce-([^']+)'/)?.[1];
    expect(nonce).toBeTruthy();
    expect(html).toContain(`<script nonce="${nonce}">`);
  });

  it("strips handlers separated by a slash instead of a space", () => {
    expect(sanitizeDesignHtml('<details/open/ontoggle="window.probe=1">x</details>')).not.toMatch(/ontoggle|probe/);
    expect(sanitizeDesignHtml("<a/href='javascript:x'>y</a>")).not.toMatch(/href|javascript/);
  });

  it("refuses a Latin placeholder in the design text", () => {
    const c = checkBrief({ ...plan(), titleLines: ["ليلة مزاد", "بـ highlight ريال"] }, source);
    expect(c.problems.join(" ")).toMatch(/Arabic only/);
  });

  it("drops a Latin placeholder when salvaging the plan for the fixed template", () => {
    const p = { ...checkBrief(plan(), source).brief!, titleLines: ["ليلة مزاد", "بـ highlight ريال"], highlight: "highlight" };
    const s = salvageBrief(p, source)!;
    expect(s.titleLines).toEqual(["ليلة مزاد"]);
    expect(s.highlight).toBe("");
  });
});
