// اختبارات منطق مزامنة المباريات → مسابقات (fixtureSyncLogic النقي).

import { describe, expect, it } from "vitest";
import {
  decideSyncAction,
  SYNC_HORIZON_MS,
  type ContestSnapshot,
  type NormalizedFixture,
} from "../../server/services/predictions/fixtureSyncLogic";

const NOW = new Date("2026-08-01T12:00:00Z");
const KICKOFF = new Date("2026-08-03T18:00:00Z");

function fixture(overrides: Partial<NormalizedFixture> = {}): NormalizedFixture {
  return {
    externalRef: "12345",
    kickoff: KICKOFF,
    statusCode: "NS",
    live: false,
    finished: false,
    homeName: "الاتحاد",
    awayName: "النصر",
    homeLogo: null,
    awayLogo: null,
    round: "الجولة 1",
    venue: null,
    goalsHome: null,
    goalsAway: null,
    penaltiesHome: null,
    penaltiesAway: null,
    ...overrides,
  };
}

function contest(overrides: Partial<ContestSnapshot> = {}): ContestSnapshot {
  return {
    id: "contest-1",
    status: "open",
    locksAt: KICKOFF,
    resultVersion: 0,
    ...overrides,
  };
}

describe("الإنشاء", () => {
  it("ينشئ مسابقة لمباراة قادمة داخل الأفق", () => {
    expect(decideSyncAction(fixture(), null, NOW)).toEqual({ kind: "create" });
  });

  it("لا ينشئ لمباراة أبعد من الأفق", () => {
    const far = new Date(NOW.getTime() + SYNC_HORIZON_MS + 3_600_000);
    expect(decideSyncAction(fixture({ kickoff: far }), null, NOW).kind).toBe("none");
  });

  it("لا ينشئ لمباراة بدأت أو انتهت أو بلا فريقين (TBD في الكؤوس)", () => {
    expect(decideSyncAction(fixture({ live: true, statusCode: "1H" }), null, NOW).kind).toBe("none");
    expect(
      decideSyncAction(
        fixture({ finished: true, statusCode: "FT", goalsHome: 2, goalsAway: 1 }),
        null,
        NOW,
      ).kind,
    ).toBe("none");
    expect(decideSyncAction(fixture({ awayName: null }), null, NOW).kind).toBe("none");
    expect(decideSyncAction(fixture({ kickoff: new Date(NOW.getTime() - 1000) }), null, NOW).kind).toBe("none");
  });

  it("لا ينشئ لمباراة ملغاة", () => {
    expect(decideSyncAction(fixture({ statusCode: "CANC" }), null, NOW).kind).toBe("none");
  });
});

describe("تثبيت النتيجة", () => {
  it("يثبت نتيجة FT على مسابقة مقفلة لم تُثبت نتيجتها", () => {
    const action = decideSyncAction(
      fixture({ statusCode: "FT", finished: true, goalsHome: 2, goalsAway: 1 }),
      contest({ status: "locked" }),
      NOW,
    );
    expect(action).toEqual({ kind: "set_result", finalHome: 2, finalAway: 1 });
  });

  it("يقبل AET وPEN كنتيجة نهائية", () => {
    for (const statusCode of ["AET", "PEN"]) {
      const action = decideSyncAction(
        fixture({ statusCode, finished: true, goalsHome: 1, goalsAway: 1 }),
        contest({ status: "locked" }),
        NOW,
      );
      expect(action.kind).toBe("set_result");
    }
  });

  it("لا يثبت النتيجة مرتين (resultVersion > 0) ولا على ready/settled", () => {
    const fin = fixture({ statusCode: "FT", finished: true, goalsHome: 2, goalsAway: 1 });
    expect(decideSyncAction(fin, contest({ status: "locked", resultVersion: 1 }), NOW).kind).toBe("none");
    expect(decideSyncAction(fin, contest({ status: "ready", resultVersion: 1 }), NOW).kind).toBe("none");
    expect(decideSyncAction(fin, contest({ status: "settled", resultVersion: 1 }), NOW).kind).toBe("none");
  });

  it("لا يثبت نتيجة بلا أهداف حتى لو انتهت المباراة", () => {
    const action = decideSyncAction(
      fixture({ statusCode: "FT", finished: true }),
      contest({ status: "locked" }),
      NOW,
    );
    expect(action.kind).toBe("none");
  });
});

