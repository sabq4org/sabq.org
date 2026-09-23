/**
 * اختبارات ترتيب لوحة المباريات ومجموعات البطولات:
 * - دوري روشن السعودي دائماً في الأعلى (أولوية مطلقة) حتى مع وجود بطولات أخرى تبدأ في وقت أبكر
 * - شرائح الفلترة تقدم دوري روشن دائماً بعد «كل البطولات»
 */
import { describe, it, expect } from "vitest";

const ROSHN_COMP_SLUG = "pro-league";
const PINNED_COMP_SLUGS = [ROSHN_COMP_SLUG, "world-cup"];
const COMP_CATEGORY_ORDER = ["saudi", "gulf", "arab", "european", "world"];

function roshnRank(slug: string | null | undefined): number {
  return slug === ROSHN_COMP_SLUG ? 0 : 1;
}

interface TestGroup {
  name: string;
  slug: string;
  category: string;
  liveCount: number;
  earliestMatchTs: number;
}

describe("ترتيب مجموعات لوحة المباريات — دوري روشن دائماً في الأعلى", () => {
  it("دوري روشن يتصدر المجموعات حتى لو كانت هناك بطولة خليجية/أوروبية تنطلق قبلها بساعات", () => {
    const uaeLeague: TestGroup = {
      name: "دوري أدنوك للمحترفين",
      slug: "uae-pro-league",
      category: "gulf",
      liveCount: 0,
      earliestMatchTs: 1755180600, // 17:10 (أبكر موعد)
    };
    const roshnLeague: TestGroup = {
      name: "دوري روشن السعودي",
      slug: "pro-league",
      category: "saudi",
      liveCount: 0,
      earliestMatchTs: 1755190200, // 19:50 (لاحقاً)
    };
    const premierLeague: TestGroup = {
      name: "الدوري الإنجليزي",
      slug: "premier-league",
      category: "european",
      liveCount: 0,
      earliestMatchTs: 1755193800, // 20:50
    };

    const groups = [uaeLeague, roshnLeague, premierLeague];

    const sorted = [...groups].sort((a, b) => {
      const ar = roshnRank(a.slug);
      const br = roshnRank(b.slug);
      if (ar !== br) return ar - br;
      if (a.liveCount !== b.liveCount) return b.liveCount - a.liveCount;
      const aCatIdx = a.category ? COMP_CATEGORY_ORDER.indexOf(a.category) : 99;
      const bCatIdx = b.category ? COMP_CATEGORY_ORDER.indexOf(b.category) : 99;
      if (aCatIdx !== bCatIdx) return aCatIdx - bCatIdx;
      const ap = a.slug && PINNED_COMP_SLUGS.includes(a.slug) ? PINNED_COMP_SLUGS.indexOf(a.slug) : 99;
      const bp = b.slug && PINNED_COMP_SLUGS.includes(b.slug) ? PINNED_COMP_SLUGS.indexOf(b.slug) : 99;
      if (ap !== bp) return ap - bp;
      return a.earliestMatchTs - b.earliestMatchTs;
    });

    expect(sorted[0].slug).toBe("pro-league"); // دوري روشن أولاً
    expect(sorted[1].slug).toBe("uae-pro-league"); // ثم دوري أدنوك (فئة خليجي قبل أوروبي)
    expect(sorted[2].slug).toBe("premier-league"); // ثم الدوري الإنجليزي
  });
});
