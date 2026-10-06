import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { sendEmailNotification } from "./email";
import {
  articles,
  publisherCreditLogs,
  publisherCredits,
  publisherRequests,
  publishers,
  type Publisher,
  type PublisherCredit,
  type PublisherRenewalOffer,
} from "@shared/schema";

/**
 * تجديد باقات الوكالات من التنبيه إلى التفعيل:
 *   تنبيه (بريد + لوحة) ← طلب الوكالة ← عرض الإدارة بالسعر ← قبول الوكالة
 *   ← تأكيد الدفع يدويًا ← إنشاء الباقة الجديدة لتبدأ لحظة انتهاء الحالية.
 * الفواتير والدفع خارج النظام.
 */

const DAY = 86_400_000;

/** صندوق الإدارة الذي يستقبل طلبات الوكالات وردودها. */
export function publisherAdminEmail(): string {
  return process.env.PUBLISHER_ADMIN_EMAIL?.trim() || "info@sabq.org";
}

/** طلب تجديد «حي» = لم يُغلق ولم يُرفض بعد. */
export const LIVE_REQUEST_STATUSES = ["open", "offered", "accepted"] as const;

/**
 * مواعيد تنبيه التجديد بالأيام قبل الانتهاء.
 * الباقة المفتوحة تُجدَّد بعقد سنوي، فيبدأ التنبيه قبل ثلاثة أشهر.
 */
export function renewalMilestones(isUnlimited: boolean): number[] {
  return isUnlimited ? [90, 30, 7] : [30, 7];
}

/** أصغر موعد تنبيه دخلته الباقة، أو null إن لم تدخل نافذة التنبيه بعد أو انتهت. */
export function currentRenewalMilestone(daysLeft: number, isUnlimited: boolean): number | null {
  if (daysLeft < 0) return null;
  const reached = renewalMilestones(isUnlimited).filter((m) => daysLeft <= m);
  return reached.length ? Math.min(...reached) : null;
}

