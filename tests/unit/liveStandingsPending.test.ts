/**
 * فجوة ما بعد الصافرة في «الترتيب اللحظي» (حادثة الحزم–أبها، افتتاح روشن
 * 2026-08-13): المزوّد يعيد احتساب جدوله الرسمي بتأخير، وكانت الطبقة اللحظية
 * تسقط المباراة فور انتهائها — فتختفي نتيجتها من الترتيب رغم ظهورها أثناء اللعب.
 * selectUnabsorbedFinished تلتقط المنتهية غير المستوعبة بفرق العدّاد (played
 * الرسمي مقابل المنتهية المحسوبة) فيستحيل الازدواج وتسقط تلقائيًّا فور اللحاق.
 */
import { describe, it, expect } from "vitest";
import {
  applyProvisionalTable,
  selectUnabsorbedFinished,
  type LiveFixtureLike,
  type StandingRowLike,
} from "../../server/services/liveStandings";

const NOW_MS = 1_800_000_000_000;
const HOURS = 60 * 60;

function row(id: number, rank: number, over: Partial<StandingRowLike> = {}): StandingRowLike {
  return {
    team: { id },
    rank,
    played: 0,
    win: 0,
    draw: 0,
    lose: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalsDiff: 0,
    points: 0,
    ...over,
  };
}

function fx(
  home: number,
  away: number,
  o: {
    gh?: number | null;
    ga?: number | null;
    live?: boolean;
    finished?: boolean;
    agoHours?: number;
    round?: string;
  } = {},
): LiveFixtureLike {
  return {
    home: { id: home },
    away: { id: away },
    goals: { home: o.gh ?? null, away: o.ga ?? null },
    status: { live: o.live ?? false, finished: o.finished ?? false },
    timestamp: NOW_MS / 1000 - (o.agoHours ?? 2) * HOURS,
    round: o.round ?? "الجولة 1",
  };
}

const table = () => [row(1, 1), row(2, 2), row(3, 3), row(4, 4)];

describe("selectUnabsorbedFinished — التقاط المنتهية غير المستوعبة", () => {
  it("سيناريو الحزم–أبها: منتهية 2-0 والجدول الرسمي لا يعدّها بعد → تُلتقط", () => {
    const finished = fx(1, 2, { gh: 2, ga: 0, finished: true });
    const picked = selectUnabsorbedFinished(table(), [finished], { nowMs: NOW_MS });
    expect(picked).toEqual([finished]);
  });

  it("استوعبها المزوّد (played يشملها) → لا التقاط، فلا ازدواج", () => {
    const rows = [
      row(1, 1, { played: 1, win: 1, goalsFor: 2, goalsDiff: 2, points: 3 }),
      row(2, 2, { played: 1, lose: 1, goalsAgainst: 2, goalsDiff: -2 }),
      row(3, 3),
      row(4, 4),
    ];
    const finished = fx(1, 2, { gh: 2, ga: 0, finished: true });
    expect(selectUnabsorbedFinished(rows, [finished], { nowMs: NOW_MS })).toEqual([]);
  });

  it("نقص فريق واحد فقط لا يُنسب للمباراة (يشترط ترشيح الفريقين معًا)", () => {
    // الفريق 1 played=1 (استُوعبت له) والفريق 2 played=0: تناقض لا يقع عند
    // الاستيعاب الطبيعي (يحدَّث الفريقان معًا) — لا نلتقط على إشارة فريق واحد.
    const rows = [row(1, 1, { played: 1, win: 1, points: 3 }), row(2, 2), row(3, 3), row(4, 4)];
    const finished = fx(1, 2, { gh: 2, ga: 0, finished: true });
    expect(selectUnabsorbedFinished(rows, [finished], { nowMs: NOW_MS })).toEqual([]);
  });

  it("النقص يُنسب للأحدث: القديمة المستوعبة لا تعود، والجديدة تُلتقط", () => {
    const oldOne = fx(1, 2, { gh: 1, ga: 0, finished: true, agoHours: 100 });
    const fresh = fx(1, 3, { gh: 2, ga: 2, finished: true, agoHours: 1 });
    // الفريق 1 خاض القديمة (مستوعبة) والحديثة (ليست بعد)، والفريق 3 حديثته
    // ناقصة أيضًا → تُلتقط الحديثة وحدها ولا تُمسّ القديمة.
    const rows = [
      row(1, 1, { played: 1, win: 1, points: 3 }),
      row(2, 2, { played: 1, lose: 1 }),
      row(3, 3),
      row(4, 4),
    ];
    expect(selectUnabsorbedFinished(rows, [oldOne, fresh], { nowMs: NOW_MS })).toEqual([fresh]);
    // وإن اكتمل عدّ الجميع (الحديثة استُوعبت أيضًا) فلا التقاط.
    const done = [
      row(1, 1, { played: 2, win: 1, draw: 1, points: 4 }),
      row(2, 2, { played: 1, lose: 1 }),
      row(3, 3, { played: 1, draw: 1, points: 1 }),
      row(4, 4),
    ];
    expect(selectUnabsorbedFinished(done, [oldOne, fresh], { nowMs: NOW_MS })).toEqual([]);
  });

  it("جولات لا تدخل الجدول (الملحق/الإقصائيات) تُستبعد بمرشِّح الجولة", () => {
    const playoff = fx(1, 2, { gh: 2, ga: 0, finished: true, round: "الملحق" });
    const picked = selectUnabsorbedFinished(table(), [playoff], {
      nowMs: NOW_MS,
      isCountedRound: (r) => !!r && /^الجولة \d+$/.test(r),
    });
    expect(picked).toEqual([]);
  });

  it("خارج نافذة الحداثة (12 ساعة) لا تُلتقط — الرسمي يعود مرجعًا وحيدًا", () => {
    const stale = fx(1, 2, { gh: 2, ga: 0, finished: true, agoHours: 20 });
    expect(selectUnabsorbedFinished(table(), [stale], { nowMs: NOW_MS })).toEqual([]);
  });

  it("منتهية بلا أهداف مسجّلة (محسومة إداريًّا) لا تُطبَّق", () => {
    const walkover = fx(1, 2, { gh: null, ga: null, finished: true });
    expect(selectUnabsorbedFinished(table(), [walkover], { nowMs: NOW_MS })).toEqual([]);
  });
});

