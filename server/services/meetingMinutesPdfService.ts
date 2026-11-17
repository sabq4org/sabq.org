// ----------------------------------------------------------------------------
// محضر الاجتماع كملف PDF — تحميل البيانات، الأصول، والتحويل عبر Chromium
//
// القالب والنموذج في meetingMinutesDocument.ts (نقي). هنا: بناء الوثيقة من
// القاعدة، تضمين الشعار والخطوط، والتحويل إلى PDF بالنمط نفسه في
// officialLetterPdfService (Chromium النظام في صورة الإنتاج).
//
// الخطوط من server/fonts (تُنسخ للصورة في Dockerfile). خط العناوين
// «The Year of Handicrafts» اختياري: إن غاب ملفه تسقط العناوين إلى IBM Plex
// Sans Arabic ولا يفشل التوليد.
// ----------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  meetingParticipants,
  meetingTranscripts,
  staffJobTitles,
  staffProfiles,
  users,
  type Meeting,
} from "@shared/schema";
import {
  accessLabelFor,
  groupTranscriptTurns,
  renderMinutesPdfHtml,
  type MinutesDocument,
  type MinutesTranscript,
  type MinutesPdfAssets,
  type MinutesPerson,
} from "./meetingMinutesDocument";

// ─── الأصول ──────────────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".otf": "font/otf",
  ".ttf": "font/ttf",
};

function fileToDataUrl(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    if (!buf.length) return null;
    const mime = MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function firstExisting(candidates: string[]): string | null {
  for (const c of candidates) {
    const data = fileToDataUrl(c);
    if (data) return data;
  }
  return null;
}

let cachedAssets: MinutesPdfAssets | null = null;

/** تُقرأ مرة واحدة لكل عملية — ملفات ثابتة في الصورة */
export function loadMinutesPdfAssets(): MinutesPdfAssets {
  if (cachedAssets) return cachedAssets;
  const cwd = process.cwd();
  const brand = (name: string) =>
    firstExisting([
      path.join(cwd, "public/branding/identity", name),
      path.join(cwd, "dist/public/branding/identity", name),
    ]);
  const font = (...names: string[]) =>
    firstExisting(names.map((n) => path.join(cwd, "server/fonts", n)));
  cachedAssets = {
    logoWhite: brand("sabq-logo-white.svg"),
    mark: brand("sabq-mark.svg"),
    fonts: {
      displaySemiBold: font("TheYearofHandicrafts-SemiBold.otf"),
      displayBold: font("TheYearofHandicrafts-Bold.otf"),
      displayBlack: font("TheYearofHandicrafts-Black.otf"),
      bodyRegular: font("IBMPlexSansArabic-Regular.ttf", "NotoSansArabic-Regular.ttf"),
      bodySemiBold: font("IBMPlexSansArabic-SemiBold.ttf", "IBMPlexSansArabic-Bold.ttf", "NotoSansArabic-Bold.ttf"),
    },
  };
  return cachedAssets;
}

// ─── بناء الوثيقة من القاعدة ─────────────────────────────────────────────────

function displayName(row: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  officialFullNameAr?: string | null;
}): string {
  return (
    row.officialFullNameAr?.trim() ||
    [row.firstName, row.lastName].filter(Boolean).join(" ").trim() ||
    row.email ||
    "منسوب"
  );
}

async function loadPerson(userId: string): Promise<MinutesPerson> {
  const [row] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      jobTitle: staffJobTitles.nameAr,
    })
    .from(users)
    .leftJoin(staffProfiles, eq(staffProfiles.userId, users.id))
    .leftJoin(staffJobTitles, eq(staffJobTitles.id, staffProfiles.jobTitleId))
    .where(eq(users.id, userId))
    .limit(1);
  return row
    ? { name: displayName(row), title: row.jobTitle ?? null }
    : { name: "رئيس الاجتماع", title: null };
}

/**
 * يبني وثيقة المحضر: من حضر فعلاً (له وقت دخول)، ومن دُعي ولم يدخل، ورئيس
 * الاجتماع، وجدول الأعمال. يعيد null إن لم يكن للاجتماع محضر.
 */
