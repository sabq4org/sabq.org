// منطق مزامنة المباريات → مسابقات — نقي وقابل للاختبار (لا db ولا شبكة).
//
// القواعد مستمدة حرفيًا من سلوك المحركات القائمة:
// - القفل عند ضربة البداية (لا هامش قبلها)، مع حارس مزدوج: حالة المزود
//   live/finished تقفل حتى لو تأخر توقيته.
// - النتيجة النهائية القابلة للتسوية = FT/AET/PEN وأهداف غير فارغة.
//   AWD/WO (قرارات إدارية) لا تُسوّى كنتيجة ملعب — تُلغى المسابقة.
// - الإلغاء/الهجر (CANC/ABD/WO/AWD) = void. المؤجل (PST) = انتظار، قد
//   يُعاد جدولته فتُحدَّث locks_at.

export type NormalizedFixture = {
  /** String(fixture.id) لدى المصدر — يصبح external_ref للمسابقة. */
  externalRef: string;
  /** ضربة البداية UTC (من timestamp لا من date النصي). */
  kickoff: Date;
  statusCode: string;
  live: boolean;
  finished: boolean;
  homeName: string | null;
  awayName: string | null;
  homeLogo: string | null;
  awayLogo: string | null;
  round: string | null;
  venue: string | null;
  goalsHome: number | null;
  goalsAway: number | null;
  penaltiesHome: number | null;
  penaltiesAway: number | null;
};

export type ContestSnapshot = {
  id: string;
  status: string;
  locksAt: Date;
  resultVersion: number;
  metadata?: unknown;
  resultPayload?: unknown;
};

export type SyncAction =
  | { kind: "create" }
  | { kind: "reschedule"; locksAt: Date }
  | { kind: "set_result"; finalHome: number; finalAway: number }
  | { kind: "void" }
  | { kind: "none" };

export const SETTLEABLE_STATUSES = new Set(["FT", "AET", "PEN"]);
export const VOID_STATUSES = new Set(["CANC", "ABD", "WO", "AWD"]);

/** أفق الإنشاء: لا ننشئ مسابقات لمباريات أبعد من 14 يومًا. */
export const SYNC_HORIZON_MS = 14 * 24 * 3_600_000;

/** تجاهل فروق الجدولة تحت دقيقة — ضجيج مزود لا إعادة جدولة حقيقية. */
const RESCHEDULE_EPSILON_MS = 60_000;

export function hasSettleableScore(fixture: NormalizedFixture): boolean {
  return (
    SETTLEABLE_STATUSES.has(fixture.statusCode) &&
    fixture.goalsHome !== null &&
    fixture.goalsAway !== null
  );
}

export function decideSyncAction(
  fixture: NormalizedFixture,
  contest: ContestSnapshot | null,
  now: Date,
): SyncAction {
  if (!contest) {
    // إنشاء لمباراة قادمة فقط: فريقان معلومان (حارس TBD في أدوار الكؤوس)،
    // لم تبدأ، وداخل الأفق
    const upcoming =
      !fixture.live &&
      !fixture.finished &&
      !VOID_STATUSES.has(fixture.statusCode) &&
      fixture.kickoff.getTime() > now.getTime() &&
      fixture.kickoff.getTime() - now.getTime() <= SYNC_HORIZON_MS &&
      !!fixture.homeName &&
      !!fixture.awayName;
    return upcoming ? { kind: "create" } : { kind: "none" };
  }

  // المسوّاة والملغاة نهائية — لا يلمسها المحوّل (التصحيح مسار إداري)
  if (contest.status === "settled" || contest.status === "void") {
    return { kind: "none" };
  }

  if (VOID_STATUSES.has(fixture.statusCode)) {
    return { kind: "void" };
  }

  // النتيجة تُثبَّت مرة واحدة على مسابقة مقفلة — resultVersion يبقى 0 حتى
  // أول تثبيت، وready/التصحيح خارج مسؤولية المحوّل
  if (contest.status === "locked" && contest.resultVersion === 0 && hasSettleableScore(fixture)) {
    return { kind: "set_result", finalHome: fixture.goalsHome!, finalAway: fixture.goalsAway! };
  }

  // إعادة جدولة (تأجيل/تقديم): قبل بدء المباراة فقط
  if (
    (contest.status === "open" || contest.status === "draft") &&
    !fixture.live &&
    !fixture.finished &&
    Math.abs(fixture.kickoff.getTime() - contest.locksAt.getTime()) > RESCHEDULE_EPSILON_MS
  ) {
    return { kind: "reschedule", locksAt: fixture.kickoff };
  }

  return { kind: "none" };
}
