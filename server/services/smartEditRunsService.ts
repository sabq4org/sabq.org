// سجل «تحرير وتوليد شامل» (ADR-001: استعلامات الميزة هنا فقط).
// - التسجيل تلقائي من الخادم بعد كل تشغيل، ولا يؤخر الرد ولا يفشله.
// - الربط بالخبر: رقم الخبر من المحرر إن وُجد، وإلا عند أول حفظ لصاحب التشغيل
//   إن تطابق النص المحفوظ مع المدخل أو الناتج (shared/smartEditRuns.ts).
// - البصمة تُعاد حسابها بعد كل حفظ يغيّر المتن، بلا ذكاء اصطناعي.

import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { articles, articleVersions, smartEditRuns, users } from "@shared/schema";
import {
  SMART_EDIT_LINK_WINDOW_HOURS,
  SMART_EDIT_MAX_TEXT_CHARS,
  computeAdoption,
  countWords,
  runMatchesContent,
  type SmartEditAdoption,
  type SmartEditChannel,
  type SmartEditStatus,
} from "@shared/smartEditRuns";

const clip = (value: string | null | undefined): string | null =>
  typeof value === "string" ? value.slice(0, SMART_EDIT_MAX_TEXT_CHARS) : null;

export interface RecordSmartEditRunInput {
  userId?: string | null;
  articleId?: string | null;
  channel: SmartEditChannel;
  status: SmartEditStatus;
  errorType?: string | null;
  inputContent: string;
  outputContent?: string | null;
  outputTitle?: string | null;
  outputFields?: Record<string, unknown> | null;
  latencyMs?: number;
}

async function existingArticleId(articleId: string | null | undefined): Promise<string | null> {
  if (!articleId || typeof articleId !== "string") return null;
  const [row] = await db.select({ id: articles.id }).from(articles).where(eq(articles.id, articleId)).limit(1);
  return row?.id ?? null;
}

/** يسجّل تشغيلًا. لا يرمي أبدًا: فشل التسجيل يُكتب تحذيرًا فقط. */
export async function recordSmartEditRun(input: RecordSmartEditRunInput): Promise<string | null> {
  try {
    const articleId = await existingArticleId(input.articleId);
    const [row] = await db
      .insert(smartEditRuns)
      .values({
        articleId,
        userId: input.userId ?? null,
        channel: input.channel,
        status: input.status,
        errorType: input.errorType ?? null,
        inputContent: clip(input.inputContent) ?? "",
        outputContent: clip(input.outputContent),
        outputTitle: clip(input.outputTitle),
        outputFields: input.outputFields ?? null,
        inputWords: countWords(input.inputContent),
        outputWords: countWords(input.outputContent),
        latencyMs: Math.max(0, Math.round(input.latencyMs ?? 0)),
        linkedAt: articleId ? new Date() : null,
      })
      .returning({ id: smartEditRuns.id });
    return row?.id ?? null;
  } catch (error) {
    console.warn("[smart-edit-runs] record failed:", (error as Error)?.message);
    return null;
  }
}

/** نسخة لا تنتظر: تُستدعى من مسارات التحرير الذكي بعد الرد. */
export function recordSmartEditRunInBackground(input: RecordSmartEditRunInput): void {
  void recordSmartEditRun(input);
}

/**
 * بعد كل حفظ للخبر: يربط تشغيلات صاحب الحفظ غير المربوطة إن تطابق النص، ثم يعيد
 * حساب البصمة لكل تشغيلات الخبر مقابل النص المحفوظ. لا يرمي.
 */