export async function buildMinutesDocument(meeting: Meeting): Promise<MinutesDocument | null> {
  if (!meeting.minutes) return null;

  const [chair, rows] = await Promise.all([
    loadPerson(meeting.hostUserId),
    db
      .select({
        userId: meetingParticipants.userId,
        guestName: meetingParticipants.guestName,
        role: meetingParticipants.role,
        status: meetingParticipants.status,
        rsvp: meetingParticipants.rsvp,
        joinedAt: meetingParticipants.joinedAt,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        jobTitle: staffJobTitles.nameAr,
      })
      .from(meetingParticipants)
      .leftJoin(users, eq(users.id, meetingParticipants.userId))
      .leftJoin(staffProfiles, eq(staffProfiles.userId, meetingParticipants.userId))
      .leftJoin(staffJobTitles, eq(staffJobTitles.id, staffProfiles.jobTitleId))
      .where(eq(meetingParticipants.meetingId, meeting.id))
      .orderBy(asc(meetingParticipants.createdAt)),
  ]);

  const attendees: MinutesPerson[] = [chair];
  const absent: Array<{ name: string; reason: string }> = [];
  const seen = new Set<string>([meeting.hostUserId]);

  for (const r of rows) {
    if (r.userId && seen.has(r.userId)) continue;
    if (r.userId) seen.add(r.userId);
    const name = r.userId ? displayName(r) : `${r.guestName || "ضيف"} (ضيف)`;
    // من دخل ثم أخرجه المضيف حضر فعلاً — يُذكر في الحضور لا يُسقط من المحضر
    if (r.joinedAt && (r.status === "admitted" || r.status === "removed")) {
      attendees.push({ name, title: r.userId ? r.jobTitle ?? null : null });
    } else if (r.userId && ["invited", "pending", "admitted"].includes(r.status)) {
      // مدعو من المنسوبين لم يدخل — الضيف الذي لم يُقبل ليس «غائباً»
      absent.push({ name, reason: r.rsvp === "no" ? "اعتذر" : "لم يحضر" });
    }
  }

  const approver = meeting.minutesStatus === "approved" && meeting.minutesApprovedAt
    ? { by: chair, at: meeting.minutesApprovedAt }
    : null;

  return {
    meetingId: meeting.id,
    title: meeting.title,
    startedAt: meeting.startedAt,
    endedAt: meeting.endedAt,
    chair,
    attendees,
    absent,
    agenda: (Array.isArray(meeting.agenda) ? meeting.agenda : [])
      .map((a) => String(a?.title ?? "").trim())
      .filter(Boolean),
    accessLabel: accessLabelFor(meeting.accessType),
    minutes: meeting.minutes,
    approval: approver,
  };
}

/** سقف مقاطع الملحق — اجتماع من ساعات لا يولّد ملفاً بمئات الصفحات */
const TRANSCRIPT_MAX_SEGMENTS = 4000;

/** ملحق التفريغ لنسخة رئيس الاجتماع — يُستدعى فقط بعد التحقق أنه المضيف */
async function loadTranscriptAppendix(meetingId: string): Promise<MinutesTranscript> {
  const rows = await db
    .select({
      speakerIdentity: meetingTranscripts.speakerIdentity,
      speakerName: meetingTranscripts.speakerName,
      text: meetingTranscripts.text,
      startMs: meetingTranscripts.startMs,
    })
    .from(meetingTranscripts)
    .where(eq(meetingTranscripts.meetingId, meetingId))
    .orderBy(asc(meetingTranscripts.startMs))
    .limit(TRANSCRIPT_MAX_SEGMENTS + 1);
  const truncated = rows.length > TRANSCRIPT_MAX_SEGMENTS;
  return {
    turns: groupTranscriptTurns(truncated ? rows.slice(0, TRANSCRIPT_MAX_SEGMENTS) : rows),
    truncated,
  };
}

/** هل دخل هذا المستخدم الاجتماع فعلاً؟ (شرط التحميل لغير المضيف) */
export async function didUserAttend(meetingId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ joinedAt: meetingParticipants.joinedAt })
    .from(meetingParticipants)
    .where(
      and(
        eq(meetingParticipants.meetingId, meetingId),
        eq(meetingParticipants.userId, userId),
        eq(meetingParticipants.status, "admitted"),
      ),
    )
    .limit(1);
  return Boolean(row?.joinedAt);
}

