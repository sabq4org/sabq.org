// «صوتي» لكاتب الرأي: حفظ التسجيل في التخزين الخاص، استنساخ الصوت في ElevenLabs
// في الخلفية، استماع تجريبي بفقرة من مقاله، وسحب الموافقة مع الحذف النهائي.
// صف واحد لكل كاتب في opinion_writer_voices؛ آمن مع أكثر من نسخة خادم لأن الحالة في القاعدة.

import { randomUUID } from "crypto";
import { and, desc, eq, isNotNull, lte, or } from "drizzle-orm";
import { articles, notificationsInbox, opinionWriterVoices, users, type OpinionWriterVoice } from "@shared/schema";
import {
  WRITER_VOICE_CONSENT_VERSION,
  WRITER_VOICE_MAX_BYTES,
  WRITER_VOICE_SAMPLE_RETENTION_DAYS,
  buildWriterVoicePreviewText,
  checkWriterVoiceDuration,
  normalizeWriterVoiceMime,
  writerVoiceSampleDeletesAt,
  type WriterVoiceStateDto,
} from "@shared/writerVoice";
import { db } from "../db";
import { ObjectStorageService } from "../objectStorage";
import { notificationBus } from "../notificationBus";
import { getElevenLabsService } from "./elevenlabs";

export class WriterVoiceError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** تسجيل عالق في «التجهيز» أكثر من هذا يُعدّ فاشلًا (نسخة الخادم توقفت أثناءه). */
const PROCESSING_STALE_MS = 10 * 60 * 1000;
const PREVIEW_MODEL = "eleven_multilingual_v2";
const VOICE_DEEPLINK = "/dashboard/opinion-author/voice";

