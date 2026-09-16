// ----------------------------------------------------------------------------
// النظام المركزي لأرقام البطاقات الصحفية (قرار المالك 2026-07-30)
//
//   • الصيغة SBQ-PR-0042 مشتقة من تسلسل الرقم الوظيفي SBQ-0042 —
//     رقم واحد للمنسوب في كل الأنظمة. من لا ملف منسوب له يُنشأ له ملف
//     مسودة أولاً كي يحصل على رقم وظيفي، فيبقى الربط ١:١ محفوظاً.
//   • الرقم دائم كرقم الهوية: يُولَّد مرة واحدة ولا يُعدَّل ولا يُفرَّغ.
//     إطفاء «تفعيل البطاقة الصحفية» يوقف الإصدار فقط ويُبقي الرقم لصاحبه،
//     فإعادة التفعيل تعيد الرقم نفسه.
//   • الكتابة إلى users.press_id_number (جسر بطاقة Wallet) وإلى
//     staff_profiles.press_id_number معاً في معاملة واحدة، تحت قفل
//     استشاري ضد التوليد المتوازي.
//
// كل نقاط الكتابة (لوحة المستخدمين، ملف المنسوب) تمر من هنا.
// ----------------------------------------------------------------------------

import { and, eq, like, ne, or, sql } from "drizzle-orm";
import { db } from "../db";
import { staffProfiles, users } from "@shared/schema";
import { generateEmployeeNumber } from "./staffProfileService";

export const PRESS_ID_PREFIX = "SBQ-PR-";

/** SBQ-PR-0042 — أربع خانات كحد أدنى، وتتسع تلقائياً بعد 9999. */
export function formatPressIdNumber(seq: number): string {
  return `${PRESS_ID_PREFIX}${String(seq).padStart(4, "0")}`;
}

/** تسلسل رقمي من أي صيغة تحمل أرقاماً (SBQ-0042 · SBQ-PR-0042). */
function seqOf(value: string | null | undefined): number | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const clean = (value: unknown): string => String(value ?? "").trim();

/**
 * أعلى تسلسل مستخدم ضمن صيغة SBQ-PR-* في الجدولين.
 * الأرقام بالعشرات فالحساب في JS أسلم من قوالب SQL الخاصة بكل سائق.
 */
async function maxPressSeq(tx: typeof db): Promise<number> {
  const pattern = `${PRESS_ID_PREFIX}%`;
  const [fromUsers, fromProfiles] = await Promise.all([
    tx.select({ value: users.pressIdNumber }).from(users).where(like(users.pressIdNumber, pattern)),
    tx
      .select({ value: staffProfiles.pressIdNumber })
      .from(staffProfiles)
      .where(like(staffProfiles.pressIdNumber, pattern)),
  ]);
  return [...fromUsers, ...fromProfiles].reduce(
    (max, row) => Math.max(max, seqOf(row.value) ?? 0),
    0,
  );
}

/** هل الرقم محجوز لمنسوب آخر؟ (الفهرس الفريد يمنعه أصلاً — نتفاداه بلطف) */
async function isTaken(tx: typeof db, candidate: string, userId: string): Promise<boolean> {
  const [clash] = await tx
    .select({ id: users.id })
    .from(users)
    .leftJoin(staffProfiles, eq(staffProfiles.userId, users.id))
    .where(
      and(
        ne(users.id, userId),
        or(eq(users.pressIdNumber, candidate), eq(staffProfiles.pressIdNumber, candidate))!,
      ),
    )
    .limit(1);
  return Boolean(clash);
}

export type EnsurePressIdResult =
  | {
      success: true;
      /** true = وُلِّد الآن · false = كان موجوداً فأُعيد كما هو */
      created: boolean;
      pressIdNumber: string;
      employeeNumber: string | null;
    }
  | { success: false; message: string };

/**
 * يُعيد رقم البطاقة الصحفية للمنسوب، ويولّده مرة واحدة إن لم يكن له رقم.
 * إعادة النداء لا تُغيّر رقماً قائماً أبداً (idempotent).
 */
