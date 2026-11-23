// تذكير الاجتماع بالبريد: قبل الموعد بنصف ساعة لمن أكدوا حضورهم («سأحضر») وللمضيف،
// مع رابط صفحة الاجتماع. تعمل كل دقيقة على القائد فقط (server/jobs/meetingRemindersJob.ts).
// منع التكرار بلا جدول جديد: يُسجَّل حدث reminder_30m في meeting_events لكل مستلم قبل الإرسال،
// فلا يُرسل التذكير مرتين ولو تبدّل القائد أو أُعيد التشغيل.

import { and, eq, gte, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import { db } from "../db";
import { meetingEvents, meetingParticipants, meetings, users } from "@shared/schema";
import { sendEmailNotification } from "./email";

export const MEETING_REMINDER_LEAD_MS = 30 * 60 * 1000;
const REMINDER_EVENT = "reminder_30m";
const REMINDER_FAILED_EVENT = "reminder_30m_failed";
const MAX_ATTEMPTS = 3;
// حد MailerSend 120 رسالة/دقيقة؛ نرسل 60 على الأكثر في الدورة والباقي في الدقيقة التالية (نافذة 30 دقيقة تكفي)
const MAX_SENDS_PER_TICK = 60;
const SITE_URL = (process.env.MEETINGS_PUBLIC_URL || "https://sabq.org").replace(/\/+$/, "");

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function formatRiyadh(d: Date): string {
  return d.toLocaleString("ar", {
    timeZone: "Asia/Riyadh",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    numberingSystem: "latn",
  });
}

export function buildMeetingReminderEmail(input: {
  name: string;
  title: string;
  scheduledAt: Date;
  durationMinutes: number | null;
  url: string;
}): { subject: string; html: string; text: string } {
  const when = formatRiyadh(input.scheduledAt);
  const dur = input.durationMinutes ? ` · ${input.durationMinutes} دقيقة` : "";
  const subject = `بعد نصف ساعة: ${input.title}`;
  const text = `مرحبًا ${input.name}\n\nيبدأ اجتماع «${input.title}» بعد نصف ساعة (${when}${dur} بتوقيت الرياض).\n\nصفحة الاجتماع: ${input.url}\n\nصحيفة سبق`;
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#F4F7FB;padding:24px;color:#1B2B3A">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:24px">
    <p style="margin:0 0 6px;color:#5B6B7A;font-size:13px">تذكير باجتماع</p>
    <h1 style="margin:0 0 12px;font-size:20px">${escapeHtml(input.title)}</h1>
    <p style="margin:0 0 4px;font-size:15px">مرحبًا ${escapeHtml(input.name)}، يبدأ الاجتماع بعد نصف ساعة.</p>
    <p style="margin:0 0 20px;color:#5B6B7A;font-size:14px">${escapeHtml(when)}${escapeHtml(dur)} · بتوقيت الرياض</p>
    <a href="${escapeHtml(input.url)}" style="display:inline-block;background:#1E9BE6;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:bold">صفحة الاجتماع</a>
    <p style="margin:20px 0 0;color:#8A99A8;font-size:12px">وصلك هذا لأنك أكدت حضورك. صحيفة سبق</p>
  </div>
</div>`;
  return { subject, html, text };
}

/** دورة واحدة: لا ترمي أبداً */
export async function runMeetingRemindersTick(now: Date = new Date()): Promise<void> {
  try {
    const due = await db
      .select({
        id: meetings.id,
        title: meetings.title,
        scheduledAt: meetings.scheduledAt,
        durationMinutes: meetings.durationMinutes,
        hostUserId: meetings.hostUserId,
      })
      .from(meetings)
      .where(
        and(
          eq(meetings.status, "scheduled"),
          isNotNull(meetings.scheduledAt),
          gte(meetings.scheduledAt, now),
          lte(meetings.scheduledAt, new Date(now.getTime() + MEETING_REMINDER_LEAD_MS)),
        ),
      );
    if (!due.length) return;
    let budget = MAX_SENDS_PER_TICK;

    for (const m of due) {
      if (budget <= 0) break;
      const recipients = await db
        .select({ userId: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName })
        .from(meetingParticipants)
        .innerJoin(users, eq(users.id, meetingParticipants.userId))
        .where(
          and(
            eq(meetingParticipants.meetingId, m.id),
            or(eq(meetingParticipants.rsvp, "yes"), eq(meetingParticipants.userId, m.hostUserId)),
            isNotNull(users.email),
          ),
        );
      if (!recipients.length) continue;

      const already = await db
        .select({ userId: meetingEvents.targetUserId, eventType: meetingEvents.eventType })
        .from(meetingEvents)
        .where(
          and(
            eq(meetingEvents.meetingId, m.id),
            inArray(meetingEvents.eventType, [REMINDER_EVENT, REMINDER_FAILED_EVENT]),
            inArray(meetingEvents.targetUserId, recipients.map((r) => r.userId)),
          ),
        );
      // أُرسل له، أو فشل ثلاث مرات (لا نعيد المحاولة بلا نهاية)
      const failures = new Map<string, number>();
      const sent = new Set<string | null>();
      for (const a of already) {
        if (a.eventType === REMINDER_EVENT) sent.add(a.userId);
        else if (a.userId) failures.set(a.userId, (failures.get(a.userId) ?? 0) + 1);
      }
      for (const [uid, n] of Array.from(failures)) if (n >= MAX_ATTEMPTS) sent.add(uid);
      const url = `${SITE_URL}/dashboard/meetings/${m.id}`;
      const pending = recipients.filter((r) => !sent.has(r.userId) && r.email).slice(0, budget);
      budget -= pending.length;
      if (!pending.length) continue;

      let delivered = 0;
      let failed = 0;
      for (const r of pending) {
        // نحجز أولاً (يمنع التكرار لو تداخلت دورتان)، ونحوّل الحجز إلى «فشل» إن لم يصل البريد
        const [claim] = await db
          .insert(meetingEvents)
          .values({ meetingId: m.id, targetUserId: r.userId, eventType: REMINDER_EVENT, detail: { channel: "email" } })
          .returning({ id: meetingEvents.id });
        const name = [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || "زميلنا";
        const mail = buildMeetingReminderEmail({
          name,
          title: m.title,
          scheduledAt: m.scheduledAt!,
          durationMinutes: m.durationMinutes,
          url,
        });
        const result = await sendEmailNotification({ to: r.email!, ...mail });
        if (result.success) {
          delivered += 1;
        } else {
          failed += 1;
          await db
            .update(meetingEvents)
            .set({ eventType: REMINDER_FAILED_EVENT, detail: { channel: "email", error: result.error ?? "unknown" } })
            .where(eq(meetingEvents.id, claim.id));
        }
      }
      console.log(`[MeetingReminders] meeting ${m.id}: ${delivered} sent, ${failed} failed`);
    }
  } catch (error) {
    console.error("[MeetingReminders] tick failed:", error instanceof Error ? error.message : error);
  }
}

// للاختبار: عدد التذكيرات المرسلة لاجتماع
export async function countMeetingReminders(meetingId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(meetingEvents)
    .where(and(eq(meetingEvents.meetingId, meetingId), eq(meetingEvents.eventType, REMINDER_EVENT)));
  return row?.n ?? 0;
}
