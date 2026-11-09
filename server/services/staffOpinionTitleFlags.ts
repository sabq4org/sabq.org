// «مكتب سبق» — علامة «عُدّل العنوان» على مقالات الرأي (2026-11-09).
// تُحفظ في system_settings (staff_app.opinion_title_edit:<articleId>) بلا
// أعمدة جديدة. تُقرأ دفعة واحدة للوحة الرأي، وتُكتب من staffOpinionTitleService.

import { inArray } from "drizzle-orm";
import { db } from "../db";
import { systemSettings } from "@shared/schema";

const TITLE_EDIT_KEY_PREFIX = "staff_app.opinion_title_edit:";

export interface OpinionTitleEditFlag {
  by: string;
  at: string;
  /** العنوان كما أرسله الكاتب قبل أول تعديل من المكتب. */
  originalTitle: string;
}

export function opinionTitleEditKey(articleId: string): string {
  return `${TITLE_EDIT_KEY_PREFIX}${articleId}`;
}

/** معرّفات المقالات التي عدّل المكتب عنوانها (من بين المعطاة فقط). */
export async function loadEditedOpinionTitleIds(articleIds: string[]): Promise<Set<string>> {
  const unique = [...new Set(articleIds.filter(Boolean))];
  if (unique.length === 0) return new Set();
  const rows = await db
    .select({ key: systemSettings.key })
    .from(systemSettings)
    .where(inArray(systemSettings.key, unique.map(opinionTitleEditKey)));
  return new Set(rows.map((row) => row.key.slice(TITLE_EDIT_KEY_PREFIX.length)));
}

/** يضع titleEdited على عناصر اللوحة. فشل القراءة لا يُسقط اللوحة. */
export async function markEditedOpinionTitles<
  T extends { article: { id: string; titleEdited?: boolean } | null },
>(items: T[]): Promise<void> {
  const ids = items.map((item) => item.article?.id ?? "").filter(Boolean);
  if (ids.length === 0) return;
  try {
    const edited = await loadEditedOpinionTitleIds(ids);
    for (const item of items) {
      if (item.article && edited.has(item.article.id)) item.article.titleEdited = true;
    }
  } catch (err) {
    console.error("[staff-opinion] title flags read failed:", err instanceof Error ? err.message : err);
  }
}
