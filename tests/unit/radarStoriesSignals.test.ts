import { describe, expect, it } from "vitest";
import { computeMomentumScore } from "../../server/services/radar/momentumMath";
import { scoreSaudiRelevance } from "../../server/services/radar/relevanceScore";
import { keywordContainment, topicFingerprintFor } from "../../server/services/radar/textNormalize";
import { isGapV2Enabled } from "../../server/services/radar/flags";

describe("topicFingerprint / containment — قبول تكرار إيران", () => {
  it("يدمج عناوين متقاربة لنفس الحدث", () => {
    const a = "الجيش الأمريكي يشن غارات على إيران لليوم السادس";
    const b = "الجيش الأمريكي يشن جولة جديدة من الضربات على إيران";
    const c = "City council approves parking fees in Ohio";
    expect(keywordContainment(a, b)).toBeGreaterThanOrEqual(0.5);
    expect(keywordContainment(a, c)).toBeLessThan(0.3);
    expect(topicFingerprintFor(a).length).toBeGreaterThan(0);
  });
});

describe("computeMomentumScore", () => {
  it("يعطي زخماً عالياً لمصادر متعددة وذكر كثيف", () => {
    const { momentumScore, acceleration } = computeMomentumScore({
      sourceCount: 4,
      mentionsLastHour: 12,
      mentionsPrevHour: 3,
      xEngagement: 8000,
      hoursSinceLastMention: 0.5,
    });
    expect(momentumScore).toBeGreaterThanOrEqual(70);
    expect(acceleration).toBe(9);
  });

  it("يهبط مع الاحتضار بعد 48 ساعة", () => {
    const hot = computeMomentumScore({
      sourceCount: 4,
      mentionsLastHour: 10,
      mentionsPrevHour: 10,
      xEngagement: 1000,
      hoursSinceLastMention: 1,
    });
    const cold = computeMomentumScore({
      sourceCount: 4,
      mentionsLastHour: 0,
      mentionsPrevHour: 0,
      xEngagement: 1000,
      hoursSinceLastMention: 72,
    });
    expect(cold.momentumScore).toBeLessThan(hot.momentumScore);
  });
});

describe("scoreSaudiRelevance", () => {
  it("يرفع السعودية ويخفض الأجنبي الضيق", () => {
    expect(scoreSaudiRelevance({ title: "الهلال يتعاقد مع لاعب جديد" }).score).toBeGreaterThanOrEqual(40);
    expect(
      scoreSaudiRelevance({ title: "City council approves new parking fees in Ohio" }).score
    ).toBeLessThanOrEqual(20);
    expect(
      scoreSaudiRelevance({
        title: "US strikes Iran for sixth day",
        body: "Tehran and Hormuz",
        inSaudiTrend: true,
      }).score
    ).toBeGreaterThanOrEqual(30);
  });
});

describe("gap v2 flag", () => {
  it("مطفأ افتراضياً", () => {
    const prev = process.env.RADAR_GAP_V2_ENABLED;
    delete process.env.RADAR_GAP_V2_ENABLED;
    expect(isGapV2Enabled()).toBe(false);
    process.env.RADAR_GAP_V2_ENABLED = "true";
    expect(isGapV2Enabled()).toBe(true);
    if (prev === undefined) delete process.env.RADAR_GAP_V2_ENABLED;
    else process.env.RADAR_GAP_V2_ENABLED = prev;
  });
});

/** عقد v2: وحدة الفجوة = storyId لا radarItemId — قبول حالة إيران */
function gapUnitKeys(
  items: Array<{ id: string; storyId: string | null }>,
  v2: boolean
): string[] {
  if (!v2) return items.map((i) => i.id);
  return [...new Set(items.map((i) => i.storyId).filter((id): id is string => !!id))];
}

describe("قبول إيران — فجوة/تغطية واحدة لا بطاقتان", () => {
  // بعد الترجمة/التجميع تتشارك المادتان storyId — عناوين عربية متقاربة كمثال سقوط الكلمات
  const hill = {
    id: "item-hill",
    storyId: "story-iran-us",
    title: "الجيش الأمريكي يشن غارات على إيران لليوم السادس",
  };
  const aljazeera = {
    id: "item-aj",
    storyId: "story-iran-us",
    title: "الجيش الأمريكي يشن جولة جديدة من الضربات على إيران",
  };
  const unrelated = {
    id: "item-ohio",
    storyId: "story-ohio",
    title: "مجلس المدينة يقر رسوم مواقف في أوهايو",
  };

  it("v1 ينتج بطاقتين لنفس الحدث؛ v2 بطاقة واحدة", () => {
    const iranItems = [hill, aljazeera];
    expect(gapUnitKeys(iranItems, false)).toHaveLength(2);
    expect(gapUnitKeys(iranItems, true)).toEqual(["story-iran-us"]);
  });

  it("تقاطع كلمات كافٍ لربط عناوين إيران عبر المصادر", () => {
    expect(keywordContainment(hill.title, aljazeera.title)).toBeGreaterThanOrEqual(0.5);
    expect(keywordContainment(hill.title, unrelated.title)).toBeLessThan(0.3);
  });

  it("مواد نفس القصة لا تُنتج مفاتيح فجوة متعددة", () => {
    const keys = gapUnitKeys([hill, aljazeera, unrelated], true);
    expect(keys.filter((k) => k === "story-iran-us")).toHaveLength(1);
    expect(keys).toHaveLength(2);
  });
});
