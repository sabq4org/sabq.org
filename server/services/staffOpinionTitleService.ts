// «مكتب سبق» — تعديل عنوان مقال الرأي قبل الجدولة (2026-11-09).
// يكتب العنوان فقط على مسودة رأي بانتظار المكتب: لا يغيّر الحالة ولا الرابط
// (slug) ولا النص. يحترم قفل التحرير وقفل المسودات، ويسجّل نسخة في تاريخ المقال.

import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { articles, systemSettings, type Article } from "@shared/schema";
import { recordArticleSave } from "./articleHistoryService";
import { articleLockAllowsWriter, matchesArticleVersion, nextArticleVersion } from "./articleWriteVersion";
import { draftLockMessageFor } from "./draftLockService";
import { StaffOpinionDeskError } from "./staffOpinionDeskService";
import { opinionTitleEditKey, type OpinionTitleEditFlag } from "./staffOpinionTitleFlags";

export interface StaffOpinionTitleResult {
  article: { id: string; title: string; titleEdited: boolean };
  previous: { title: string };
  changed: boolean;
}

export async function editOpinionTitleFromDesk(input: {
  articleId: string;
  actorId: string;
  /** عنوان منظّف ومتحقق منه (staffOpinionTitleSchema). */
  title: string;
  /** العنوان الذي رآه العضو عند بدء التعديل (اختياري للتوافق). */
  expectedTitle?: string;
}): Promise<StaffOpinionTitleResult> {
  const [before] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.id, input.articleId), eq(articles.articleType, "opinion")))
    .limit(1);
  if (!before) throw new StaffOpinionDeskError(404, "not_found", "مقال الرأي غير موجود");
  if (before.status !== "draft") {
    throw new StaffOpinionDeskError(
      409,
      "conflict",
      before.status === "published"
        ? "المقال منشور؛ عدّل عنوانه من لوحة التحكم"
        : "المقال مجدول؛ تعديل العنوان من المكتب متاح قبل الجدولة فقط",
    );
  }
  if (input.expectedTitle !== undefined && input.expectedTitle !== before.title && before.title !== input.title) {
    throw new StaffOpinionDeskError(
      409,
      "conflict",
      "غيّر زميل العنوان قبل لحظات، فلم يُحفظ تعديلك. حدّث الصفحة وراجع العنوان الحالي.",
    );
  }
  if (before.title === input.title) {
    return {
      article: { id: before.id, title: before.title, titleEdited: false },
      previous: { title: before.title },
      changed: false,
    };
  }
  const lockMessage = await draftLockMessageFor(before.id, input.actorId);
  if (lockMessage) throw new StaffOpinionDeskError(409, "conflict", lockMessage);

  // عنوان محركات البحث يتبع العنوان فقط إن كان مطابقًا له قبل التعديل.
  const seo = (before.seo ?? null) as Article["seo"] | null;
  const seoPatch = seo && seo.metaTitle === before.title ? { seo: { ...seo, metaTitle: input.title } } : {};

  const [row] = await db
    .update(articles)
    .set({ title: input.title, ...seoPatch, updatedAt: nextArticleVersion } as Record<string, unknown>)
    .where(and(
      eq(articles.id, before.id),
      eq(articles.status, "draft"),
      matchesArticleVersion(new Date(before.updatedAt)),
      articleLockAllowsWriter(input.actorId),
    ))
    .returning();
  if (!row) {
    throw new StaffOpinionDeskError(
      409,
      "conflict",
      "عُدّل المقال أو فُتح للتحرير قبل لحظات، فلم يُحفظ العنوان. حدّث الصفحة وأعد المحاولة.",
    );
  }

  await recordArticleSave({
    before,
    after: row,
    actorId: input.actorId,
    summary: "عدّل مكتب سبق عنوان مقال الرأي",
    metadata: { channel: "staff-app", flow: "opinion-title" },
  }).catch((err) => console.error("[staff-opinion] title history record failed:", err));

  // العلامة تحفظ عنوان الكاتب الأصلي: تعديل ثانٍ لا يستبدله.
  const key = opinionTitleEditKey(before.id);
  try {
    const [existing] = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);
    const previousFlag = (existing?.value ?? null) as Partial<OpinionTitleEditFlag> | null;
    const flag: OpinionTitleEditFlag = {
      by: input.actorId,
      at: new Date().toISOString(),
      originalTitle:
        typeof previousFlag?.originalTitle === "string" ? previousFlag.originalTitle : before.title,
    };
    await db
      .insert(systemSettings)
      .values({ key, value: flag as unknown as Record<string, unknown>, category: "staff_app", isPublic: false })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: flag as unknown as Record<string, unknown>, updatedAt: new Date() },
      });
  } catch (err) {
    console.error("[staff-opinion] title flag write failed:", err instanceof Error ? err.message : err);
  }

  return {
    article: { id: row.id, title: row.title, titleEdited: true },
    previous: { title: before.title },
    changed: true,
  };
}
