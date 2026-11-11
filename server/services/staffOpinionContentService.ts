// «مكتب سبق» — تعديل نص مقال الرأي و/أو عنوانه من bot-desk API (2026-11-11).
// يكتب title وcontent (وupdatedAt) فقط على مسودة رأي بانتظار المكتب أو مقال
// مجدول: لا يغيّر الحالة ولا الموعد (scheduledAt) ولا الرابط (slug). النص يمر
// بتطبيع Bot Drafts نفسه (normalizeDraftContent ← sanitizeArticleHtml).
// يحترم قفل التحرير وقفل المسودات، ويسجّل نسخة في تاريخ المقال.
// metaTitle يتبع العنوان فقط إن كان مطابقًا له قبل التعديل (كتعديل العنوان في التطبيق).

import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { articles, type Article } from "@shared/schema";
import { resolveStaffOpinionArticleStatus } from "@shared/staffApp";
import { recordArticleSave } from "./articleHistoryService";
import { articleLockAllowsWriter, matchesArticleVersion, nextArticleVersion } from "./articleWriteVersion";
import { normalizeDraftContent } from "./botDraftsService";
import { draftLockMessageFor } from "./draftLockService";
import { StaffOpinionDeskError } from "./staffOpinionDeskService";
import { getOpinionPrepJob } from "./staffOpinionPrepareService";
import { recordOpinionTitleEditFlag } from "./staffOpinionTitleService";

export type OpinionEditField = "title" | "content";

export interface OpinionEditResult {
  changed: boolean;
  changedFields: OpinionEditField[];
  previous: { title: string; contentLength: number; status: string; scheduledAt: string | null };
  article: { id: string; title: string; contentLength: number; status: string; scheduledAt: string | null };
}

/** الحالات المسموح تعديلها: بانتظار المكتب (new_draft/in_prep) أو مجدول. */
export function assertOpinionEditable(row: {
  status: string | null;
  reviewStatus: string | null;
  source?: string | null;
}): void {
  if (row.status === "published") {
    throw new StaffOpinionDeskError(409, "conflict", "المقال منشور؛ عدّله من لوحة التحكم");
  }
  const resolved = resolveStaffOpinionArticleStatus(row);
  if (resolved !== "new_draft" && resolved !== "in_prep" && resolved !== "scheduled") {
    throw new StaffOpinionDeskError(
      409,
      "conflict",
      "التعديل متاح لمسودة رأي بانتظار المكتب أو لمقال مجدول فقط",
    );
  }
}

export async function editOpinionDraftFromDesk(input: {
  articleId: string;
  actorId: string;
  /** عنوان منظّف ومتحقق منه (botDeskOpinionEditSchema). */
  title?: string;
  content?: string;
  contentFormat?: "html" | "text";
}): Promise<OpinionEditResult> {
  const [before] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.id, input.articleId), eq(articles.articleType, "opinion")))
    .limit(1);
  if (!before) throw new StaffOpinionDeskError(404, "not_found", "مقال الرأي غير موجود");
  assertOpinionEditable(before);

  // «جهّز وجدول» يكتب النص والعنوان في نهايته: تعديل أثناءه سيضيع.
  const prep = await getOpinionPrepJob(before.id);
  if (prep?.status === "running") {
    throw new StaffOpinionDeskError(409, "conflict", "التجهيز جارٍ على هذا المقال؛ انتظر حتى ينتهي ثم أعد المحاولة");
  }

  const previous = {
    title: before.title,
    contentLength: (before.content ?? "").length,
    status: before.status,
    scheduledAt: before.scheduledAt ? new Date(before.scheduledAt).toISOString() : null,
  };

  const patch: { title?: string; content?: string; seo?: Article["seo"] } = {};
  if (input.title !== undefined && input.title !== before.title) patch.title = input.title;
  if (input.content !== undefined) {
    const normalized = normalizeDraftContent(input.content, input.contentFormat);
    if (normalized !== (before.content ?? "")) patch.content = normalized;
  }
  const changedFields = (["title", "content"] as const).filter((f) => patch[f] !== undefined);
  if (changedFields.length === 0) {
    return {
      changed: false,
      changedFields: [],
      previous,
      article: { id: before.id, ...previous },
    };
  }

  const lockMessage = await draftLockMessageFor(before.id, input.actorId);
  if (lockMessage) throw new StaffOpinionDeskError(409, "conflict", lockMessage);

  if (patch.title !== undefined) {
    const seo = (before.seo ?? null) as Article["seo"] | null;
    if (seo && seo.metaTitle === before.title) patch.seo = { ...seo, metaTitle: patch.title };
  }

  const [row] = await db
    .update(articles)
    .set({ ...patch, updatedAt: nextArticleVersion } as Record<string, unknown>)
    .where(and(
      eq(articles.id, before.id),
      // الحالة والموعد كما قرأناهما: لا نكتب على مقال نُشر أو أُعيدت جدولته للتو.
      eq(articles.status, before.status),
      before.scheduledAt ? eq(articles.scheduledAt, before.scheduledAt) : isNull(articles.scheduledAt),
      matchesArticleVersion(new Date(before.updatedAt)),
      articleLockAllowsWriter(input.actorId),
    ))
    .returning();
  if (!row) {
    throw new StaffOpinionDeskError(
      409,
      "conflict",
      "عُدّل المقال أو فُتح للتحرير أو تغيّرت حالته قبل لحظات، فلم يُحفظ التعديل. اجلب المقال وأعد المحاولة.",
    );
  }

  await recordArticleSave({
    before,
    after: row,
    actorId: input.actorId,
    summary: "عدّل مكتب سبق مقال الرأي",
    metadata: { channel: "bot-desk-api", flow: "opinion-edit", fields: changedFields },
  }).catch((err) => console.error("[staff-opinion] edit history record failed:", err));

  if (patch.title !== undefined) {
    await recordOpinionTitleEditFlag(before.id, input.actorId, before.title);
  }

  return {
    changed: true,
    changedFields: [...changedFields],
    previous,
    article: {
      id: row.id,
      title: row.title,
      contentLength: (row.content ?? "").length,
      status: row.status,
      scheduledAt: row.scheduledAt ? new Date(row.scheduledAt).toISOString() : null,
    },
  };
}
