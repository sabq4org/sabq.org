/**
 * تفضيلات تنبيهات المباريات (المرحلة 3ب — الشخصنة).
 *
 * صفّ واحد لكل مستخدم في sports_alert_prefs يحدّد أيّ أنواع أحداث المباراة تصله
 * دفعيًّا (انطلاق/أهداف/بطاقات/فار/نهاية). تُطبَّق على كل الفِرق التي يتابعها
 * (sportsFollows) — تفضيلات «عامّة» لا لكل مباراة.
 *
 * مبدأ التوافق الرجعي: غياب صفّ المستخدم = «كل الأنواع مفعّلة». هكذا يستمر
 * المتابعون السابقون (قبل وجود هذا الجدول) في تلقّي إشعارات الهدف/الانطلاق/النهاية
 * كما كان، ولا يُكتَم أحد إلا إذا أطفأ نوعًا صراحةً.
 *
 * مفصول عن الراوتر التزامًا بـ ADR-001 (الراوتر لا يستورد db).
 */
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { sportsAlertPrefs, type SportsAlertPref } from "@shared/schema";

/**
 * مفاتيح أنواع الأحداث القابلة للتفعيل/الكتم. أحداث المباراة تُطبَّق على الفِرق
 * المتابَعة؛ مفاتيح الانتقالات (transfersSaudi/transfersGlobal) بثّ عام لمن فعّلها.
 */
export type SportsAlertEventKey =
  | "kickoff"
  | "goals"
  | "cards"
  | "varReview"
  | "fulltime"
  | "transfersSaudi"
  | "transfersGlobal";

export interface SportsAlertPrefsView {
  kickoff: boolean;
  goals: boolean;
  cards: boolean;
  varReview: boolean;
  fulltime: boolean;
  transfersSaudi: boolean;
  transfersGlobal: boolean;
}

/**
 * الافتراضي عند غياب صفّ المستخدم. أحداث المباراة كلها مفعّلة (توافق رجعي).
 * الانتقالات السعودية مفعّلة (opt-out — «خاصة السعودية»)، والعالمية مطفأة
 * (opt-in لتقليل ضجيج البثّ العام) — مطابقًا لافتراضات أعمدة المخطط.
 */
export const DEFAULT_SPORTS_ALERT_PREFS: SportsAlertPrefsView = {
  kickoff: true,
  goals: true,
  cards: true,
  varReview: true,
  fulltime: true,
  transfersSaudi: true,
  transfersGlobal: false,
};

function toView(row: SportsAlertPref): SportsAlertPrefsView {
  return {
    kickoff: row.kickoff,
    goals: row.goals,
    cards: row.cards,
    varReview: row.varReview,
    fulltime: row.fulltime,
    transfersSaudi: row.transfersSaudi,
    transfersGlobal: row.transfersGlobal,
  };
}

/** تفضيلات مستخدم واحد (الافتراضي «الكل مفعّل» إن لم يكن له صفّ). */
export async function getPrefs(userId: string): Promise<SportsAlertPrefsView> {
  try {
    const [row] = await db
      .select()
      .from(sportsAlertPrefs)
      .where(inArray(sportsAlertPrefs.userId, [userId]))
      .limit(1);
    return row ? toView(row) : { ...DEFAULT_SPORTS_ALERT_PREFS };
  } catch (err) {
    // جدول غير مُنشأ (قبل db:push) أو خطأ DB عابر → الافتراضي الآمن «الكل مفعّل».
    console.error("[SportsAlertPrefs] getPrefs failed, using defaults:", err);
    return { ...DEFAULT_SPORTS_ALERT_PREFS };
  }
}

/** حفظ/تحديث التفضيلات (upsert). القيم الناقصة تُكمَّل من الافتراضي/الموجود. */
export async function upsertPrefs(
  userId: string,
  patch: Partial<SportsAlertPrefsView>,
): Promise<SportsAlertPrefsView> {
  const current = await getPrefs(userId);
  const merged: SportsAlertPrefsView = { ...current, ...patch };
  await db
    .insert(sportsAlertPrefs)
    .values({ userId, ...merged, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: sportsAlertPrefs.userId,
      set: { ...merged, updatedAt: new Date() },
    });
  return merged;
}

/**
 * يُرشّح قائمة مستخدمين بحسب تفعيلهم لنوع حدث معيّن. المستخدم بلا صفّ يُعدّ
 * «مفعِّلًا» (افتراضي الكل). يستخدمه جوب التنبيهات لتوجيه كل حدث لمن يريده فقط.
 */
export async function filterUsersByEventPref(
  userIds: string[],
  key: SportsAlertEventKey,
): Promise<string[]> {
  if (userIds.length === 0) return [];
  let rows: SportsAlertPref[];
  try {
    rows = await db
      .select()
      .from(sportsAlertPrefs)
      .where(inArray(sportsAlertPrefs.userId, userIds));
  } catch (err) {
    // جدول غير مُنشأ (قبل db:push) أو خطأ DB عابر → لا نُسقط الدورة: نعتبر الجميع
    // مفعِّلين (الافتراضي الآمن) فيستمر التوصيل بدل ضياع كل تنبيهات الدورة.
    console.error("[SportsAlertPrefs] filter failed, treating all as enabled:", err);
    return userIds;
  }
  // خريطة: من له صفّ صريح فقط؛ الباقي يأخذ افتراض هذا المفتاح. مهم للانتقالات
  // العالمية (افتراضها مطفأ): بلا هذا يُبثّ لكل من لا صفّ له بالخطأ.
  const explicit = new Map<string, boolean>();
  for (const r of rows) explicit.set(r.userId, toView(r)[key]);
  const fallback = DEFAULT_SPORTS_ALERT_PREFS[key];
  return userIds.filter((id) => explicit.get(id) ?? fallback);
}
