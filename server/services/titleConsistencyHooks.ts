// ----------------------------------------------------------------------------
// ربط فحص الظل للعنوان بـ storage.createArticle / storage.updateArticle.
//
// server/storage.ts فوق حد max-lines (21100) فأي تعديل عليه يُسقط lint في CI؛
// لذلك نلفّ الدالتين على النسخة من الخارج مرة واحدة عند تسجيل المسارات.
// اللفّ ينتظر الكتابة الأصلية ثم يجدول الفحص؛ لا يغيّر المدخل ولا الناتج ولا
// الأخطاء، وأي خلل فيه نفسه يُبتلع. عند إطفاء الميزة الجدولة تعود فوراً.
// ----------------------------------------------------------------------------

import type { Article, InsertArticle } from "@shared/schema";
import { scheduleTitleConsistencyCheck } from "./titleConsistencyService";

type ArticleWriter = {
  createArticle(article: InsertArticle, ...rest: never[]): Promise<Article>;
  updateArticle(id: string, articleData: Partial<InsertArticle>): Promise<Article>;
};

const INSTALLED = Symbol.for("sabq.titleCheckHooks");

function notify(article: Article | undefined, touched: boolean): void {
  try {
    scheduleTitleConsistencyCheck(article, { touched });
  } catch {
    // scheduleTitleConsistencyCheck لا يرمي؛ هذا حزام أمان إضافي للكتابة.
  }
}

export function installTitleCheckStorageHooks(target: ArticleWriter): void {
  const marked = target as ArticleWriter & { [INSTALLED]?: boolean };
  if (marked[INSTALLED]) return;
  marked[INSTALLED] = true;

  const originalCreate = target.createArticle.bind(target);
  const originalUpdate = target.updateArticle.bind(target);

  target.createArticle = async (article: InsertArticle, ...rest: never[]) => {
    const created = await originalCreate(article, ...rest);
    notify(created, true);
    return created;
  };

  target.updateArticle = async (id: string, articleData: Partial<InsertArticle>) => {
    const updated = await originalUpdate(id, articleData);
    const data = (articleData ?? {}) as Record<string, unknown>;
    notify(updated, "title" in data || "content" in data || "status" in data);
    return updated;
  };
}
