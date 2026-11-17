// ----------------------------------------------------------------------------
// «مُدوِّن سبق AI» — خدمة التفريغ والمحضر الآلي لاجتماعات سبق (ADR-001)
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
import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import { AgentDispatchClient } from "livekit-server-sdk";
import { db } from "../db";
import {
  meetings,
  meetingEvents,
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
import { loadMeetingVocabulary } from "./meetingVocabulary";

/** الاسم الظاهر للمستخدمين — الهوية التقنية تبقى AGENT_NAME */
export const MINUTES_AGENT_DISPLAY_NAME = "مُدوِّن سبق AI";

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

/** metadata الاستدعاء — يقرؤها meetings-agent/src/sttConfig.ts (parseJobMetadata) */
export function buildDispatchMetadata(meetingId: string, keyterms: readonly string[]): string {
  return JSON.stringify({ meetingId, keyterms: [...keyterms] });
}

export async function dispatchMinutesAgent(meeting: Meeting): Promise<void> {
  if (!meeting.minutesEnabled || !isMinutesAgentConfigured()) return;
  try {
    const client = new AgentDispatchClient(
      livekitHttpUrl(),
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
    );
    // أسماء المشاركين والأقسام → prompt التفريغ (الأسماء لا تُطبع، العدد فقط)
    const vocab = await loadMeetingVocabulary(meeting);
    await client.createDispatch(meeting.roomName, AGENT_NAME, {
      metadata: buildDispatchMetadata(meeting.id, vocab.keyterms),
    });
    await db
      .update(meetings)
      .set({ minutesStatus: "recording" })
      .where(eq(meetings.id, meeting.id));
    console.log(
      `[Minutes] Agent dispatched for meeting ${meeting.id} (keyterms: ${vocab.keyterms.length})`,
    );
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

export const MINUTES_SYSTEM_PROMPT = `أنت «${MINUTES_AGENT_DISPLAY_NAME}»، مساعد ذكاء اصطناعي يعد محاضر الاجتماعات في صحيفة سبق. تستلم تفريغاً نصياً آلياً لاجتماع عمل بالعربية (غالباً بلهجة سعودية) وتُخرج محضراً منظماً بصيغة JSON فقط:
{
  "summary": "ملخص تنفيذي من ٣-٦ جمل بالفصحى الواضحة",
  "decisions": ["قرار ١", "..."],
  "actionItems": [{"task": "المهمة", "owner": "اسم صاحبها كما ورد أو null", "due": "الموعد إن ذُكر أو null"}],
  "deferred": ["نقطة أُجّل بحثها", "..."]
}
قواعد:
- لا تختلق ما لم يُقل؛ انسب المهمة لصاحبها فقط إذا كان واضحاً.
- التفريغ آلي وقد يحوي مقاطع قصيرة بلا معنى أو كلمات مشوهة صوتياً (مثل حروف متلاصقة لا تكوّن كلمة): تجاهلها تماماً ولا تبنِ عليها قراراً أو مهمة.
- اعتمد على «قائمة الأسماء» المرفقة: إن ورد اسم مشوه يشبه اسماً فيها فاكتبه كما في القائمة، ولا تذكر اسماً من خارج التفريغ والقائمة.
- تجاهل الدردشة الجانبية والترحيب.
- لو كان التفريغ قصيراً أو بلا مضمون فأعد ملخصاً صادقاً بذلك ومصفوفات فارغة.`;

/** رسالة المستخدم لتوليد المحضر: العنوان + قائمة الأسماء والأقسام + التفريغ */
export function buildMinutesUserMessage(
  title: string,
  vocab: { names: readonly string[]; departments: readonly string[] },
  transcriptText: string,
): string {
  const names = vocab.names.slice(0, 120).join("، ") || "—";
  const departments = vocab.departments.slice(0, 40).join("، ") || "—";
  return `عنوان الاجتماع: ${title}\n\nقائمة الأسماء (المشاركون ومنسوبو الجهة): ${names}\nالأقسام: ${departments}\n\nالتفريغ:\n${transcriptText}`;
}

/**
 * متى يُسمح ببدء التوليد؟ (نقية — tests/unit/meetingsMinutesTiming.test.ts)
 *   • auto  — بعد انتهاء الاجتماع (إشارة العامل أو المؤقت الاحتياطي): مرة واحدة
 *     فقط، من «لم يبدأ/يسجَّل». لا يلمس مسودة أو معتمداً أو توليداً جارياً.
 *   • manual — «إعادة التوليد» من المضيف: من أي حالة عدا المعتمد والجاري.
 */
export const MINUTES_AUTO_FROM = ["none", "recording"] as const;
export const MINUTES_MANUAL_FROM = ["none", "recording", "failed", "draft"] as const;

export function canStartMinutesGeneration(
  status: string | null | undefined,
  trigger: "auto" | "manual",
): boolean {
  const allowed: readonly string[] = trigger === "auto" ? MINUTES_AUTO_FROM : MINUTES_MANUAL_FROM;
  return allowed.includes(status || "none");
}

/**
 * توليد محجوز منذ أكثر من ٥ دقائق = عالق (مهلة النموذج ١٢٠ث) — سقطت العملية
 * أثناءه (نشر). يُقاس من لحظة الحجز (حدث minutes_generation_started)، لا من
 * انتهاء الاجتماع؛ وإلا عُدّت إعادة توليد جارية لاجتماع قديم عالقة.
 */
export const STALE_GENERATION_MS = 5 * 60_000;
const GENERATION_STARTED_EVENT = "minutes_generation_started";

export function isStaleGeneration(
  claimedAt: Date | null | undefined,
  endedAt: Date | null | undefined,
  nowMs: number,
): boolean {
  const ref = claimedAt ?? endedAt;
  return Boolean(ref) && nowMs - ref!.getTime() > STALE_GENERATION_MS;
}

/**
 * كل قرار على حالة التوليد (حجز، تحرير عالق، كتابة نتيجة) يجري داخل معاملة تقفل
 * صف الاجتماع أولاً (SELECT … FOR UPDATE). في READ COMMITTED كل جملة بعد القفل
 * ترى ما التُزم قبله، فلا يحرر كنسٌ حجزاً بدأ للتو، ولا يكتب مولّد قديم نتيجته
 * فوق حجز غيره. هوية الحجز = معرّف حدث minutes_generation_started.
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockMinutesState(
  tx: Tx,
  meetingId: string,
): Promise<{ status: string; endedAt: Date | null } | null> {
  const [row] = await tx
    .select({ status: meetings.minutesStatus, endedAt: meetings.endedAt })
    .from(meetings)
    .where(eq(meetings.id, meetingId))
    .for("update");
  return row ?? null;
}

async function latestClaim(tx: Tx, meetingId: string): Promise<{ id: string; createdAt: Date } | null> {
  const [row] = await tx
    .select({ id: meetingEvents.id, createdAt: meetingEvents.createdAt })
    .from(meetingEvents)
    .where(
      and(
        eq(meetingEvents.meetingId, meetingId),
        eq(meetingEvents.eventType, GENERATION_STARTED_EVENT),
      ),
    )
    .orderBy(desc(meetingEvents.createdAt), desc(meetingEvents.id))
    .limit(1);
  return row ?? null;
}

/** يعيد التوليد العالق إلى «failed» — الفحص والتحرير تحت قفل الصف نفسه. true إن حُرِّر */
async function releaseIfStale(meetingId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const state = await lockMinutesState(tx, meetingId);
    if (!state || state.status !== "generating") return false;
    const claim = await latestClaim(tx, meetingId);
    if (!isStaleGeneration(claim?.createdAt, state.endedAt, Date.now())) return false;
    await tx.update(meetings).set({ minutesStatus: "failed" }).where(eq(meetings.id, meetingId));
    return true;
  });
}

/**
 * كنس التوليد العالق — يُستدعى من reconcile. بدونه يبقى المحضر «جارٍ التوليد»
 * بلا مخرج: زر «إعادة التوليد» يظهر في failed/draft فقط.
 */
export async function releaseStaleGenerations(): Promise<number> {
  const stuck = await db
    .select({ id: meetings.id, endedAt: meetings.endedAt })
    .from(meetings)
    .where(
      and(
        eq(meetings.status, "ended"),
        eq(meetings.minutesStatus, "generating"),
        gt(meetings.endedAt, new Date(Date.now() - 7 * 24 * 60 * 60_000)),
      ),
    )
    .limit(10);
  let released = 0;
  for (const m of stuck) {
    if (await releaseIfStale(m.id)) {
      released += 1;
      console.log(`[Minutes] released stale generation for ${m.id}`);
    }
  }
  return released;
}

/**
 * مهلة المؤقت الاحتياطي بعد انتهاء الاجتماع. العامل يرسل إشارة الاكتمال بعد
 * رفع آخر دفعة (عادةً خلال ~١٠ث: مهلة المقاطع النهائية + الرفع)، فالمؤقت لا
 * يعمل إلا إن تعطل العامل أو لم يُستدعَ أصلاً.
 */
export const MINUTES_FALLBACK_DELAY_MS = 45_000;

/**
 * حجز التوليد ذرّياً تحت قفل الصف: مولِّد واحد حتى لو تزامنت إشارة العامل مع
 * المؤقت أو مع نسخة خادم أخرى. يعيد معرّف الحجز أو null إن رُفض.
 * اليدوي فقط يستولي على حجز عالق (سقطت عمليته) — في المعاملة نفسها.
 */
export async function claimMinutesGeneration(
  meetingId: string,
  trigger: "auto" | "manual",
): Promise<string | null> {
  return db.transaction(async (tx) => {
    const state = await lockMinutesState(tx, meetingId);
    if (!state) return null;
    let status = state.status;
    if (status === "generating" && trigger === "manual") {
      const claim = await latestClaim(tx, meetingId);
      if (isStaleGeneration(claim?.createdAt, state.endedAt, Date.now())) status = "failed";
    }
    if (!canStartMinutesGeneration(status, trigger)) return null;
    await tx.update(meetings).set({ minutesStatus: "generating" }).where(eq(meetings.id, meetingId));
    const [event] = await tx
      .insert(meetingEvents)
      .values({ meetingId, eventType: GENERATION_STARTED_EVENT, detail: { trigger } })
      .returning({ id: meetingEvents.id });
    return event.id;
  });
}

/**
 * كتابة نتيجة التوليد بشرط أننا ما زلنا أصحاب الحجز: الحالة generating وآخر
 * حدث حجز هو حجزنا. غير ذلك (حُرِّر كعالق، أو حجز غيرنا، أو اعتُمد) → لا كتابة.
 */
export async function finishGeneration(
  meetingId: string,
  claimId: string,
  set: Partial<typeof meetings.$inferInsert>,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const state = await lockMinutesState(tx, meetingId);
    if (!state || state.status !== "generating") return false;
    const claim = await latestClaim(tx, meetingId);
    if (claim?.id !== claimId) return false;
    await tx.update(meetings).set(set).where(eq(meetings.id, meetingId));
    return true;
  });
}

