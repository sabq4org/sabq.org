/**
 * سلّم أهمية شريط البوابة الرياضية على الرئيسية.
 *
 * البيانات هنا منقولة من ردّ الإنتاج الفعلي يوم 2026-07-30 — وهو اليوم الذي كشف
 * الحاجة إلى بوابة الأسماء: مباريات اليوم التسع كلها تصفيات الدوري الأوروبي بين
 * أندية مجهولة للقارئ السعودي، و`europa-league` مدرجة أصلًا في البطولات الكبرى،
 * فالفلتر على مستوى البطولة وحده كان سيضع «بافوس × هايدوك سبليت» على الرئيسية.
 */
import { describe, it, expect } from "vitest";
import { pickHeadline, normalizeName } from "@/components/sports/sportsPortalHeadline";
import type { SpCompetition, SpLiveItem } from "@/pages/SportsHub";

// 2026-07-30T12:00:00Z — نفس لحظة الفحص، فالعدّادات في التوقّعات ثابتة.
const NOW = Date.parse("2026-07-30T12:00:00Z");

const team = (name: string) => ({ id: 1, name, logo: "", winner: null });

function fixture(over: {
  slug: string | null;
  home: string;
  away: string;
  live?: boolean;
  finished?: boolean;
  elapsed?: number | null;
  goals?: [number | null, number | null];
  ts?: number;
}): SpLiveItem {
  return {
    id: 1,
    date: "2026-07-30T18:00:00+00:00",
    timestamp: over.ts ?? Math.floor(NOW / 1000) + 3600,
    status: {
      code: over.live ? "1H" : "NS",
      label: over.live ? "الشوط الأول" : "لم تبدأ",
      elapsed: over.elapsed ?? null,
      extra: null,
      live: over.live ?? false,
      finished: over.finished ?? false,
    },
    round: "",
    venue: { name: "", city: "" },
    home: team(over.home),
    away: team(over.away),
    goals: { home: over.goals?.[0] ?? null, away: over.goals?.[1] ?? null },
    competition: over.slug ?? "",
    competitionSlug: over.slug,
  };
}

// مقتطف من /api/sports/competitions في الإنتاج (2026-07-30).
const COMPETITIONS: SpCompetition[] = [
  { slug: "pro-league", name: "دوري روشن السعودي", type: "league", hasStandings: true, hasScorers: true, hasStats: true, category: "saudi", status: "upcoming", start: "2026-08-13" },
  { slug: "division-1", name: "دوري يلو لأندية الدرجة الأولى", type: "league", hasStandings: true, hasScorers: true, hasStats: true, category: "saudi", status: "upcoming", start: "2026-08-21" },
  { slug: "kings-cup", name: "كأس خادم الحرمين الشريفين", type: "cup", hasStandings: false, hasScorers: true, hasStats: true, category: "saudi", status: "upcoming", start: "2026-08-16" },
  { slug: "afc-champions-league", name: "دوري أبطال آسيا للنخبة", type: "cup", hasStandings: true, hasScorers: true, hasStats: true, category: "world", status: "upcoming", start: "2026-08-11" },
  { slug: "champions-league", name: "دوري أبطال أوروبا", type: "cup", hasStandings: true, hasScorers: true, hasStats: true, category: "european", status: "ongoing", start: "2026-07-07" },
  { slug: "europa-league", name: "الدوري الأوروبي", type: "cup", hasStandings: true, hasScorers: true, hasStats: true, category: "european", status: "ongoing", start: "2026-07-09" },
  { slug: "egypt-premier-league", name: "الدوري المصري الممتاز", type: "league", hasStandings: true, hasScorers: true, hasStats: true, category: "arab", status: "finished", start: "2025-08-08" },
];

