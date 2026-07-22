// ----------------------------------------------------------------------------
// «أمين المحضر» — خدمة التفريغ والمحضر الآلي لاجتماعات سبق (ADR-001)
//
// عامل التفريغ (meetings-agent، خدمة مستقلة على Railway) ينضم للغرفة عبر
// Agent Dispatch ويكتب مقاطع التفريغ هنا عبر مسارات داخلية موقّعة بسر
// مشترك MEETINGS_AGENT_SECRET. عند انتهاء الاجتماع يولَّد المحضر بنموذج
// لغوي ويُعرض على المضيف للمراجعة والاعتماد ثم يُوزَّع بالبريد.
//
// قرارات معتمدة (دراسة 2026-07-22): التفعيل اختياري لكل اجتماع؛ التفريغ
// الخام للمضيف فقط ويُحذف بعد ٣٠ يوماً؛ المحضر المعتمد يبقى ويصل للجميع.
// ----------------------------------------------------------------------------

import crypto from "crypto";
import { and, asc, eq, lt, sql } from "drizzle-orm";
import { AgentDispatchClient } from "livekit-server-sdk";
import { db } from "../db";
import {
  meetings,
  meetingParticipants,
  meetingTranscripts,
  users,
  type Meeting,
  type MeetingMinutes,
  type MeetingTranscript,
} from "@shared/schema";
import { aiGateway } from "../ai/gateway";
import { sendEmailNotification } from "./email";
import { logMeetingEvent } from "./meetingsService";

const AGENT_NAME = "sabq-minutes-agent";
const TRANSCRIPT_RETENTION_DAYS = 30;

export function isMinutesAgentConfigured(): boolean {
  return Boolean(process.env.MEETINGS_AGENT_SECRET && process.env.OPENAI_API_KEY);
}

