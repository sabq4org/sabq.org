// تذكير كاتب الرأي بمسودة حفظها ولم يرسلها للتحرير (2026-11-26).
// بعض الكتّاب يضغطون «حفظ» ويظنون أن المقال وصل. بعد 24 ساعة بلا تعديل نرسل تذكيرًا واحدًا
// لكل مسودة: تنبيه في لوحة الكاتب (editorial_notifications) وبريد قصير.
// منع التكرار بلا جدول جديد: صف في activity_logs (action = draft_reminder_sent، entity = المقال)
// يُكتب قبل التنبيه والبريد. لا نعتمد على صف التنبيه لأن الكاتب يستطيع حذفه من تطبيق الجوال،
// وactivity_logs يبقى 90 يومًا (أطول من نافذة الـ14 يومًا).
// لا نذكّر كاتبًا لديه مقال آخر لدى التحرير أو مجدول (لا يستطيع الإرسال الآن)؛ نذكّره بعد نشره.
// الاستبعاد داخل الاستعلام نفسه (قبل الحد) كي لا يحجب كتّاب مشغولون مسودات غيرهم.

import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { activityLogs, articles, editorialNotifications, users } from "@shared/schema";
import { sendEmailNotification } from "./email";

export const DRAFT_REMINDER_TYPE = "draft_reminder";
export const DRAFT_REMINDER_LOG_ACTION = "draft_reminder_sent";
/** مدة السكون قبل التذكير. */
export const DRAFT_REMINDER_IDLE_MS = 24 * 60 * 60 * 1000;
/** لا نذكّر بمسودات قديمة جدًا (عند أول تشغيل أو مسودة مهجورة). */
export const DRAFT_REMINDER_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_PER_TICK = 40;
const SITE_URL = (process.env.MEETINGS_PUBLIC_URL || "https://sabq.org").replace(/\/+$/, "");

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function shortTitle(title: string): string {
  const t = title.trim() || "بلا عنوان";
  return t.length > 70 ? `${t.slice(0, 67)}…` : t;
}

export function buildDraftReminderCopy(title: string): { title: string; body: string } {
  return {
    title: "مسودتك ما زالت عندك",
    body: `«${shortTitle(title)}» محفوظة ولم تُرسل لهيئة التحرير. افتحها واضغط «إرسال للمراجعة».`,
  };
}