function stripHtml(html: string | null | undefined): string {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isStaleProcessing(row: Pick<OpinionWriterVoice, "status" | "updatedAt">, now = Date.now()): boolean {
  return row.status === "processing" && now - row.updatedAt.getTime() > PROCESSING_STALE_MS;
}

export function toWriterVoiceState(row: OpinionWriterVoice | null): WriterVoiceStateDto {
  if (!row || row.status === "deleted") {
    return {
      status: "none",
      consentVersion: null,
      consentedAt: null,
      readyAt: null,
      sampleSeconds: null,
      hasSample: false,
      hasPreview: false,
      sampleDeletesAt: null,
      errorMessage: null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }
  const stale = isStaleProcessing(row);
  const deletesAt = row.sampleStorageKey ? writerVoiceSampleDeletesAt(row.readyAt) : null;
  return {
    status: stale ? "failed" : (row.status as WriterVoiceStateDto["status"]),
    consentVersion: row.consentVersion,
    consentedAt: row.consentedAt?.toISOString() ?? null,
    readyAt: row.readyAt?.toISOString() ?? null,
    sampleSeconds: row.sampleSeconds,
    hasSample: !!row.sampleStorageKey,
    hasPreview: !!row.previewStorageKey,
    sampleDeletesAt: deletesAt?.toISOString() ?? null,
    errorMessage: stale ? "توقف التجهيز قبل أن يكتمل. سجّل مرة أخرى." : row.errorMessage,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getWriterVoiceRow(userId: string): Promise<OpinionWriterVoice | null> {
  const [row] = await db.select().from(opinionWriterVoices).where(eq(opinionWriterVoices.userId, userId)).limit(1);
  return row ?? null;
}

export async function getWriterVoiceState(userId: string): Promise<WriterVoiceStateDto> {
  return toWriterVoiceState(await getWriterVoiceRow(userId));
}

function friendlyCloneError(error: unknown): string {
  const status = (error as { status?: number })?.status;
  const msg = error instanceof Error ? error.message.toLowerCase() : "";
  if (status === 400 || status === 422 || msg.includes("audio")) {
    return "لم نتمكن من استخدام هذا التسجيل. أعد التسجيل في مكان هادئ وبصوت واضح.";
  }
  if (msg.includes("voice_limit") || msg.includes("limit")) {
    return "اكتملت سعة الأصوات في الحساب. أبلغنا الإدارة، ويمكنك المحاولة لاحقًا.";
  }
  return "تعذر تجهيز صوتك الآن. حاول مرة أخرى بعد قليل.";
}

async function deletePrivateQuietly(storage: ObjectStorageService, key: string | null | undefined, what: string) {
  if (!key) return;
  try {
    await storage.deletePrivateDocument(key);
  } catch (error) {
    console.error(`[WriterVoice] delete ${what} failed:`, error instanceof Error ? error.message : error);
  }
}

async function latestPublishedOpinionText(userId: string): Promise<string> {
  const [row] = await db
    .select({ content: articles.content, excerpt: articles.excerpt })
    .from(articles)
    .where(
      and(
        eq(articles.articleType, "opinion"),
        eq(articles.status, "published"),
        or(eq(articles.authorId, userId), eq(articles.submitterId, userId)),
      ),
    )
    .orderBy(desc(articles.publishedAt))
    .limit(1);
  return stripHtml(row?.content) || stripHtml(row?.excerpt);
}

export async function submitWriterVoiceSample(input: {
  userId: string;
  consent: boolean;
  consentVersion: string;
  durationSeconds: number;
  buffer: Buffer;
  mimeType: string;
}): Promise<WriterVoiceStateDto> {
  if (!input.consent || input.consentVersion !== WRITER_VOICE_CONSENT_VERSION) {
    throw new WriterVoiceError(400, "CONSENT_REQUIRED", "يلزم الموافقة على استخدام صوتك قبل الإرسال");
  }
  const media = normalizeWriterVoiceMime(input.mimeType);
  if (!media) throw new WriterVoiceError(400, "BAD_FORMAT", "صيغة التسجيل غير مدعومة");
  if (!input.buffer?.length || input.buffer.length < 8 * 1024) {
    throw new WriterVoiceError(400, "EMPTY", "التسجيل فارغ أو قصير جدًا");
  }
  if (input.buffer.length > WRITER_VOICE_MAX_BYTES) {
    throw new WriterVoiceError(413, "TOO_LARGE", "حجم التسجيل أكبر من المسموح");
  }
  const duration = Math.round(input.durationSeconds);
  const durationCheck = checkWriterVoiceDuration(duration);
  if (durationCheck === "too_short") throw new WriterVoiceError(400, "TOO_SHORT", "التسجيل أقصر من 45 ثانية");
  if (durationCheck === "too_long") throw new WriterVoiceError(400, "TOO_LONG", "التسجيل أطول من دقيقتين");

  const service = getElevenLabsService();
  if (!service) throw new WriterVoiceError(503, "NOT_CONFIGURED", "خدمة الصوت غير مفعّلة حاليًا");

  const previous = await getWriterVoiceRow(input.userId);
  if (previous && previous.status === "processing" && !isStaleProcessing(previous)) {
    throw new WriterVoiceError(409, "PROCESSING", "نجهّز تسجيلك السابق الآن. انتظر حتى يكتمل");
  }

  const storage = new ObjectStorageService();
  const logicalKey = `opinion-writer-voices/${input.userId}/${randomUUID()}.${media.ext}`;
  const stored = await storage.uploadPrivateDocument(logicalKey, input.buffer, media.mime);
  const sampleKey = stored.path || logicalKey;
  const now = new Date();

  const fields = {
    status: "processing",
    consentVersion: WRITER_VOICE_CONSENT_VERSION,
    consentedAt: now,
    consentWithdrawnAt: null,
    sampleStorageKey: sampleKey,
    sampleMime: media.mime,
    sampleBytes: input.buffer.length,
    sampleSeconds: duration,
    sampleDeletedAt: null,
    errorMessage: null,
    updatedAt: now,
  };
  const [row] = await db
    .insert(opinionWriterVoices)
    .values({ userId: input.userId, ...fields })
    .onConflictDoUpdate({ target: opinionWriterVoices.userId, set: fields })
    .returning();

  void finishWriterVoiceClone({
    userId: input.userId,
    buffer: input.buffer,
    media,
    sampleKey,
    previous: previous && previous.status === "ready" ? previous : null,
  });

  return toWriterVoiceState(row);
}

async function finishWriterVoiceClone(job: {
  userId: string;
  buffer: Buffer;
  media: { mime: string; ext: string };
  sampleKey: string;
  previous: OpinionWriterVoice | null;
}): Promise<void> {
  const storage = new ObjectStorageService();
  const service = getElevenLabsService();
  let newVoiceId: string | null = null;
  try {
    if (!service) throw new Error("ElevenLabs not configured");
    const clone = await service.cloneVoiceFromSample({
      name: `sabq-writer-${job.userId.slice(0, 8)}`,
      description: `Sabq opinion writer voice, own articles only (consent ${WRITER_VOICE_CONSENT_VERSION})`,
      file: job.buffer,
      mimeType: job.media.mime,
      fileName: `sample.${job.media.ext}`,
      labels: { source: "sabq", use: "opinion-writer-own-articles" },
    });
    newVoiceId = clone.voice_id;

    let previewKey: string | null = null;
    try {
      const text = buildWriterVoicePreviewText(await latestPublishedOpinionText(job.userId));
      const audio = await service.textToSpeech({ text, voiceId: newVoiceId, model: PREVIEW_MODEL, language: "ar" }, 45_000);
      const key = `opinion-writer-voices/${job.userId}/preview-${randomUUID()}.mp3`;
      const saved = await storage.uploadPrivateDocument(key, audio, "audio/mpeg");
      previewKey = saved.path || key;
    } catch (error) {
      // الاستماع التجريبي إضافة: فشله لا يُفشل الصوت.
      console.error("[WriterVoice] preview failed:", error instanceof Error ? error.message : error);
    }

    const readyAt = new Date();
    const updated = await db
      .update(opinionWriterVoices)
      .set({
        status: "ready",
        elevenlabsVoiceId: newVoiceId,
        previewStorageKey: previewKey,
        readyAt,
        errorMessage: null,
        updatedAt: readyAt,
      })
      .where(and(eq(opinionWriterVoices.userId, job.userId), eq(opinionWriterVoices.sampleStorageKey, job.sampleKey)))
      .returning({ id: opinionWriterVoices.id });

    if (updated.length === 0) {
      // سحب الكاتب موافقته أو بدأ تسجيلًا آخر أثناء التجهيز: لا نُبقي صوتًا يتيمًا.
      await service.deleteVoiceStrict(newVoiceId).catch(() => {});
      await deletePrivateQuietly(storage, previewKey, "orphan preview");
      return;
    }

    if (job.previous) {
      if (job.previous.elevenlabsVoiceId && job.previous.elevenlabsVoiceId !== newVoiceId) {
        await service.deleteVoiceStrict(job.previous.elevenlabsVoiceId).catch((error) => {
          console.error("[WriterVoice] old voice delete failed:", error instanceof Error ? error.message : error);
        });
      }
      await deletePrivateQuietly(storage, job.previous.sampleStorageKey, "old sample");
      await deletePrivateQuietly(storage, job.previous.previewStorageKey, "old preview");
    }
    await notifyWriterVoiceReady(job.userId);
    console.log("[WriterVoice] voice ready");
  } catch (error) {
    console.error("[WriterVoice] clone failed:", error instanceof Error ? error.message : error);
    if (newVoiceId && service) await service.deleteVoiceStrict(newVoiceId).catch(() => {});
    await deletePrivateQuietly(storage, job.sampleKey, "failed sample");
    const message = friendlyCloneError(error);
    const prev = job.previous;
    const restore = prev
      ? {
          // فشل التسجيل الجديد: يبقى الصوت السابق كما كان.
          status: "ready",
          sampleStorageKey: prev.sampleStorageKey,
          sampleMime: prev.sampleMime,
          sampleBytes: prev.sampleBytes,
          sampleSeconds: prev.sampleSeconds,
          consentedAt: prev.consentedAt,
          errorMessage: `${message} ما زال صوتك السابق محفوظًا.`,
        }
      : { status: "failed", sampleStorageKey: null, sampleDeletedAt: new Date(), errorMessage: message };
    await db
      .update(opinionWriterVoices)
      .set({ ...restore, updatedAt: new Date() })
      .where(and(eq(opinionWriterVoices.userId, job.userId), eq(opinionWriterVoices.sampleStorageKey, job.sampleKey)))
      .catch((dbError) => console.error("[WriterVoice] failure state save failed:", dbError));
  }
}

async function notifyWriterVoiceReady(userId: string): Promise<void> {
  try {
    const type = "WriterVoiceReady";
    const title = "صوتك جاهز";
    const body = "استمع إلى صوتك يقرأ فقرة من مقالك في «صوتي».";
    await db.insert(notificationsInbox).values({ userId, type, title, body, deeplink: VOICE_DEEPLINK, read: false });
    notificationBus.emit(userId, { type, title, body, deeplink: VOICE_DEEPLINK });
  } catch (error) {
    console.error("[WriterVoice] notify failed:", error instanceof Error ? error.message : error);
  }
}

/**
 * سحب الموافقة: يحذف الصوت من ElevenLabs أولًا، ثم التسجيل والاستماع التجريبي من التخزين.
 * إن فشل حذف ElevenLabs لا نغيّر شيئًا ليعيد الكاتب المحاولة.
 */
export async function withdrawWriterVoice(userId: string): Promise<WriterVoiceStateDto> {
  const row = await getWriterVoiceRow(userId);
  if (!row || row.status === "deleted") return toWriterVoiceState(null);
  if (row.status === "processing" && !isStaleProcessing(row)) {
    throw new WriterVoiceError(409, "PROCESSING", "انتظر حتى يكتمل تجهيز صوتك ثم احذفه");
  }
  if (row.elevenlabsVoiceId) {
    const service = getElevenLabsService();
    if (!service) throw new WriterVoiceError(503, "NOT_CONFIGURED", "تعذر الوصول لخدمة الصوت الآن. حاول بعد قليل");
    try {
      await service.deleteVoiceStrict(row.elevenlabsVoiceId);
    } catch (error) {
      console.error("[WriterVoice] withdraw voice delete failed:", error instanceof Error ? error.message : error);
      throw new WriterVoiceError(502, "DELETE_FAILED", "تعذر حذف صوتك الآن. حاول بعد قليل");
    }
  }
  const storage = new ObjectStorageService();
  await deletePrivateQuietly(storage, row.sampleStorageKey, "sample");
  await deletePrivateQuietly(storage, row.previewStorageKey, "preview");
  const now = new Date();
  const [updated] = await db
    .update(opinionWriterVoices)
    .set({
      status: "deleted",
      consentWithdrawnAt: now,
      elevenlabsVoiceId: null,
      sampleStorageKey: null,
      previewStorageKey: null,
      sampleDeletedAt: row.sampleStorageKey ? now : row.sampleDeletedAt,
      errorMessage: null,
      updatedAt: now,
    })
    .where(eq(opinionWriterVoices.userId, userId))
    .returning();
  return toWriterVoiceState(updated ?? null);
}

/** رابط مؤقت (5 دقائق) لتسجيل الكاتب أو للاستماع التجريبي. */
export async function getWriterVoiceAudioUrl(userId: string, kind: "sample" | "preview"): Promise<string | null> {
  const row = await getWriterVoiceRow(userId);
  if (!row || row.status === "deleted") return null;
  const key = kind === "sample" ? row.sampleStorageKey : row.previewStorageKey;
  if (!key) return null;
  return new ObjectStorageService().getPrivateFileDownloadURL(key, 300);
}

export type WriterVoiceAdminRow = {
  userId: string;
  name: string;
  status: WriterVoiceStateDto["status"];
  consentedAt: string | null;
  readyAt: string | null;
  consentWithdrawnAt: string | null;
  sampleSeconds: number | null;
  hasSample: boolean;
  updatedAt: string;
};

/** قائمة الحالة للمسؤول: أسماء الكتّاب وحالة أصواتهم فقط، بلا مفاتيح أو معرفات ElevenLabs. */
export async function listWriterVoicesForAdmin(): Promise<WriterVoiceAdminRow[]> {
  const rows = await db
    .select({ voice: opinionWriterVoices, firstName: users.firstName, lastName: users.lastName })
    .from(opinionWriterVoices)
    .leftJoin(users, eq(opinionWriterVoices.userId, users.id))
    .orderBy(desc(opinionWriterVoices.updatedAt));
  return rows.map(({ voice, firstName, lastName }) => {
    const state = toWriterVoiceState(voice);
    return {
      userId: voice.userId,
      name: [firstName, lastName].filter(Boolean).join(" ").trim() || "كاتب",
      status: voice.status === "deleted" ? "deleted" : state.status,
      consentedAt: voice.consentedAt?.toISOString() ?? null,
      readyAt: voice.readyAt?.toISOString() ?? null,
      consentWithdrawnAt: voice.consentWithdrawnAt?.toISOString() ?? null,
      sampleSeconds: voice.sampleSeconds,
      hasSample: !!voice.sampleStorageKey,
      updatedAt: voice.updatedAt.toISOString(),
    };
  });
}

/** مهمة يومية: حذف التسجيل الأصلي بعد 30 يومًا من تجهيز الصوت (يبقى الصوت المستنسخ). */
export async function purgeExpiredWriterVoiceSamples(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - WRITER_VOICE_SAMPLE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const due = await db
    .select({ id: opinionWriterVoices.id, key: opinionWriterVoices.sampleStorageKey })
    .from(opinionWriterVoices)
    .where(
      and(
        eq(opinionWriterVoices.status, "ready"),
        isNotNull(opinionWriterVoices.sampleStorageKey),
        lte(opinionWriterVoices.readyAt, cutoff),
      ),
    )
    .limit(200);
  const storage = new ObjectStorageService();
  let purged = 0;
  for (const row of due) {
    if (!row.key) continue;
    try {
      await storage.deletePrivateDocument(row.key);
      await db
        .update(opinionWriterVoices)
        .set({ sampleStorageKey: null, sampleDeletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(opinionWriterVoices.id, row.id), eq(opinionWriterVoices.sampleStorageKey, row.key)));
      purged += 1;
    } catch (error) {
      console.error("[WriterVoice] purge failed:", error instanceof Error ? error.message : error);
    }
  }
  return purged;
}