/** مقارنة ثابتة الزمن لسر العامل — تُستخدم في المسارات الداخلية */
export function verifyAgentSecret(provided: string | undefined): boolean {
  const secret = process.env.MEETINGS_AGENT_SECRET;
  if (!secret || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ────────────────────────────────────────────────────────────────────
// استدعاء العامل — Agent Dispatch عند بدء اجتماع مفعّل المحضر
// ────────────────────────────────────────────────────────────────────

function livekitHttpUrl(): string {
  return (process.env.LIVEKIT_URL || "")
    .replace(/^wss:/, "https:")
    .replace(/^ws:/, "http:");
}

export async function dispatchMinutesAgent(meeting: Meeting): Promise<void> {
  if (!meeting.minutesEnabled || !isMinutesAgentConfigured()) return;
  try {
    const client = new AgentDispatchClient(
      livekitHttpUrl(),
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
    );
    await client.createDispatch(meeting.roomName, AGENT_NAME, {
      metadata: JSON.stringify({ meetingId: meeting.id }),
    });
    await db
      .update(meetings)
      .set({ minutesStatus: "recording" })
      .where(eq(meetings.id, meeting.id));
    console.log(`[Minutes] Agent dispatched for meeting ${meeting.id}`);
  } catch (e) {
    // فشل الاستدعاء لا يعطل الاجتماع — يبقى بلا محضر فقط
    console.error(`[Minutes] dispatch failed for ${meeting.id}:`, (e as Error).message);
  }
}

// ────────────────────────────────────────────────────────────────────
// استقبال مقاطع التفريغ من العامل
// ────────────────────────────────────────────────────────────────────

export interface TranscriptSegmentInput {
  speakerIdentity: string;
  speakerName: string;
  text: string;
  startMs: number;
}

export async function ingestTranscriptSegments(
  meetingId: string,
  segments: TranscriptSegmentInput[],
): Promise<number> {
  const clean = segments
    .filter((s) => s.text?.trim() && s.speakerIdentity)
    .map((s) => ({
      meetingId,
      speakerIdentity: String(s.speakerIdentity).slice(0, 120),
      speakerName: String(s.speakerName || "متحدث").slice(0, 200),
      text: String(s.text).slice(0, 4000),
      startMs: Math.max(0, Math.floor(Number(s.startMs) || 0)),
    }));
  if (!clean.length) return 0;
  await db.insert(meetingTranscripts).values(clean);
  return clean.length;
}

export async function getTranscript(meetingId: string): Promise<MeetingTranscript[]> {
  return db
    .select()
    .from(meetingTranscripts)
    .where(eq(meetingTranscripts.meetingId, meetingId))
    .orderBy(asc(meetingTranscripts.startMs));
}

// ────────────────────────────────────────────────────────────────────
// توليد المحضر
// ────────────────────────────────────────────────────────────────────

function formatTranscriptForLLM(rows: MeetingTranscript[]): string {
  return rows
    .map((r) => {
      const min = Math.floor(r.startMs / 60000);
      const sec = Math.floor((r.startMs % 60000) / 1000);
      return `[${min}:${String(sec).padStart(2, "0")}] ${r.speakerName}: ${r.text}`;
    })
    .join("\n");
}

const MINUTES_SYSTEM_PROMPT = `أنت «أمين المحضر» في صحيفة سبق. تستلم تفريغاً نصياً لاجتماع عمل بالعربية (قد يتضمن لهجات سعودية) وتُخرج محضراً منظماً بصيغة JSON فقط:
{
  "summary": "ملخص تنفيذي من ٣-٦ جمل بالفصحى الواضحة",
  "decisions": ["قرار ١", "..."],
  "actionItems": [{"task": "المهمة", "owner": "اسم صاحبها كما ورد أو null", "due": "الموعد إن ذُكر أو null"}],
  "deferred": ["نقطة أُجّل بحثها", "..."]
}
قواعد: لا تختلق ما لم يُقل؛ انسب المهمة لصاحبها فقط إذا كان واضحاً؛ تجاهل الدردشة الجانبية والترحيب؛ لو كان التفريغ قصيراً أو بلا مضمون فأعد ملخصاً صادقاً بذلك ومصفوفات فارغة.`;

export async function generateMinutes(meetingId: string): Promise<MeetingMinutes | null> {
  const [meeting] = await db.select().from(meetings).where(eq(meetings.id, meetingId)).limit(1);
  if (!meeting || !meeting.minutesEnabled) return null;

  const rows = await getTranscript(meetingId);
  if (!rows.length) {
    await db
      .update(meetings)
      .set({ minutesStatus: "failed" })
      .where(eq(meetings.id, meetingId));
    return null;
  }

  await db
    .update(meetings)
    .set({ minutesStatus: "generating" })
    .where(eq(meetings.id, meetingId));

  try {
    // تفريغ طويل جداً يُقص من بدايته — الأهم عادة في نهاية الاجتماع (القرارات)
    const transcriptText = formatTranscriptForLLM(rows).slice(-180_000);
    const completion = await aiGateway.complete({
      feature: "meeting-minutes",
      messages: [
        { role: "system", content: MINUTES_SYSTEM_PROMPT },
        {
          role: "user",
          content: `عنوان الاجتماع: ${meeting.title}\n\nالتفريغ:\n${transcriptText}`,
        },
      ],
      options: { jsonMode: true, maxTokens: 4000 },
      timeoutMs: 120_000,
    });

    const raw = JSON.parse(completion.content || "{}");
    const minutes: MeetingMinutes = {
      summary: String(raw.summary || ""),
      decisions: Array.isArray(raw.decisions) ? raw.decisions.map(String) : [],
      actionItems: Array.isArray(raw.actionItems)
        ? raw.actionItems.map((a: any) => ({
            task: String(a?.task || ""),
            owner: a?.owner ? String(a.owner) : null,
            due: a?.due ? String(a.due) : null,
          })).filter((a: { task: string }) => a.task)
        : [],
      deferred: Array.isArray(raw.deferred) ? raw.deferred.map(String) : [],
    };

    await db
      .update(meetings)
      .set({ minutesStatus: "draft", minutes, minutesGeneratedAt: new Date() })
      .where(eq(meetings.id, meetingId));
    logMeetingEvent(meetingId, "minutes_generated", {
      detail: { decisions: minutes.decisions.length, actionItems: minutes.actionItems.length },
    });
    return minutes;
  } catch (e) {
    console.error(`[Minutes] generation failed for ${meetingId}:`, (e as Error).message);
    await db
      .update(meetings)
      .set({ minutesStatus: "failed" })
      .where(eq(meetings.id, meetingId));
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────
// المراجعة والاعتماد والتوزيع
// ────────────────────────────────────────────────────────────────────

export async function updateDraftMinutes(
  meetingId: string,
  minutes: MeetingMinutes,
): Promise<void> {
  await db
    .update(meetings)
    .set({ minutes })
    .where(and(eq(meetings.id, meetingId), eq(meetings.minutesStatus, "draft")));
}

function minutesToHtml(meeting: Meeting, minutes: MeetingMinutes): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const list = (items: string[]) =>
    items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "<p>—</p>";
  const actions = minutes.actionItems.length
    ? `<ul>${minutes.actionItems
        .map(
          (a) =>
            `<li>${esc(a.task)}${a.owner ? ` — <b>${esc(a.owner)}</b>` : ""}${a.due ? ` (الموعد: ${esc(a.due)})` : ""}</li>`,
        )
        .join("")}</ul>`
    : "<p>—</p>";
  return `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.9">
    <h2>محضر اجتماع: ${esc(meeting.title)}</h2>
    <h3>الملخص</h3><p>${esc(minutes.summary)}</p>
    <h3>القرارات</h3>${list(minutes.decisions)}
    <h3>المهام</h3>${actions}
    <h3>نقاط مؤجلة</h3>${list(minutes.deferred)}
    <p style="color:#888;font-size:12px">أُعد هذا المحضر آلياً بواسطة «أمين المحضر» واعتمده مضيف الاجتماع.</p>
  </div>`;
}

export async function approveAndDistributeMinutes(meeting: Meeting): Promise<number> {
  if (!meeting.minutes || meeting.minutesStatus !== "draft") return 0;

  await db
    .update(meetings)
    .set({ minutesStatus: "approved", minutesApprovedAt: new Date() })
    .where(eq(meetings.id, meeting.id));
  logMeetingEvent(meeting.id, "minutes_approved", { actorUserId: meeting.hostUserId });

  // التوزيع بالبريد على المشاركين المقبولين أصحاب الحسابات
  const recipients = await db
    .select({ email: users.email, name: users.firstName })
    .from(meetingParticipants)
    .innerJoin(users, eq(meetingParticipants.userId, users.id))
    .where(
      and(
        eq(meetingParticipants.meetingId, meeting.id),
        eq(meetingParticipants.status, "admitted"),
      ),
    );

  const html = minutesToHtml(meeting, meeting.minutes);
  let sent = 0;
  for (const r of recipients) {
    if (!r.email) continue;
    try {
      const result = await sendEmailNotification({
        to: r.email,
        subject: `محضر اجتماع: ${meeting.title}`,
        html,
      });
      if (result.success) sent++;
    } catch {
      /* فشل بريد واحد لا يوقف البقية */
    }
  }
  console.log(`[Minutes] approved & distributed for ${meeting.id}: ${sent}/${recipients.length}`);
  return sent;
}

// ────────────────────────────────────────────────────────────────────
// التنظيف — حذف التفريغ الخام بعد ٣٠ يوماً (المحضر المعتمد يبقى)
// خانق يومي بسيط يُستدعى مع توليد المحضر وجلبه — بلا cron مستقل
// ────────────────────────────────────────────────────────────────────

let lastCleanupAt = 0;

export async function cleanupOldTranscripts(): Promise<void> {
  if (Date.now() - lastCleanupAt < 24 * 60 * 60 * 1000) return;
  lastCleanupAt = Date.now();
  try {
    const cutoff = new Date(Date.now() - TRANSCRIPT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await db
      .delete(meetingTranscripts)
      .where(lt(meetingTranscripts.createdAt, cutoff));
    console.log(`[Minutes] transcript cleanup ran (cutoff ${cutoff.toISOString()})`);
    void result;
  } catch (e) {
    lastCleanupAt = 0; // أعد المحاولة في الاستدعاء القادم
    console.error("[Minutes] cleanup failed:", (e as Error).message);
  }
}

/** إجمالي مقاطع التفريغ لاجتماع — للعرض في شاشة المضيف */
export async function getTranscriptStats(meetingId: string): Promise<{ segments: number; speakers: number }> {
  const [row] = await db
    .select({
      segments: sql<number>`count(*)::int`,
      speakers: sql<number>`count(distinct ${meetingTranscripts.speakerIdentity})::int`,
    })
    .from(meetingTranscripts)
    .where(eq(meetingTranscripts.meetingId, meetingId));
  return row || { segments: 0, speakers: 0 };
}