export async function syncSmartEditRunsAfterSave(input: {
  articleId: string;
  actorId?: string | null;
  content: string | null | undefined;
}): Promise<void> {
  try {
    const now = new Date();
    if (input.actorId) {
      const since = new Date(now.getTime() - SMART_EDIT_LINK_WINDOW_HOURS * 3_600_000);
      const candidates = await db
        .select({ id: smartEditRuns.id, inputContent: smartEditRuns.inputContent, outputContent: smartEditRuns.outputContent })
        .from(smartEditRuns)
        .where(and(
          isNull(smartEditRuns.articleId),
          eq(smartEditRuns.userId, input.actorId),
          eq(smartEditRuns.status, "success"),
          gte(smartEditRuns.createdAt, since),
        ))
        .orderBy(desc(smartEditRuns.createdAt))
        .limit(10);
      const matched = candidates.filter((run) => runMatchesContent(input.content, run)).map((run) => run.id);
      if (matched.length) {
        await db
          .update(smartEditRuns)
          .set({ articleId: input.articleId, linkedAt: now })
          .where(and(inArray(smartEditRuns.id, matched), isNull(smartEditRuns.articleId)));
      }
    }

    const runs = await db
      .select({ id: smartEditRuns.id, inputContent: smartEditRuns.inputContent, outputContent: smartEditRuns.outputContent })
      .from(smartEditRuns)
      .where(and(eq(smartEditRuns.articleId, input.articleId), eq(smartEditRuns.status, "success")))
      .orderBy(desc(smartEditRuns.createdAt))
      .limit(20);
    for (const run of runs) {
      const adoption = computeAdoption({
        finalContent: input.content,
        outputContent: run.outputContent,
        inputContent: run.inputContent,
      });
      await db.update(smartEditRuns).set({ adoption, adoptionAt: now }).where(eq(smartEditRuns.id, run.id));
    }
  } catch (error) {
    console.warn("[smart-edit-runs] sync after save failed:", (error as Error)?.message);
  }
}

export interface SmartEditRunSummary {
  id: string;
  articleId: string | null;
  channel: string;
  status: string;
  errorType: string | null;
  inputWords: number;
  outputWords: number;
  latencyMs: number;
  adoption: SmartEditAdoption | null;
  createdAt: Date;
  userId: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  userAvatarUrl: string | null;
}

const summaryColumns = {
  id: smartEditRuns.id,
  articleId: smartEditRuns.articleId,
  channel: smartEditRuns.channel,
  status: smartEditRuns.status,
  errorType: smartEditRuns.errorType,
  inputWords: smartEditRuns.inputWords,
  outputWords: smartEditRuns.outputWords,
  latencyMs: smartEditRuns.latencyMs,
  adoption: smartEditRuns.adoption,
  createdAt: smartEditRuns.createdAt,
  userId: smartEditRuns.userId,
  userFirstName: users.firstName,
  userLastName: users.lastName,
  userAvatarUrl: users.profileImageUrl,
};

export async function listSmartEditRunsForArticle(articleId: string): Promise<SmartEditRunSummary[]> {
  return db
    .select(summaryColumns)
    .from(smartEditRuns)
    .leftJoin(users, eq(users.id, smartEditRuns.userId))
    .where(eq(smartEditRuns.articleId, articleId))
    .orderBy(desc(smartEditRuns.createdAt))
    .limit(50);
}

/** تشغيل واحد بنصوصه كاملة، مع النص المحفوظ الحالي للخبر للمقارنة الثلاثية. */
export async function getSmartEditRun(runId: string) {
  const [run] = await db
    .select({
      ...summaryColumns,
      inputContent: smartEditRuns.inputContent,
      outputContent: smartEditRuns.outputContent,
      outputTitle: smartEditRuns.outputTitle,
      outputFields: smartEditRuns.outputFields,
    })
    .from(smartEditRuns)
    .leftJoin(users, eq(users.id, smartEditRuns.userId))
    .where(eq(smartEditRuns.id, runId))
    .limit(1);
  if (!run) return null;
  let article: { title: string; content: string; status: string; updatedAt: Date | null } | null = null;
  if (run.articleId) {
    const [row] = await db
      .select({ title: articles.title, content: articles.content, status: articles.status, updatedAt: articles.updatedAt })
      .from(articles)
      .where(eq(articles.id, run.articleId))
      .limit(1);
    article = row ?? null;
  }
  return { ...run, article };
}

export interface SmartEditUsageArticle {
  articleId: string;
  title: string;
  slug: string;
  englishSlug: string | null;
  publishedAt: Date | null;
  runs: number;
  aiPct: number | null;
}

export interface SmartEditUsageEditor {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  published: number;
  withRun: number;
  avgAiPct: number | null;
  articles: SmartEditUsageArticle[];
}

/**
 * ملخص المحررين: الأخبار التي نشرها كل مستخدم في الفترة (أول نسخة «published» له، أو إنشاؤه منشورًا مباشرة)،
 * وكم منها شُغّل عليه المحرر الذكي، ومتوسط ما بقي من الناتج. الأخبار التي نشرها
 * النظام أو البوت بلا مستخدم لا تدخل.
 */
