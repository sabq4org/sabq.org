// تعارض موعد مقال رأي مع مقال كاتب آخر مجدول في الدقيقة نفسها.
// منطق خالص بلا قاعدة بيانات: تطبيق الديسك ينبّه ولا يمنع (قرار المالك 2026-10-28).
import type {
  StaffOpinionSlotClashWarning,
  StaffOpinionWriterGapWarning,
} from "@shared/staffApp";
import { formatOpinionSlotRiyadh } from "./opinionDraftDeskNotice";

export interface OpinionSlotCandidate {
  articleId: string;
  writerId: string | null;
  writerName: string;
  scheduledAt: Date;
}

const MINUTE_MS = 60_000;

/** الدقيقة نفسها: نقارن بعد إسقاط الثواني (المواعيد تُختار بالدقيقة). */
export function isSameScheduleMinute(a: Date, b: Date): boolean {
  return Math.floor(a.getTime() / MINUTE_MS) === Math.floor(b.getTime() / MINUTE_MS);
}

/**
 * مقالات كتّاب آخرين مجدولة في الدقيقة نفسها. يُستثنى المقال نفسه ومقالات
 * الكاتب نفسه (تلك تحكمها قاعدة الفاصل الأسبوعي في scheduleApprovedOpinionArticle).
 */
export function findOpinionSlotClashes(input: {
  scheduledAt: Date;
  articleId: string;
  writerId: string | null;
  candidates: readonly OpinionSlotCandidate[];
}): OpinionSlotCandidate[] {
  if (Number.isNaN(input.scheduledAt.getTime())) return [];
  const seen = new Set<string>();
  return input.candidates.filter((c) => {
    if (c.articleId === input.articleId || seen.has(c.articleId)) return false;
    if (input.writerId && c.writerId === input.writerId) return false;
    if (!isSameScheduleMinute(c.scheduledAt, input.scheduledAt)) return false;
    seen.add(c.articleId);
    return true;
  });
}

export function buildOpinionSlotClashWarnings(
  clashes: readonly OpinionSlotCandidate[],
): StaffOpinionSlotClashWarning[] {
  return clashes.map((c) => ({
    code: "slot_clash" as const,
    message: `تنبيه: الكاتب ${c.writerName} مجدول في الموعد نفسه`,
    otherWriterName: c.writerName,
    otherArticleId: c.articleId,
  }));
}

export interface OpinionWriterGapCandidate {
  articleId: string;
  title: string | null;
  status: string;
  at: Date;
}

/**
 * تحذير «الفاصل الأسبوعي» للكاتب نفسه — نفس التعارض الذي ترفض به الجدولة 409
 * ما لم يُرسل overrideWeeklyGap=true. blocking=true ليعرف المستدعي ذلك مسبقاً.
 */
export function buildWriterGapWarnings(
  conflicts: readonly OpinionWriterGapCandidate[],
): StaffOpinionWriterGapWarning[] {
  return conflicts.map((c) => {
    const verb = c.status === "published" ? "منشور" : "مجدول";
    const title = c.title?.trim() ? `«${c.title.trim()}» ` : "";
    return {
      code: "writer_gap" as const,
      message: `هذا الموعد قريب من مقال آخر للكاتب نفسه: ${title}${verb} ${formatOpinionSlotRiyadh(c.at)}. الفاصل المطلوب أسبوع؛ أرسل overrideWeeklyGap=true للتجاوز.`,
      otherArticleId: c.articleId,
      otherTitle: c.title ?? null,
      otherStatus: c.status,
      otherAt: c.at.toISOString(),
      blocking: true as const,
    };
  });
}