export async function ensurePressIdNumber(
  userId: string,
  actorId: string,
): Promise<EnsurePressIdResult> {
  return await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('press-id-number'))`);

    const [user] = await tx
      .select({ id: users.id, pressIdNumber: users.pressIdNumber, hasPressCard: users.hasPressCard })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) return { success: false as const, message: "المستخدم غير موجود" };

    const [profile] = await tx
      .select({
        id: staffProfiles.id,
        employeeNumber: staffProfiles.employeeNumber,
        pressIdNumber: staffProfiles.pressIdNumber,
      })
      .from(staffProfiles)
      .where(eq(staffProfiles.userId, userId))
      .limit(1);

    // رقم قائم (بأي صيغة، بما فيها الأرقام اليدوية القديمة) = يبقى كما هو
    const existing = clean(user.pressIdNumber) || clean(profile?.pressIdNumber);
    if (existing) {
      // جسر التوافق: أي طرف فارغ يُملأ بالرقم نفسه
      if (clean(user.pressIdNumber) !== existing) {
        await tx.update(users).set({ pressIdNumber: existing }).where(eq(users.id, userId));
      }
      if (profile && clean(profile.pressIdNumber) !== existing) {
        await tx
          .update(staffProfiles)
          .set({ pressIdNumber: existing, updatedBy: actorId, updatedAt: new Date() })
          .where(eq(staffProfiles.userId, userId));
      }
      return {
        success: true as const,
        created: false,
        pressIdNumber: existing,
        employeeNumber: profile?.employeeNumber ?? null,
      };
    }

    // لا رقم: نضمن وجود ملف منسوب برقم وظيفي أولاً ليُشتق منه الرقم
    let employeeNumber = clean(profile?.employeeNumber) || null;
    if (!profile) {
      employeeNumber = await generateEmployeeNumber(tx as unknown as typeof db);
      await tx
        .insert(staffProfiles)
        .values({ userId, employeeNumber, profileReviewStatus: "draft", updatedBy: actorId });
    } else if (!employeeNumber) {
      employeeNumber = await generateEmployeeNumber(tx as unknown as typeof db);
      await tx
        .update(staffProfiles)
        .set({ employeeNumber, updatedBy: actorId, updatedAt: new Date() })
        .where(eq(staffProfiles.userId, userId));
    }

    const baseSeq = seqOf(employeeNumber) ?? (await maxPressSeq(tx)) + 1;
    let candidate = formatPressIdNumber(baseSeq);
    if (await isTaken(tx, candidate, userId)) {
      // التسلسل الوظيفي محجوز (رقم يدوي قديم مثلاً) — نكمل بعد أعلى رقم قائم
      let seq = Math.max(baseSeq, await maxPressSeq(tx));
      for (let attempt = 0; attempt < 50; attempt += 1) {
        seq += 1;
        candidate = formatPressIdNumber(seq);
        if (!(await isTaken(tx, candidate, userId))) break;
      }
      if (await isTaken(tx, candidate, userId)) {
        return { success: false as const, message: "تعذر إيجاد رقم بطاقة متاح — راجع الأرقام المسجلة" };
      }
    }

    await tx
      .update(users)
      .set({ pressIdNumber: candidate, hasPressCard: true })
      .where(eq(users.id, userId));
    await tx
      .update(staffProfiles)
      .set({ pressIdNumber: candidate, updatedBy: actorId, updatedAt: new Date() })
      .where(eq(staffProfiles.userId, userId));

    return {
      success: true as const,
      created: true,
      pressIdNumber: candidate,
      employeeNumber,
    };
  });
}

export type PressIdChange =
  | { ok: true; value?: string | null }
  | { ok: false; message: string };

/**
 * بوابة الثبات (نقية، بلا استعلام): تُطبَّق على كل حفظ يمس الحقل.
 *   • لا رقم حالياً → يُقبل الإدخال (استيراد الأرقام القديمة).
 *   • رقم قائم + قيمة مطابقة أو فارغة → تجاهل (لا تفريغ أبداً).
 *   • رقم قائم + قيمة مختلفة → رفض.
 * value === undefined تعني «لا تكتب الحقل».
 */
export function evaluatePressIdNumberChange(
  current: unknown,
  incoming: unknown,
): PressIdChange {
  if (incoming === undefined) return { ok: true, value: undefined };
  const currentValue = clean(current);
  const nextValue = clean(incoming);

  if (!currentValue) return { ok: true, value: nextValue || null };
  if (!nextValue || nextValue === currentValue) return { ok: true, value: undefined };

  return {
    ok: false,
    message: `رقم البطاقة الصحفية دائم ولا يقبل التعديل بعد إصداره (${currentValue})`,
  };
}

/** نفس البوابة لمن لا يملك القيمة الحالية — يقرؤها من الجدولين. */
export async function assertPressIdNumberChange(
  userId: string,
  incoming: unknown,
): Promise<PressIdChange> {
  if (incoming === undefined) return { ok: true, value: undefined };
  const [row] = await db
    .select({ fromUser: users.pressIdNumber, fromProfile: staffProfiles.pressIdNumber })
    .from(users)
    .leftJoin(staffProfiles, eq(staffProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  const current = clean(row?.fromUser) || clean(row?.fromProfile);
  return evaluatePressIdNumberChange(current, incoming);
}