export function buildDraftReminderEmail(input: {
  name: string;
  title: string;
  url: string;
}): { subject: string; html: string; text: string } {
  const title = shortTitle(input.title);
  const subject = "مقالك لم يصل لهيئة التحرير بعد";
  const text = `مرحبًا ${input.name}\n\nحفظت مقالك «${title}» دون إرساله، ولن تراه هيئة التحرير حتى تضغط «إرسال للمراجعة».\n\nافتح المسودة: ${input.url}\n\nصحيفة سبق`;
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#F4F7FB;padding:24px;color:#1B2B3A">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:24px">
    <p style="margin:0 0 6px;color:#7A4B00;font-size:13px">مسودة لم تُرسل</p>
    <h1 style="margin:0 0 12px;font-size:20px">${escapeHtml(subject)}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.8">مرحبًا ${escapeHtml(input.name)}، حفظت مقالك «${escapeHtml(title)}» دون إرساله، ولن تراه هيئة التحرير حتى تضغط «إرسال للمراجعة».</p>
    <a href="${escapeHtml(input.url)}" style="display:inline-block;background:#1E9BE6;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:bold">افتح المسودة</a>
    <p style="margin:20px 0 0;color:#8A99A8;font-size:12px">تذكير واحد لكل مسودة. صحيفة سبق</p>
  </div>
</div>`;
  return { subject, html, text };
}

/** دورة واحدة: لا ترمي أبداً. */
export async function runWriterDraftReminderTick(now: Date = new Date()): Promise<void> {
  try {
    const idleBefore = new Date(now.getTime() - DRAFT_REMINDER_IDLE_MS);
    const notOlderThan = new Date(now.getTime() - DRAFT_REMINDER_MAX_AGE_MS);
    const candidates = await db
      .select({
        id: articles.id,
        title: articles.title,
        authorId: articles.authorId,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(articles)
      .innerJoin(users, eq(users.id, articles.authorId))
      .where(
        and(
          eq(articles.articleType, "opinion"),
          eq(articles.status, "draft"),
          isNull(articles.reviewStatus),
          eq(users.role, "opinion_author"),
          isNull(users.deletedAt),
          eq(users.status, "active"),
          lte(articles.updatedAt, idleBefore),
          gte(articles.updatedAt, notOlderThan),
          sql`length(trim(coalesce(${articles.title}, ''))) > 0`,
          // مسودات التطبيقات القديمة بلا حالة مراجعة تُعد مرسلة (awaitingEditorialSql).
          sql`coalesce(${articles.source}, '') NOT IN ('ios-app', 'android-app')`,
          // تذكير واحد لكل مسودة.
          sql`NOT EXISTS (SELECT 1 FROM ${activityLogs} l WHERE l.entity_type = 'article' AND l.entity_id = ${articles.id} AND l.action = ${DRAFT_REMINDER_LOG_ACTION})`,
          // تذكير واحد على الأكثر لكل كاتب في اليوم، ولو كانت لديه عدة مسودات.
          sql`NOT EXISTS (SELECT 1 FROM ${activityLogs} l WHERE l.action = ${DRAFT_REMINDER_LOG_ACTION} AND l.created_at > ${idleBefore} AND l.new_value->>'writerId' = ${articles.authorId})`,
          // الكاتب ليس لديه مقال آخر لدى التحرير أو مجدول (مثل getWriterActivePipelineArticle).
          sql`NOT EXISTS (SELECT 1 FROM ${articles} p WHERE p.article_type = 'opinion' AND p.author_id = ${articles.authorId} AND p.id <> ${articles.id}
            AND (p.status = 'scheduled' OR (p.status = 'draft' AND (p.review_status IN ('pending_review', 'approved')
              OR (p.review_status IS NULL AND p.source IN ('ios-app', 'android-app'))))))`,
        ),
      )
      .orderBy(desc(articles.updatedAt))
      .limit(MAX_PER_TICK);
    if (!candidates.length) return;

    let sent = 0;
    const remindedAuthors = new Set<string>();
    for (const row of candidates) {
      if (!row.authorId || remindedAuthors.has(row.authorId)) continue;
      try {
        await db.insert(activityLogs).values({
          userId: null,
          action: DRAFT_REMINDER_LOG_ACTION,
          entityType: "article",
          entityId: row.id,
          newValue: { writerId: row.authorId },
          createdAt: now,
        });
        remindedAuthors.add(row.authorId);
        const copy = buildDraftReminderCopy(row.title);
        const [inserted] = await db
          .insert(editorialNotifications)
          .values({
            userId: row.authorId,
            type: DRAFT_REMINDER_TYPE,
            title: copy.title,
            body: copy.body,
            articleId: row.id,
            articleTitle: row.title,
            deepLink: `sabq://draft/${row.id}`,
            deliveryStatus: "no_device",
            createdAt: now,
          })
          .returning({ id: editorialNotifications.id });
        if (!inserted) continue;
        if (row.email) {
          const name = [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || "الكاتب";
          const mail = buildDraftReminderEmail({
            name,
            title: row.title,
            url: `${SITE_URL}/dashboard/articles/${row.id}/edit`,
          });
          const result = await sendEmailNotification({ to: row.email, ...mail });
          await db
            .update(editorialNotifications)
            .set(result.success ? { deliveryStatus: "sent" } : { deliveryStatus: "failed", deliveryError: "email" })
            .where(eq(editorialNotifications.id, inserted.id));
        }
        sent++;
      } catch (error) {
        console.error("[WriterDraftReminder] reminder failed:", error instanceof Error ? error.message : error);
      }
    }
    if (sent) console.log(`[WriterDraftReminder] reminded ${sent} writer(s)`);
  } catch (error) {
    console.error("[WriterDraftReminder] tick failed:", error instanceof Error ? error.message : error);
  }
}