export function daysUntil(date: Date | string, now = new Date()): number {
  return Math.ceil((new Date(date).getTime() - now.getTime()) / DAY);
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const arDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("ar-SA-u-ca-gregory", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh" });

const arNumber = (n: number) => n.toLocaleString("ar-SA");

function emailShell(inner: string): string {
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><body style="font-family:Tahoma,Arial,sans-serif;background:#f5f7f8;padding:24px;margin:0">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:10px;padding:28px;border:1px solid #e2e8f0;color:#334155;line-height:1.9;font-size:15px">
  ${inner}
  </div></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:22px 0"><a href="${href}" style="display:inline-block;background:#0369a1;color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px">${label}</a></p>`;

/** نص بريد التنبيه كما اتُّفق عليه مع الإدارة (6 أكتوبر 2026). */
export function renewalReminderEmail(params: {
  agencyName: string;
  contactPerson: string | null;
  expiryDate: Date | string;
  isUnlimited: boolean;
  daysLeft: number;
  published: number;
  views: number;
}): { subject: string; html: string } {
  const when =
    params.daysLeft > 45
      ? "أي بعد نحو ثلاثة أشهر"
      : params.daysLeft > 10
        ? "أي بعد نحو شهر"
        : `أي بعد ${arNumber(params.daysLeft)} ${params.daysLeft <= 10 && params.daysLeft >= 3 ? "أيام" : "يوم"}`;
  const kind = params.isUnlimited ? "باقة النشر المفتوحة" : "باقة النشر";
  const inner = `
    <p>السلام عليكم ورحمة الله وبركاته،</p>
    ${params.contactPerson ? `<p>الأستاذ/ة ${escapeHtml(params.contactPerson)} المحترم/ة،</p>` : ""}
    <p>نشكر لكم شراكتكم مع صحيفة سبق، ونود إفادتكم بأن ${kind} لوكالتكم تنتهي في <b>${arDate(params.expiryDate)}</b>، ${when}.</p>
    ${params.published > 0 ? `<p>منذ بداية الباقة نشرنا لكم <b>${arNumber(params.published)}</b> خبرًا، وصلت إلى <b>${arNumber(params.views)}</b> مشاهدة.</p>` : ""}
    <p>ولضمان استمرار نشر أخباركم دون انقطاع، يمكنكم طلب التجديد بضغطة واحدة من لوحة الوكالة، وسيتواصل معكم فريق سبق بعرض التجديد المناسب.</p>
    ${button("https://sabq.org/dashboard/publisher/credits", "اطلب التجديد")}
    <p>للاستفسار: ${publisherAdminEmail()}</p>
    <p>مع خالص التحية،<br>فريق شراكات صحيفة سبق</p>`;
  return {
    subject: `باقة النشر لوكالة ${params.agencyName} في سبق تنتهي في ${arDate(params.expiryDate)}`,
    html: emailShell(inner),
  };
}

function offerSummaryHtml(offer: PublisherRenewalOffer): string {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#64748b">${label}</td><td style="padding:6px 0;font-weight:bold">${value}</td></tr>`;
  return `<table style="width:100%;border-collapse:collapse;margin:12px 0">
    ${row("الباقة", offer.packageType === "unlimited" ? "مفتوحة بلا حد" : `${arNumber(offer.totalCredits ?? 0)} خبر`)}
    ${row("المدة", `${arNumber(offer.durationMonths)} ${offer.durationMonths <= 10 && offer.durationMonths >= 3 ? "أشهر" : "شهرًا"}`)}
    ${row("تبدأ", arDate(offer.startDate))}
    ${offer.price !== null ? row("السعر", `${arNumber(offer.price)} ${offer.currency === "SAR" ? "ر.س" : escapeHtml(offer.currency)}`) : ""}
    ${row("العرض صالح حتى", arDate(offer.validUntil))}
  </table>
  ${offer.note ? `<p style="color:#475569">ملاحظة: ${escapeHtml(offer.note)}</p>` : ""}`;
}

async function liveRenewalRequest(publisherId: string) {
  const [row] = await db
    .select()
    .from(publisherRequests)
    .where(
      and(
        eq(publisherRequests.publisherId, publisherId),
        eq(publisherRequests.type, "renewal"),
        inArray(publisherRequests.status, [...LIVE_REQUEST_STATUSES]),
      ),
    )
    .orderBy(desc(publisherRequests.createdAt))
    .limit(1);
  return row ?? null;
}

/** الباقة الحالية التي تُجدَّد: النشطة السارية الأقرب انتهاءً، ومعها الباقة اللاحقة إن وُجدت. */
export async function getRenewalContext(publisherId: string, now = new Date()) {
  const packages = await db
    .select()
    .from(publisherCredits)
    .where(
      and(
        eq(publisherCredits.publisherId, publisherId),
        eq(publisherCredits.isActive, true),
        sql`(${publisherCredits.expiryDate} IS NULL OR ${publisherCredits.expiryDate} >= ${now})`,
      ),
    )
    .orderBy(publisherCredits.startDate);

  const started = packages.filter((p) => p.startDate.getTime() <= now.getTime());
  const current =
    started
      .filter((p) => p.expiryDate)
      .sort((a, b) => a.expiryDate!.getTime() - b.expiryDate!.getTime())[0] ??
    started[0] ??
    null;
  const upcoming = current?.expiryDate
    ? packages.find((p) => p.id !== current.id && p.startDate.getTime() >= current.expiryDate!.getTime() - DAY) ?? null
    : packages.find((p) => p.startDate.getTime() > now.getTime()) ?? null;

  return { current, upcoming };
}

/** حالة التجديد كما تراها الوكالة في لوحتها. */
export async function getPortalRenewal(publisher: Publisher, now = new Date()) {
  const [{ current, upcoming }, request] = await Promise.all([
    getRenewalContext(publisher.id, now),
    liveRenewalRequest(publisher.id),
  ]);
  const daysLeft = current?.expiryDate ? daysUntil(current.expiryDate, now) : null;
  const milestone =
    current && daysLeft !== null && !upcoming ? currentRenewalMilestone(daysLeft, current.isUnlimited) : null;

  return {
    current: current
      ? {
          id: current.id,
          packageName: current.packageName,
          isUnlimited: current.isUnlimited,
          startDate: current.startDate,
          expiryDate: current.expiryDate,
          daysLeft,
        }
      : null,
    upcoming: upcoming
      ? {
          id: upcoming.id,
          packageName: upcoming.packageName,
          isUnlimited: upcoming.isUnlimited,
          startDate: upcoming.startDate,
          expiryDate: upcoming.expiryDate,
        }
      : null,
    /** داخل نافذة التنبيه ولا باقة لاحقة: يظهر زر «اطلب التجديد». */
    due: milestone !== null,
    milestones: current ? renewalMilestones(current.isUnlimited) : [],
    request: request
      ? {
          id: request.id,
          status: request.status,
          createdAt: request.createdAt,
          message: request.message,
          offer: request.offer ?? null,
        }
      : null,
  };
}

async function publishedSince(publisherId: string, since: Date) {
  const [row] = await db
    .select({ published: sql<number>`count(*)::int`, views: sql<number>`coalesce(sum(${articles.views}), 0)::bigint` })
    .from(articles)
    .where(and(eq(articles.publisherId, publisherId), eq(articles.status, "published"), gte(articles.publishedAt, since)));
  return { published: Number(row?.published) || 0, views: Number(row?.views) || 0 };
}

export type RenewalReminder = {
  alertKey: string;
  title: string;
  body: string;
  email: { subject: string; html: string };
};

/**
 * تذكير التجديد المستحق اليوم لوكالة، أو null.
 * لا تذكير إن كان للوكالة طلب تجديد حي أو باقة لاحقة مفعلة.
 * المفتاح يحمل الباقة والموعد، فلا يتكرر البريد نفسه مهما تكرر الفحص.
 */
export async function buildRenewalReminder(publisher: Publisher, now = new Date()): Promise<RenewalReminder | null> {
  const { current, upcoming } = await getRenewalContext(publisher.id, now);
  if (!current?.expiryDate || upcoming) return null;
  const daysLeft = daysUntil(current.expiryDate, now);
  const milestone = currentRenewalMilestone(daysLeft, current.isUnlimited);
  if (milestone === null) return null;
  if (await liveRenewalRequest(publisher.id)) return null;

  const stats = await publishedSince(publisher.id, current.startDate);
  const email = renewalReminderEmail({
    agencyName: publisher.agencyName,
    contactPerson: publisher.contactPerson,
    expiryDate: current.expiryDate,
    isUnlimited: current.isUnlimited,
    daysLeft,
    published: stats.published,
    views: stats.views,
  });
  return {
    alertKey: `renewal_due:${current.id}:${milestone}`,
    title: "باقتكم تقترب من الانتهاء",
    body: `تنتهي «${current.packageName}» في ${arDate(current.expiryDate)} (بعد ${arNumber(daysLeft)} ${daysLeft <= 10 && daysLeft >= 3 ? "أيام" : "يومًا"}). اطلبوا التجديد من صفحة الباقة ليستمر النشر دون انقطاع.`,
    email,
  };
}

// ============================================
// الإدارة: العرض والتفعيل — والوكالة: الرد
// ============================================

export type RenewalOfferInput = {
  packageType: "unlimited" | "limited";
  totalCredits?: number | null;
  durationMonths: number;
  startDate?: string | null;
  price?: number | null;
  currency?: string;
  validUntil: string;
  note?: string | null;
};

type NotifyAdmins = (payload: { title: string; body: string; deeplink?: string }) => Promise<void>;

export type RenewalResult = { ok: true; message: string } | { ok: false; status: number; message: string };

async function loadRequestWithPublisher(requestId: string) {
  const [row] = await db
    .select({ request: publisherRequests, publisher: publishers })
    .from(publisherRequests)
    .innerJoin(publishers, eq(publisherRequests.publisherId, publishers.id))
    .where(eq(publisherRequests.id, requestId))
    .limit(1);
  return row ?? null;
}

/** تاريخ بداية الباقة الجديدة الافتراضي: لحظة انتهاء الحالية، فلا يمر يوم بلا باقة. */
export async function defaultRenewalStart(publisherId: string, now = new Date()): Promise<Date> {
  const { current } = await getRenewalContext(publisherId, now);
  return current?.expiryDate && current.expiryDate.getTime() > now.getTime() ? current.expiryDate : now;
}

export async function sendRenewalOffer(
  requestId: string,
  adminId: string,
  input: RenewalOfferInput,
  deps: { notifyMembers: (publisherId: string, payload: { title: string; body: string; deeplink?: string }) => Promise<void> },
): Promise<RenewalResult> {
  const row = await loadRequestWithPublisher(requestId);
  if (!row) return { ok: false, status: 404, message: "الطلب غير موجود" };
  const { request, publisher } = row;
  if (request.type !== "renewal") return { ok: false, status: 400, message: "العرض متاح لطلبات التجديد فقط" };
  if (!["open", "offered"].includes(request.status)) {
    return { ok: false, status: 409, message: "لا يمكن إرسال عرض على طلب بهذه الحالة" };
  }
  if (input.packageType === "limited" && !(Number(input.totalCredits) > 0)) {
    return { ok: false, status: 400, message: "حدد عدد الأخبار للباقة المحدودة" };
  }
  const validUntil = new Date(input.validUntil);
  if (Number.isNaN(validUntil.getTime()) || validUntil.getTime() < Date.now() - DAY) {
    return { ok: false, status: 400, message: "تاريخ صلاحية العرض غير صحيح" };
  }
  const startDate = input.startDate ? new Date(input.startDate) : await defaultRenewalStart(publisher.id);
  if (Number.isNaN(startDate.getTime())) return { ok: false, status: 400, message: "تاريخ البداية غير صحيح" };

  const offer: PublisherRenewalOffer = {
    packageType: input.packageType,
    totalCredits: input.packageType === "limited" ? Math.round(Number(input.totalCredits)) : null,
    durationMonths: Math.round(input.durationMonths),
    startDate: startDate.toISOString(),
    price: input.price === null || input.price === undefined ? null : Number(input.price),
    currency: input.currency?.trim() || "SAR",
    validUntil: validUntil.toISOString(),
    note: input.note?.trim() || null,
    sentAt: new Date().toISOString(),
    sentBy: adminId,
  };

  const [updated] = await db
    .update(publisherRequests)
    .set({ status: "offered", offer })
    .where(and(eq(publisherRequests.id, requestId), inArray(publisherRequests.status, ["open", "offered"])))
    .returning({ id: publisherRequests.id });
  if (!updated) return { ok: false, status: 409, message: "تغيرت حالة الطلب، حدّث الصفحة" };

  await deps.notifyMembers(publisher.id, {
    title: "وصلكم عرض تجديد الباقة",
    body: "أرسلت إدارة سبق عرض التجديد. راجعوه واقبلوه من صفحة الباقة.",
    deeplink: "/dashboard/publisher/credits",
  });
  if (publisher.email) {
    await sendEmailNotification({
      to: publisher.email,
      subject: `عرض تجديد باقة وكالة ${publisher.agencyName} في سبق`,
      html: emailShell(`
        <p>السلام عليكم ورحمة الله وبركاته،</p>
        ${publisher.contactPerson ? `<p>الأستاذ/ة ${escapeHtml(publisher.contactPerson)} المحترم/ة،</p>` : ""}
        <p>يسعدنا استمرار شراكتكم مع صحيفة سبق، وهذا عرض تجديد باقة وكالتكم:</p>
        ${offerSummaryHtml(offer)}
        <p>يمكنكم قبول العرض أو طلب التواصل من صفحة الباقة في لوحة الوكالة.</p>
        ${button("https://sabq.org/dashboard/publisher/credits", "مراجعة العرض")}
        <p>مع خالص التحية،<br>فريق شراكات صحيفة سبق</p>`),
    });
  }
  return { ok: true, message: "أُرسل العرض للوكالة بالبريد وفي لوحتها" };
}

export async function respondToRenewalOffer(
  publisher: Publisher,
  requestId: string,
  userId: string,
  response: "accepted" | "contact",
  deps: { notifyAdmins: NotifyAdmins },
): Promise<RenewalResult> {
  const row = await loadRequestWithPublisher(requestId);
  if (!row || row.request.publisherId !== publisher.id) return { ok: false, status: 404, message: "الطلب غير موجود" };
  const { request } = row;
  if (request.status !== "offered" || !request.offer) {
    return { ok: false, status: 409, message: "لا يوجد عرض بانتظار ردكم على هذا الطلب" };
  }
  if (response === "accepted" && new Date(request.offer.validUntil).getTime() + DAY < Date.now()) {
    return { ok: false, status: 409, message: "انتهت صلاحية العرض. اطلبوا التواصل لتجديده." };
  }

  const offer: PublisherRenewalOffer = {
    ...request.offer,
    response,
    respondedAt: new Date().toISOString(),
    respondedBy: userId,
  };
  const [updated] = await db
    .update(publisherRequests)
    .set({ status: response === "accepted" ? "accepted" : "offered", offer })
    .where(and(eq(publisherRequests.id, requestId), eq(publisherRequests.status, "offered")))
    .returning({ id: publisherRequests.id });
  if (!updated) return { ok: false, status: 409, message: "تغيرت حالة الطلب، حدّث الصفحة" };

  const title =
    response === "accepted"
      ? `قبلت ${publisher.agencyName} عرض التجديد`
      : `${publisher.agencyName} تطلب التواصل بشأن عرض التجديد`;
  const next =
    response === "accepted"
      ? "الطلب الآن بانتظار الدفع. بعد تأكيده فعّلوا الباقة من صفحة الطلبات."
      : "تواصلوا مع الوكالة، ويمكن تعديل العرض وإرساله من جديد.";
  await deps.notifyAdmins({ title, body: next, deeplink: "/dashboard/admin/publishers" });
  await sendEmailNotification({
    to: publisherAdminEmail(),
    subject: `سبق | ${title}`,
    html: emailShell(`
      <h3 style="margin:0 0 8px;color:#0f172a">${escapeHtml(title)}</h3>
      ${offerSummaryHtml(offer)}
      <p>${next}</p>
      <p>مسؤول التواصل: ${escapeHtml(publisher.contactPerson ?? "—")} · ${escapeHtml(publisher.phoneNumber ?? "—")} · ${escapeHtml(publisher.email ?? "—")}</p>
      ${button("https://sabq.org/dashboard/admin/publishers", "فتح طلبات الوكالات")}`),
  });

  return {
    ok: true,
    message:
      response === "accepted"
        ? "شكرًا لكم. سيتواصل معكم فريق سبق لإتمام الدفع، وتُفعَّل الباقة بعد تأكيده."
        : "أبلغنا فريق سبق، وسيتواصل معكم قريبًا.",
  };
}

function periodFor(months: number): string {
  if (months === 1) return "monthly";
  if (months === 3) return "quarterly";
  if (months === 12) return "yearly";
  return "one-time";
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  // 31 يناير + شهر لا يقفز إلى مارس
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d;
}

export function renewalPackageName(offer: PublisherRenewalOffer): string {
  const months = offer.durationMonths === 12 ? "سنوية" : `${offer.durationMonths} ${offer.durationMonths <= 10 && offer.durationMonths >= 3 ? "أشهر" : "شهرًا"}`;
  return offer.packageType === "unlimited" ? `باقة مفتوحة ${months}` : `باقة ${offer.totalCredits} خبر · ${months}`;
}

/** تأكيد الدفع: تُنشأ الباقة الجديدة بالسعر المتفق عليه ويُغلق الطلب، في معاملة واحدة. */
export async function activateRenewal(
  requestId: string,
  adminId: string,
  deps: { notifyMembers: (publisherId: string, payload: { title: string; body: string; deeplink?: string }) => Promise<void> },
): Promise<RenewalResult & { creditId?: string }> {
  const row = await loadRequestWithPublisher(requestId);
  if (!row) return { ok: false, status: 404, message: "الطلب غير موجود" };
  const { request, publisher } = row;
  if (request.status !== "accepted" || !request.offer) {
    return { ok: false, status: 409, message: "التفعيل متاح بعد قبول الوكالة للعرض فقط" };
  }
  const offer = request.offer;
  const startDate = new Date(offer.startDate);
  const expiryDate = addMonths(startDate, offer.durationMonths);
  const totalCredits = offer.packageType === "unlimited" ? 0 : offer.totalCredits ?? 0;

  const credit = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(publisherRequests)
      .set({ status: "closed", handledBy: adminId, handledAt: new Date() })
      .where(and(eq(publisherRequests.id, requestId), eq(publisherRequests.status, "accepted")))
      .returning({ id: publisherRequests.id });
    if (!claimed) return null;

    const [created] = await tx
      .insert(publisherCredits)
      .values({
        publisherId: publisher.id,
        packageName: renewalPackageName(offer),
        totalCredits,
        usedCredits: 0,
        remainingCredits: totalCredits,
        isUnlimited: offer.packageType === "unlimited",
        period: periodFor(offer.durationMonths),
        startDate,
        expiryDate,
        price: offer.price,
        currency: offer.currency,
        isActive: true,
        notes: `تجديد بعد تأكيد الدفع — طلب ${requestId}`,
        createdBy: adminId,
      })
      .returning();

    await tx.insert(publisherCreditLogs).values({
      publisherId: publisher.id,
      creditPackageId: created.id,
      actionType: "credit_added",
      creditsBefore: 0,
      creditsChanged: totalCredits,
      creditsAfter: totalCredits,
      performedBy: adminId,
      notes: `تجديد: ${created.packageName}`,
    });

    await tx
      .update(publisherRequests)
      .set({ offer: { ...offer, activatedCreditId: created.id } })
      .where(eq(publisherRequests.id, requestId));
    return created as PublisherCredit;
  });

  if (!credit) return { ok: false, status: 409, message: "تغيرت حالة الطلب، حدّث الصفحة" };

  await deps.notifyMembers(publisher.id, {
    title: "فُعّلت باقتكم الجديدة",
    body: `«${credit.packageName}» تبدأ في ${arDate(startDate)} وتنتهي في ${arDate(expiryDate)}.`,
    deeplink: "/dashboard/publisher/credits",
  });
  return { ok: true, message: "فُعّلت الباقة الجديدة وأُبلغت الوكالة", creditId: credit.id };
}

/** بريد طلب جديد إلى صندوق الإدارة — مع أرقام الباقة الحالية ليُبنى العرض عليها. */
export async function emailAdminsNewRequest(publisher: Publisher, typeLabel: string, message: string | null) {
  const { current } = await getRenewalContext(publisher.id);
  const stats = current ? await publishedSince(publisher.id, current.startDate) : null;
  await sendEmailNotification({
    to: publisherAdminEmail(),
    subject: `طلب ${typeLabel}: ${publisher.agencyName}`,
    html: emailShell(`
      <h3 style="margin:0 0 8px;color:#0f172a">طلب ${escapeHtml(typeLabel)} من ${escapeHtml(publisher.agencyName)}</h3>
      ${current ? `<p>الباقة الحالية: <b>${escapeHtml(current.packageName)}</b>${current.expiryDate ? `، تنتهي في ${arDate(current.expiryDate)}` : ""}.</p>` : "<p>لا توجد باقة سارية حاليًا.</p>"}
      ${stats ? `<p>منشور ضمن الباقة: ${arNumber(stats.published)} خبرًا، و${arNumber(stats.views)} مشاهدة.</p>` : ""}
      ${message ? `<p>رسالة الوكالة: «${escapeHtml(message)}»</p>` : ""}
      <p>مسؤول التواصل: ${escapeHtml(publisher.contactPerson ?? "—")} · ${escapeHtml(publisher.phoneNumber ?? "—")} · ${escapeHtml(publisher.email ?? "—")}</p>
      ${button("https://sabq.org/dashboard/admin/publishers", "افتح الطلب وأرسل العرض")}`),
  });
}
