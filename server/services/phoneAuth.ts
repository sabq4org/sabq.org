import { eq, or } from "drizzle-orm";
import { users, canUserLogin, getUserStatusMessage } from "@shared/schema";
import { db } from "../db";

// منطق مشترك لدخول/تسجيل الجوال (يُستخدم من الموبايل: oauthMobile.ts، والويب:
// routes.ts). يعزل التطبيع + إنشاء/ربط المستخدم في مكان واحد لتفادي التباعد.

/// يُطبّع أي إدخال سعودي إلى E.164 (+9665XXXXXXXX). يقبل: 564255999، 0564255999،
/// 966564255999، 00966…، +966 56 425 5999. يرجع null لغير الصالح.
export function normalizeSaudiPhone(input: string | undefined | null): string | null {
  if (!input) return null;
  let d = String(input).replace(/[^0-9]/g, "");
  if (d.startsWith("00966")) d = d.slice(5);
  else if (d.startsWith("966")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  // رقم المشترك السعودي: 9 أرقام تبدأ بـ5.
  if (!/^5\d{8}$/.test(d)) return null;
  return "+966" + d;
}

/**
 * يُطبّع الجوال إلى E.164 الدولي.
 * - إن وُجد `+` أو بادئة `00` → يُقبل كرقم دولي (8–15 رقمًا).
 * - وإلا → مسار سعودي قديم (توافق تطبيقات سبق/الخليج التي ترسل 5XXXXXXXX).
 */
export function normalizePhone(input: string | undefined | null): string | null {
  if (!input) return null;
  const raw = String(input).trim();
  const compact = raw.replace(/[\s\-().]/g, "");

  if (compact.startsWith("+") || compact.startsWith("00")) {
    let digits = compact.replace(/[^0-9]/g, "");
    if (digits.startsWith("00")) digits = digits.slice(2);
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  return normalizeSaudiPhone(input);
}

/// صيغ الجوال المحتملة في قاعدة البيانات (لربط حسابات موقع سبق القديمة).
export function phoneCandidates(e164: string): string[] {
  const digits = e164.replace(/\D/g, "");
  const out = new Set<string>([e164, digits]);
  if (e164.startsWith("+966")) {
    const local = e164.slice(4); // 5XXXXXXXX
    out.add(`966${local}`);
    out.add(`0${local}`);
    out.add(local);
  }
  return [...out];
}

export type PhoneUserResult =
  | { ok: true; user: typeof users.$inferSelect }
  | { ok: false; status: number; message: string };

/// يبحث عن مستخدم بهذا الجوال (بأي صيغة) أو يُنشئه (نفس SSO سبق). البريد اصطناعي
/// فريد مشتقّ من الرقم لأن عمود email هو notNull().unique().
export async function findOrCreatePhoneUser(e164: string): Promise<PhoneUserResult> {
  const [existing] = await db
    .select()
    .from(users)
    .where(or(...phoneCandidates(e164).map((p) => eq(users.phoneNumber, p))))
    .limit(1);

  if (existing) {
    if (!canUserLogin(existing)) {
      return {
        ok: false,
        status: 403,
        message: getUserStatusMessage(existing) || "لا يمكنك تسجيل الدخول بسبب حالة حسابك",
      };
    }
    const updates: Partial<typeof users.$inferInsert> = {};
    if (!existing.phoneVerified) updates.phoneVerified = true;
    if (!existing.phoneNumber) updates.phoneNumber = e164;
    if (Object.keys(updates).length > 0) {
      await db.update(users).set(updates).where(eq(users.id, existing.id));
    }
    return { ok: true, user: { ...existing, ...updates } };
  }

  const digits = e164.replace(/\D/g, "");
  const syntheticEmail = `p${digits}@phone.sabq.org`;
  const { nanoid } = await import("nanoid");
  const [created] = await db
    .insert(users)
    .values({
      id: nanoid(),
      email: syntheticEmail,
      phoneNumber: e164,
      role: "reader",
      authProvider: "phone",
      phoneVerified: true,
      emailVerified: false,
      status: "active",
      isProfileComplete: false,
    })
    .returning();
  return { ok: true, user: created };
}

/// بريد اصطناعي لحسابات الدخول بالجوال — ليس بريد المستخدم الحقيقي.
export function isSyntheticPhoneEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith("@phone.sabq.org");
}