export async function generateMinutes(
  meetingId: string,
  trigger: "auto" | "manual" = "manual",
): Promise<MeetingMinutes | null> {
  const [meeting] = await db.select().from(meetings).where(eq(meetings.id, meetingId)).limit(1);
  if (!meeting || !meeting.minutesEnabled) return null;
  const claimId = await claimMinutesGeneration(meetingId, trigger);
  if (!claimId) return null;

  const rows = await getTranscript(meetingId);
  if (!rows.length) {
    await finishGeneration(meetingId, claimId, { minutesStatus: "failed" });
    return null;
  }

  try {
    // تفريغ طويل جداً يُقص من بدايته — الأهم عادة في نهاية الاجتماع (القرارات)
    const transcriptText = formatTranscriptForLLM(rows).slice(-180_000);
    const vocab = await loadMeetingVocabulary(meeting);
    const completion = await aiGateway.complete({
      feature: "meeting-minutes",
      messages: [
        { role: "system", content: MINUTES_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildMinutesUserMessage(meeting.title, vocab, transcriptText),
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

    const written = await finishGeneration(meetingId, claimId, {
      minutesStatus: "draft",
      minutes,
      minutesGeneratedAt: new Date(),
    });
    // فقدنا الحجز (حُرِّر كعالق ثم سبقنا مولّد آخر/اعتماد) — لا نكتب فوق نتيجته
    if (!written) return null;
    logMeetingEvent(meetingId, "minutes_generated", {
      detail: { decisions: minutes.decisions.length, actionItems: minutes.actionItems.length },
    });
    return minutes;
  } catch (e) {
    console.error(`[Minutes] generation failed for ${meetingId}:`, (e as Error).message);
    await finishGeneration(meetingId, claimId, { minutesStatus: "failed" });
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────
// توقيت التوليد بعد انتهاء الاجتماع
//
// حادثة 2026-11-17: كان التوليد يبدأ لحظة حذف الغرفة (بفارق ~٠٫١ث)، قبل أن
// يرفع العامل دفعته الأخيرة — فتضيع نهاية الاجتماع، وإن لم يكن رُفع شيء بعد
// خرج «0 مقطع». الآن: العامل يرسل إشارة اكتمال بعد الرفع الأخير فنولّد عندها،
// ومؤقت احتياطي يغطي تعطل العامل. الحجز الذرّي يمنع التوليد المزدوج.
// ────────────────────────────────────────────────────────────────────

async function runAutoGeneration(meetingId: string, source: "agent" | "fallback"): Promise<void> {
  try {
    const minutes = await generateMinutes(meetingId, "auto");
    if (minutes) console.log(`[Minutes] generated for ${meetingId} (trigger: ${source})`);
    await cleanupOldTranscripts();
  } catch (e) {
    console.error(`[Minutes] ${source} generation failed for ${meetingId}:`, (e as Error).message);
  }
}

/** يُستدعى من endMeeting: لا توليد فوري — ننتظر إشارة العامل أو المهلة */
export function scheduleMinutesFallback(meetingId: string): void {
  const timer = setTimeout(() => void runAutoGeneration(meetingId, "fallback"), MINUTES_FALLBACK_DELAY_MS);
  // لا يُبقي العملية حية عند الإيقاف
  timer.unref?.();
}

/** ملخص ما سمعه العامل — أرقام وتشخيص فقط، بلا أسماء ولا نصوص */
export interface AgentCompletionSummary {
  tracks: number;
  audioSeconds: number;
  speechStarts: number;
  finals: number;
  uploaded: number;
  pending: number;
  diagnosis: string;
}

export function parseAgentCompletion(body: unknown): AgentCompletionSummary {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n * 10) / 10, 1_000_000) : 0;
  };
  return {
    tracks: num(b.tracks),
    audioSeconds: num(b.audioSeconds),
    speechStarts: num(b.speechStarts),
    finals: num(b.finals),
    uploaded: num(b.uploaded),
    pending: num(b.pending),
    diagnosis: typeof b.diagnosis === "string" ? b.diagnosis.slice(0, 60) : "unknown",
  };
}

/** إشارة العامل: اكتمل التفريغ ورُفعت آخر دفعة → سجّل ما سمعه وولّد المحضر */
export async function completeTranscription(
  meeting: Meeting,
  summary: AgentCompletionSummary,
): Promise<void> {
  console.log(
    `[Minutes] agent complete for ${meeting.id}: tracks=${summary.tracks} audio=${summary.audioSeconds}s ` +
      `speech=${summary.speechStarts} finals=${summary.finals} uploaded=${summary.uploaded} ` +
      `pending=${summary.pending} diagnosis=${summary.diagnosis}`,
  );
  logMeetingEvent(meeting.id, "transcription_completed", { detail: { ...summary } });
  // الاجتماع ما زال مباشراً (انقطع العامل وحده)؟ لا نولّد — ينتظر الإنهاء
  if (meeting.status !== "ended") return;
  void runAutoGeneration(meeting.id, "agent");
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
    <p style="color:#888;font-size:12px">أُعد هذا المحضر آلياً بواسطة «${MINUTES_AGENT_DISPLAY_NAME}» واعتمده مضيف الاجتماع.</p>
  </div>`;
}

/**
 * يعتمد المسودة ويوزعها بالبريد. يعيد عدد الرسائل المرسلة، أو null إن لم تكن
 * هناك مسودة تُعتمد (اعتُمدت للتو من طلب آخر) — فلا بريد مكرر.
 */
export async function approveAndDistributeMinutes(meeting: Meeting): Promise<number | null> {
  if (!meeting.minutes || meeting.minutesStatus !== "draft") return null;

  // المستلمون أولاً: لو فشل هذا الاستعلام لا يُعتمد المحضر بلا بريد
  // (المشاركون المقبولون أصحاب الحسابات)
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

  // اعتماد ذرّي: draft → approved مرة واحدة، والنص المرسل هو ما اعتُمد فعلاً
  const [approved] = await db
    .update(meetings)
    .set({ minutesStatus: "approved", minutesApprovedAt: new Date() })
    .where(and(eq(meetings.id, meeting.id), eq(meetings.minutesStatus, "draft")))
    .returning({ minutes: meetings.minutes });
  if (!approved?.minutes) return null;
  meeting = { ...meeting, minutes: approved.minutes, minutesStatus: "approved" };
  logMeetingEvent(meeting.id, "minutes_approved", { actorUserId: meeting.hostUserId });

  const html = minutesToHtml(meeting, approved.minutes);
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