describe("applyProvisionalTable — الجارية والمنتهية المعلّقة معًا", () => {
  it("المعلّقة تُحسب بلا شارة مباشر، والجارية تحمل الشارة", () => {
    const inPlay = fx(3, 4, { gh: 0, ga: 0, live: true });
    const finished = fx(1, 2, { gh: 2, ga: 0, finished: true });
    const out = applyProvisionalTable(table(), [inPlay, finished], [finished]);
    const byId = new Map(out.map((r) => [r.team.id, r]));
    // الفائز المنتهي: 3 نقاط بلا live — يتصدّر.
    expect(byId.get(1)).toMatchObject({ played: 1, win: 1, points: 3, rank: 1 });
    expect(byId.get(1)?.live).toBeUndefined();
    expect(byId.get(2)).toMatchObject({ played: 1, lose: 1, points: 0 });
    // الجاريتان 0-0: نقطة تعادل مبدئية مع شارة live.
    expect(byId.get(3)).toMatchObject({ played: 1, draw: 1, points: 1, live: true });
    expect(byId.get(4)).toMatchObject({ played: 1, draw: 1, points: 1, live: true });
  });

  it("بلا جارية ولا معلّقة يعيد الصفوف الأصلية نفسها (لا فرز بلا داعٍ)", () => {
    const rows = table();
    expect(applyProvisionalTable(rows, [fx(1, 2, { finished: true })])).toBe(rows);
  });

  it("قائمة موحّدة: المباراة المنتهية داخل liveFixtures لا تُطبَّق إلا كمعلّقة", () => {
    // نفس كائن المباراة يمرّر في القائمتين (النمط الموحّد في المسارات):
    // فلتر الجارية يسقطه (finished) وفلتر المعلّقة يحسبه — مرة واحدة فقط.
    const finished = fx(1, 2, { gh: 2, ga: 0, finished: true });
    const out = applyProvisionalTable(table(), [finished], [finished]);
    const winner = out.find((r) => r.team.id === 1)!;
    expect(winner).toMatchObject({ played: 1, win: 1, points: 3 });
  });
});
