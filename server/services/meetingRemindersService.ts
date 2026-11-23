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

    for (const m of due) {
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
        .select({ userId: meetingEvents.targetUserId })
        .from(meetingEvents)
        .where(
          and(
            eq(meetingEvents.meetingId, m.id),
            eq(meetingEvents.eventType, REMINDER_EVENT),
            inArray(meetingEvents.targetUserId, recipients.map((r) => r.userId)),
          ),
        );
      const sent = new Set(already.map((a) => a.userId));
      const url = `${SITE_URL}/dashboard/meetings/${m.id}`;
      const pending = recipients.filter((r) => !sent.has(r.userId) && r.email);
      if (!pending.length) continue;

      for (const r of pending) {
        // نسجّل أولاً: تذكير مفقود أهون من تذكير مكرر لعشرات المدعوين
        await db.insert(meetingEvents).values({
          meetingId: m.id,
          targetUserId: r.userId,
          eventType: REMINDER_EVENT,
          detail: { channel: "email" },
        });
        const name = [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || "زميلنا";
        const mail = buildMeetingReminderEmail({
          name,
          title: m.title,
          scheduledAt: m.scheduledAt!,
          durationMinutes: m.durationMinutes,
          url,
        });
        await sendEmailNotification({ to: r.email!, ...mail });
      }
      console.log(`[MeetingReminders] meeting ${m.id}: ${pending.length} reminder(s)`);
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