describe("الإلغاء والتأجيل", () => {
  it("WO/AWD تلغي المسابقة ولا تُسوّى كنتيجة ملعب", () => {
    for (const statusCode of ["CANC", "ABD", "WO", "AWD"]) {
      const action = decideSyncAction(
        fixture({ statusCode, finished: statusCode !== "CANC", goalsHome: 3, goalsAway: 0 }),
        contest({ status: "locked" }),
        NOW,
      );
      expect(action.kind).toBe("void");
    }
  });

  it("المسوّاة لا تُلغى — التصحيح مسار إداري", () => {
    expect(
      decideSyncAction(fixture({ statusCode: "CANC" }), contest({ status: "settled" }), NOW).kind,
    ).toBe("none");
  });

  it("تغيير موعد المباراة يعيد جدولة القفل قبل البداية فقط", () => {
    const newKickoff = new Date(KICKOFF.getTime() + 24 * 3_600_000);
    const action = decideSyncAction(fixture({ kickoff: newKickoff }), contest({ status: "open" }), NOW);
    expect(action).toEqual({ kind: "reschedule", locksAt: newKickoff });

    // فرق أقل من دقيقة = ضجيج مزود
    const jitter = new Date(KICKOFF.getTime() + 30_000);
    expect(decideSyncAction(fixture({ kickoff: jitter }), contest({ status: "open" }), NOW).kind).toBe("none");

    // بعد البداية لا إعادة جدولة
    expect(
      decideSyncAction(
        fixture({ kickoff: newKickoff, live: true, statusCode: "1H" }),
        contest({ status: "open" }),
        NOW,
      ).kind,
    ).toBe("none");
  });
});

describe("إعادة فتح المؤجلة بعد قفلها على الموعد القديم", () => {
  // حالة الجولة 13 من روشن: قُفلت على 5–7 نوفمبر (PST على الموعد القديم)،
  // ثم أعلن المزود موعدًا جديدًا 27–28 نوفمبر بحالة NS.
  const OLD = new Date("2026-11-05T13:25:00Z");
  const NOW_LATE = new Date("2026-11-26T19:00:00Z");
  const NEW_KICKOFF = new Date("2026-11-27T12:15:00Z");

  it("يعيد فتح مسابقة مقفلة حين يُعلن موعد جديد مؤكد", () => {
    expect(
      decideSyncAction(
        fixture({ kickoff: NEW_KICKOFF, statusCode: "NS" }),
        contest({ status: "locked", locksAt: OLD }),
        NOW_LATE,
      ),
    ).toEqual({ kind: "reopen", locksAt: NEW_KICKOFF });
  });

  it("لا يعيد الفتح والمباراة ما زالت PST (الموعد غير مؤكد)", () => {
    expect(
      decideSyncAction(
        fixture({ kickoff: NEW_KICKOFF, statusCode: "PST" }),
        contest({ status: "locked", locksAt: OLD }),
        NOW_LATE,
      ).kind,
    ).toBe("none");
  });

  it("لا يعيد الفتح لتأخير دقائق في ضربة البداية", () => {
    const delayed = new Date(KICKOFF.getTime() + 20 * 60_000);
    const justAfterKickoff = new Date(KICKOFF.getTime() + 60_000);
    expect(
      decideSyncAction(
        fixture({ kickoff: delayed }),
        contest({ status: "locked", locksAt: KICKOFF }),
        justAfterKickoff,
      ).kind,
    ).toBe("none");
  });

  it("لا يعيد الفتح إذا بدأت المباراة أو اقترب موعدها الجديد جدًا", () => {
    expect(
      decideSyncAction(
        fixture({ kickoff: NEW_KICKOFF, live: true, statusCode: "1H" }),
        contest({ status: "locked", locksAt: OLD }),
        NOW_LATE,
      ).kind,
    ).toBe("none");
    const fiveMinBefore = new Date(NEW_KICKOFF.getTime() - 5 * 60_000);
    expect(
      decideSyncAction(
        fixture({ kickoff: NEW_KICKOFF }),
        contest({ status: "locked", locksAt: OLD }),
        fiveMinBefore,
      ).kind,
    ).toBe("none");
  });

  it("لا يمس مسابقة ثبتت نتيجتها أو جاهزة أو مسوّاة", () => {
    for (const c of [
      contest({ status: "locked", locksAt: OLD, resultVersion: 1 }),
      contest({ status: "ready", locksAt: OLD, resultVersion: 1 }),
      contest({ status: "settled", locksAt: OLD, resultVersion: 1 }),
    ]) {
      expect(decideSyncAction(fixture({ kickoff: NEW_KICKOFF }), c, NOW_LATE).kind).toBe("none");
    }
  });
});
