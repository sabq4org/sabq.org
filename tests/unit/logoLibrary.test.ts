import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/services/mediaLibraryService", () => ({ saveExistingMedia: vi.fn() }));

import { buildLogoIndex, logoDisplayName, rankLogosForArticle } from "../../server/services/logoLibraryService";
import { normalizeArabicForSearch } from "../../shared/logoSearch";

let n = 0;
const row = (title: string) =>
  ({
    id: `id-${++n}`,
    displayId: n,
    title,
    pngUrl: `https://media.sabq.org/logos/${n}/png.png`,
    svgUrl: null,
    primaryUrl: `https://media.sabq.org/logos/${n}/png.png`,
    downloadCount: 10,
  }) as any;

const index = buildLogoIndex([
  row("شعار وزارة التعليم الجديد - SVG"),
  row("شعار شركة تطوير التعليم القابضة - SVG - PNG"),
  row("شعار جامعة فهد بن سلطان - SVG"),
  row("شعار صندوق الاستثمارات العامة الجديد - SVG"),
  row("شعار أرامكو - SVG"),
  row("شعار اليوم - SVG"),
  row("شعار نادي النصر السعودي بدقة عالية - SVG - PNG"),
  row("شعار جائزة الملك فيصل - SVG"),
  row("شعار هيئة الهلال الأحمر السعودي - SVG"),
  row("شعار وزارة الصحة السعودية - SVG"),
]);
const names = (title: string, content = "") => rankLogosForArticle(index, title, content, 10).map((l) => l.name);

describe("logoDisplayName", () => {
  it("strips the logo boilerplate and format words", () => {
    expect(logoDisplayName("شعار فلك القابضة بدقة عالية SVG - PNG")).toBe("فلك القابضة");
    expect(logoDisplayName("شعار وزارة التعليم الجديد - SVG")).toBe("وزارة التعليم");
    expect(logoDisplayName("شعار المركز السعودي للأعمال - Saudi Business Center Logo - PNG - SVG")).toBe("المركز السعودي للأعمال");
    expect(logoDisplayName("شعار SVG - MBC 4")).toBe("MBC 4");
  });
});

describe("normalizeArabicForSearch", () => {
  it("unifies hamza, taa marbuta and alif maqsura", () => {
    expect(normalizeArabicForSearch("القابضة إلى أمانة")).toBe("القابضه الي امانه");
  });
});

describe("rankLogosForArticle", () => {
  it("maps a minister mention to the ministry and ranks it above a descriptive phrase", () => {
    const result = names("نائب وزير التعليم: المعلم شريكنا الأساس في تطوير التعليم");
    expect(result[0]).toBe("وزارة التعليم");
    expect(result).toContain("شركة تطوير التعليم القابضة");
  });

  it("matches names glued to a conjunction", () => {
    expect(names("أرامكو وصندوق الاستثمارات العامة يوقعان اتفاقية")).toEqual(
      expect.arrayContaining(["أرامكو", "صندوق الاستثمارات العامة"]),
    );
    expect(names("لقاء بين وزارة الصحة ووزارة التعليم")).toEqual(expect.arrayContaining(["وزارة الصحة السعودية", "وزارة التعليم"]));
  });

  it("requires the entity-type word: a prince's name is not the university", () => {
    expect(names("أمير تبوك الأمير فهد بن سلطان يستقبل المهنئين")).not.toContain("جامعة فهد بن سلطان");
    expect(names("جامعة فهد بن سلطان تحتفل بخريجيها")).toContain("جامعة فهد بن سلطان");
  });

  it("does not assemble a name from words scattered across the article", () => {
    expect(names("الملك يستقبل الفائزين", "<p>أعلنت الجائزة النتائج.</p><p>حضر الأمير فيصل الحفل.</p>")).not.toContain(
      "جائزة الملك فيصل",
    );
  });

  it("ignores single-word names that are everyday words", () => {
    expect(names("طقس اليوم: أمطار على جدة", "<p>اليوم وغدًا أمطار. اليوم أيضًا رياح.</p>")).not.toContain("اليوم");
  });

  it("finds a multi-word name stated as a contiguous phrase in the body", () => {
    expect(names("فوز مهم في الديربي", "<p>حقق نادي النصر فوزًا على منافسه.</p>")).toContain("نادي النصر السعودي");
    expect(names("مبادرة رياضية", "<p>نظمت هيئة الهلال الأحمر بمنطقة الباحة مبادرة.</p>")).toContain("هيئة الهلال الأحمر السعودي");
  });

  it("returns nothing for unrelated news", () => {
    expect(names("الذهب يقفز مع تراجع الدولار", "<p>ارتفعت أسعار الذهب في التعاملات.</p>")).toEqual([]);
  });
});

describe("rankLogosForArticle — prefixed article words", () => {
  const idx = buildLogoIndex([row("شعار النيابة العامة - SVG"), row("شعار وزارة الداخلية - SVG")]);
  it("matches «للنيابة العامة» to النيابة العامة", () => {
    expect(rankLogosForArticle(idx, "شرطة الرياض تضبط امرأة وتحيلها للنيابة العامة", "", 5).map((l) => l.name)).toContain("النيابة العامة");
  });
});