// مباريات اليوم الفعلية يوم 2026-07-30 — تصفيات الدوري الأوروبي كاملةً.
const REAL_TODAY = [
  fixture({ slug: "europa-league", home: "مكابي تل أبيب", away: "شيريف تيراسبول" }),
  fixture({ slug: "europa-league", home: "هرايدك كرالوفي", away: "ترومسو" }),
  fixture({ slug: "europa-league", home: "بافوس", away: "إتش إن كي هايدوك سبليت" }),
  fixture({ slug: "europa-league", home: "باوك سالونيك", away: "دينامو كييف" }),
  fixture({ slug: "europa-league", home: "أندرلخت", away: "هاماربي" }),
];

describe("pickHeadline — بوابة الأسماء", () => {
  it("لا يذكر أندية تصفيات الدوري الأوروبي، ويسقط إلى عدّاد روشن", () => {
    const h = pickHeadline(REAL_TODAY, COMPETITIONS, NOW);
    expect(h.match).toBeUndefined();
    expect(h.live).toBe(false);
    expect(h.text).toBe("دوري روشن السعودي ينطلق بعد 14 يومًا");
    // لا يظهر أي اسم من أسماء اليوم المجهولة في أي جزء من الشريط
    for (const name of ["بافوس", "هايدوك", "ترومسو", "شيريف", "هاماربي"]) {
      expect(`${h.text} ${h.tail}`).not.toContain(name);
    }
  });

  it("يستبعد الدوريات غير الكبرى أصلًا (المصري) ولو كان طرفاها معروفين", () => {
    const h = pickHeadline(
      [fixture({ slug: "egypt-premier-league", home: "الأهلي", away: "الزمالك", live: true, goals: [1, 0] })],
      COMPETITIONS,
      NOW,
    );
    expect(h.match).toBeUndefined();
  });
});

describe("pickHeadline — الدرجة الأولى: مباراة جارية", () => {
  it("يتصدّر بمباراة سعودية جارية بنتيجتها ودقيقتها", () => {
    const h = pickHeadline(
      [fixture({ slug: "pro-league", home: "الهلال", away: "النصر", live: true, elapsed: 67, goals: [2, 1] })],
      COMPETITIONS,
      NOW,
    );
    expect(h.live).toBe(true);
    expect(h.match?.home.name).toBe("الهلال");
    expect(h.match?.goals).toEqual({ home: 2, away: 1 });
    expect(h.tail).toContain("د67");
  });

  it("يقدّم السعودية على الأوروبية حين تجريان معًا", () => {
    const h = pickHeadline(
      [
        fixture({ slug: "champions-league", home: "ريال مدريد", away: "أرسنال", live: true, ts: 100, goals: [1, 1] }),
        fixture({ slug: "pro-league", home: "الاتحاد", away: "الأهلي", live: true, ts: 200, goals: [0, 0] }),
      ],
      COMPETITIONS,
      NOW,
    );
    expect(h.match?.home.name).toBe("الاتحاد");
  });

  it("يقبل مباراة أوروبية جارية إذا كان أحد طرفيها من العمالقة", () => {
    const h = pickHeadline(
      [fixture({ slug: "champions-league", home: "بودو غليمت", away: "مانشستر سيتي", live: true, elapsed: 12, goals: [0, 2] })],
      COMPETITIONS,
      NOW,
    );
    expect(h.live).toBe(true);
    expect(h.match?.away.name).toBe("مانشستر سيتي");
  });

  it("يعرف الأندية السعودية في أبطال آسيا رغم تصنيفها world لا saudi", () => {
    const h = pickHeadline(
      [fixture({ slug: "afc-champions-league", home: "الهلال", away: "السد", live: true, elapsed: 5, goals: [0, 0] })],
      COMPETITIONS,
      NOW,
    );
    expect(h.match?.home.name).toBe("الهلال");
  });
});