export async function smartEditUsageSummary(input: { from: Date; to: Date }): Promise<{
  totals: { published: number; withRun: number; withoutRun: number; runs: number };
  editors: SmartEditUsageEditor[];
}> {
  const publishes = await db
    .selectDistinctOn([articleVersions.articleId], {
      articleId: articleVersions.articleId,
      actorId: articleVersions.actorId,
      at: articleVersions.createdAt,
    })
    .from(articleVersions)
    .innerJoin(articles, eq(articles.id, articleVersions.articleId))
    .where(and(
      // نشر لاحق، أو إنشاء الخبر منشورًا مباشرة (يُسجَّل «created» بحالة published)
      sql`(${articleVersions.action} = 'published' OR (${articleVersions.action} = 'created' AND ${articleVersions.snapshot}->>'status' = 'published'))`,
      gte(articleVersions.createdAt, input.from),
      lte(articleVersions.createdAt, input.to),
      eq(articles.status, "published"),
      sql`${articleVersions.actorId} IS NOT NULL`,
    ))
    .orderBy(articleVersions.articleId, articleVersions.createdAt);

  const [{ runs: totalRuns } = { runs: 0 }] = await db
    .select({ runs: sql<number>`count(*)::int` })
    .from(smartEditRuns)
    .where(and(gte(smartEditRuns.createdAt, input.from), lte(smartEditRuns.createdAt, input.to)));

  if (publishes.length === 0) {
    return { totals: { published: 0, withRun: 0, withoutRun: 0, runs: totalRuns }, editors: [] };
  }

  const articleIds = publishes.map((p) => p.articleId);
  const actorIds = Array.from(new Set(publishes.map((p) => p.actorId).filter((id): id is string => Boolean(id))));
  const [articleRows, runRows, userRows] = await Promise.all([
    db
      .select({ id: articles.id, title: articles.title, slug: articles.slug, englishSlug: articles.englishSlug, publishedAt: articles.publishedAt })
      .from(articles)
      .where(inArray(articles.id, articleIds)),
    db
      .select({ articleId: smartEditRuns.articleId, adoption: smartEditRuns.adoption, createdAt: smartEditRuns.createdAt })
      .from(smartEditRuns)
      .where(and(inArray(smartEditRuns.articleId, articleIds), eq(smartEditRuns.status, "success")))
      .orderBy(desc(smartEditRuns.createdAt)),
    db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, avatarUrl: users.profileImageUrl })
      .from(users)
      .where(inArray(users.id, actorIds)),
  ]);

  const articleById = new Map(articleRows.map((a) => [a.id, a]));
  const runsByArticle = new Map<string, { count: number; latest: SmartEditAdoption | null }>();
  for (const run of runRows) {
    if (!run.articleId) continue;
    const entry = runsByArticle.get(run.articleId);
    // الأحدث أولًا: بصمته هي التي تمثل الخبر
    if (entry) entry.count++;
    else runsByArticle.set(run.articleId, { count: 1, latest: run.adoption ?? null });
  }

  const editors = new Map<string, SmartEditUsageEditor>();
  for (const user of userRows) {
    editors.set(user.id, { userId: user.id, firstName: user.firstName, lastName: user.lastName, avatarUrl: user.avatarUrl, published: 0, withRun: 0, avgAiPct: null, articles: [] });
  }
  let withRunTotal = 0;
  for (const publish of publishes) {
    const editor = publish.actorId ? editors.get(publish.actorId) : undefined;
    const article = articleById.get(publish.articleId);
    if (!editor || !article) continue;
    const runs = runsByArticle.get(publish.articleId);
    editor.published++;
    if (runs) {
      editor.withRun++;
      withRunTotal++;
    }
    editor.articles.push({
      articleId: article.id,
      title: article.title,
      slug: article.slug,
      englishSlug: article.englishSlug,
      publishedAt: article.publishedAt,
      runs: runs?.count ?? 0,
      aiPct: runs?.latest ? runs.latest.aiPct : null,
    });
  }
  for (const editor of editors.values()) {
    const scored = editor.articles.filter((a) => a.aiPct !== null);
    editor.avgAiPct = scored.length ? Math.round(scored.reduce((sum, a) => sum + (a.aiPct ?? 0), 0) / scored.length) : null;
    editor.articles.sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
  }
  const list = Array.from(editors.values())
    .filter((e) => e.published > 0)
    .sort((a, b) => b.published - a.published);
  const published = list.reduce((sum, e) => sum + e.published, 0);
  return {
    totals: { published, withRun: withRunTotal, withoutRun: published - withRunTotal, runs: totalRuns },
    editors: list,
  };
}