/** قاعدة التحميل: المضيف/المدير دائماً؛ غيره بعد الاعتماد وإن كان قد حضر */
export function canDownloadMinutesPdf(input: {
  isHost: boolean;
  minutesStatus: string;
  attended: boolean;
}): boolean {
  if (input.isHost) return input.minutesStatus === "draft" || input.minutesStatus === "approved";
  return input.minutesStatus === "approved" && input.attended;
}

// ─── Chromium ────────────────────────────────────────────────────────────────

function resolveChromeExecutable(): string {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    "/usr/bin/sabq-chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* continue */
    }
  }
  throw new Error("CHROME_NOT_FOUND: لا يوجد Chromium لتوليد PDF");
}

async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.default.launch({
    headless: true,
    executablePath: resolveChromeExecutable(),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--font-render-hinting=none",
    ],
  });
  try {
    const page = await browser.newPage();
    // كل الأصول مضمّنة كـdata URL — لا طلبات شبكة من القالب
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, { waitUntil: "load", timeout: 45_000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

// متصفح واحد في كل مرة لكل نسخة خادم (Chromium ثقيل الذاكرة)، وكاش قصير
// بمفتاح يتغير بتغير المحضر أو حالته — التحميلات المتتالية بعد الاعتماد لا
// تشغّل Chromium كل مرة.
let renderChain: Promise<unknown> = Promise.resolve();
const pdfCache = new Map<string, { at: number; pdf: Buffer }>();
/** توليد جارٍ لكل مفتاح — طلبات متزامنة على الملف نفسه تنتظر توليداً واحداً */
const pdfInflight = new Map<string, Promise<Buffer | null>>();
/** سقف المنتظرين في الطابور: فوقه يُرفض الطلب بدل تراكم نسخ HTML في الذاكرة */
const PDF_MAX_QUEUED = 6;
let pdfQueued = 0;

export class MinutesPdfBusyError extends Error {
  constructor() {
    super("MINUTES_PDF_BUSY");
  }
}
const PDF_CACHE_TTL_MS = 10 * 60_000;
const PDF_CACHE_MAX = 8;

export function minutesPdfCacheKey(meeting: Meeting, hostCopy = false): string {
  return [
    // نسخة رئيس الاجتماع (بالتفريغ) ونسخة الحضور لا تتشاركان مدخل الكاش أبداً
    hostCopy ? "host" : "attendee",
    meeting.id,
    meeting.title,
    meeting.minutesStatus,
    meeting.minutesApprovedAt?.getTime() ?? 0,
    meeting.minutesGeneratedAt?.getTime() ?? 0,
    // تعديل المسودة أو حالة المهام يغيّر المحتوى دون تغيير الأوقات
    JSON.stringify(meeting.minutes ?? null).length,
    JSON.stringify(meeting.minutes ?? null).split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7),
  ].join(":");
}

export async function generateMinutesPdf(
  meeting: Meeting,
  opts: { includeTranscript?: boolean } = {},
): Promise<Buffer | null> {
  const hostCopy = opts.includeTranscript === true;
  const key = minutesPdfCacheKey(meeting, hostCopy);
  const hit = pdfCache.get(key);
  if (hit && Date.now() - hit.at < PDF_CACHE_TTL_MS) return hit.pdf;

  // single-flight: حضور يضغطون رابط البريد معاً بعد الاعتماد = توليد واحد
  const running = pdfInflight.get(key);
  if (running) return running;
  if (pdfQueued >= PDF_MAX_QUEUED) throw new MinutesPdfBusyError();

  pdfQueued += 1;
  const task = (async () => {
    const base = await buildMinutesDocument(meeting);
    if (!base) return null;
    const doc = hostCopy
      ? { ...base, transcript: await loadTranscriptAppendix(meeting.id) }
      : base;
    const html = renderMinutesPdfHtml(doc, loadMinutesPdfAssets());
    // متصفح واحد في كل مرة لكل نسخة خادم؛ فشل توليد لا يوقف ما بعده
    const job = renderChain.then(() => renderHtmlToPdf(html));
    renderChain = job.catch(() => undefined);
    const pdf = await job;
    pdfCache.set(key, { at: Date.now(), pdf });
    if (pdfCache.size > PDF_CACHE_MAX) {
      const oldest = [...pdfCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) pdfCache.delete(oldest[0]);
    }
    return pdf;
  })().finally(() => {
    pdfQueued -= 1;
    pdfInflight.delete(key);
  });
  pdfInflight.set(key, task);
  return task;
}