describe("pickHeadline — الدرجة الثانية: مباراة اليوم لم تبدأ", () => {
  it("يعرض الفريقين وموعد الانطلاق، والمضيف أولًا في التسلسل", () => {
    const h = pickHeadline(
      [fixture({ slug: "kings-cup", home: "الهلال", away: "الشباب", ts: Math.floor(NOW / 1000) + 7200 })],
      COMPETITIONS,
      NOW,
    );
    expect(h.live).toBe(false);
    expect(h.match?.home.name).toBe("الهلال");
    expect(h.tail).toContain("التشكيل المتوقّع");
  });

  it("يتجاهل المباريات المنتهية فلا يتصدّر الشريط بنتيجة قديمة", () => {
    const h = pickHeadline(
      [fixture({ slug: "pro-league", home: "الهلال", away: "النصر", finished: true, goals: [3, 0] })],
      COMPETITIONS,
      NOW,
    );
    expect(h.match).toBeUndefined();
    expect(h.text).toContain("دوري روشن");
  });
});

describe("pickHeadline — الدرجة الثالثة: العدّاد", () => {
  it("يقدّم روشن على أبطال آسيا رغم أن آسيا أقرب موعدًا", () => {
    // afc 08-11 قبل pro-league 08-13، والسعودية تسبق دائمًا
    const h = pickHeadline([], COMPETITIONS, NOW);
    expect(h.text).toBe("دوري روشن السعودي ينطلق بعد 14 يومًا");
  });

  it("لا يتصدّر بدوري يلو وهو خارج قائمة الكبرى", () => {
    const h = pickHeadline([], COMPETITIONS, NOW);
    expect(h.text).not.toContain("يلو");
  });

  it("يسقط إلى أقرب بطولة غير سعودية إن لم تبق سعودية قادمة", () => {
    const noSaudi = COMPETITIONS.filter((c) => (c.category ?? "saudi") !== "saudi");
    const h = pickHeadline([], noSaudi, NOW);
    expect(h.text).toBe("دوري أبطال آسيا للنخبة ينطلق بعد 12 يومًا");
  });

  it("يصرّف العدد عربيًا صحيحًا", () => {
    const one: SpCompetition[] = [{ ...COMPETITIONS[0], start: "2026-07-31" }];
    expect(pickHeadline([], one, NOW).text).toBe("دوري روشن السعودي ينطلق غدًا");
    const two: SpCompetition[] = [{ ...COMPETITIONS[0], start: "2026-08-01" }];
    expect(pickHeadline([], two, NOW).text).toBe("دوري روشن السعودي ينطلق بعد يومين");
    const five: SpCompetition[] = [{ ...COMPETITIONS[0], start: "2026-08-04" }];
    expect(pickHeadline([], five, NOW).text).toBe("دوري روشن السعودي ينطلق بعد 5 أيام");
    const today: SpCompetition[] = [{ ...COMPETITIONS[0], start: "2026-07-30" }];
    expect(pickHeadline([], today, NOW).text).toBe("دوري روشن السعودي ينطلق اليوم");
  });

  it("يتجاوز البطولات المنتهية موعدًا", () => {
    const past: SpCompetition[] = [{ ...COMPETITIONS[0], start: "2025-08-13" }];
    expect(pickHeadline([], past, NOW).text).toBe("1 بطولة في مكان واحد");
  });
});

describe("pickHeadline — الاحتياط", () => {
  it("لا يترك الشريط فارغًا قبل وصول أي بيانات", () => {
    const h = pickHeadline([], [], NOW);
    expect(h.text).toBe("كل البطولات في مكان واحد");
    expect(h.tail).toBe("نتائج مباشرة · ترتيب · توقّعات");
  });

  it("يذكر عدد البطولات حين لا يوجد عدّاد ولا مباراة", () => {
    const finished: SpCompetition[] = COMPETITIONS.map((c) => ({ ...c, start: "2020-01-01" }));
    expect(pickHeadline([], finished, NOW).text).toBe("7 بطولة في مكان واحد");
  });
});

describe("normalizeName", () => {
  it("يوحّد الهمزات والتاء المربوطة فتُطابق الأسماء بصيغتيها", () => {
    expect(normalizeName("الأهلي")).toBe("الاهلي");
    expect(normalizeName("القادسية")).toBe("القادسيه");
    expect(normalizeName("إنتر ميلان")).toBe("انتر ميلان");
    expect(normalizeName("  آرسنال  ")).toBe("ارسنال");
  });
});
