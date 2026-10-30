/**
 * الترجمة الآلية للنسخة الإنجليزية: كل ساعتين يختار الذكاء الاصطناعي أهم الأخبار
 * العربية غير المحلية البحتة (التحالف، مجلس الوزراء، القرارات الحكومية...) ويترجمها
 * بخط زر الترجمة نفسه (translateArticleToEnglish). المعيار والمنطق الصافي في
 * shared/enAutoTranslate.ts، والإعداد صف واحد في system_settings.
 */
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { articles, categories, enArticles, users } from "@shared/schema";
import {
  buildEnAutoSelectionPrompt,
  DEFAULT_EN_AUTO_TRANSLATE_SETTINGS,
  EN_AUTO_LOOKBACK_MS,
  EN_AUTO_MAX_CANDIDATES,
  EN_AUTO_SELECTION_SYSTEM,
  EN_AUTO_SETTLE_MS,
  EN_AUTO_TRANSLATE_SETTINGS_KEY,
  enAutoTranslateSettingsSchema,
  parseEnAutoScores,
  pickEnAutoWinners,
  type EnAutoCandidate,
  type EnAutoScore,
  type EnAutoTranslateSettings,
} from "@shared/enAutoTranslate";
import { aiGateway } from "../ai/gateway";
import { logActivity } from "../rbac";
import { storage } from "../storage";
import { EnTranslationError, translateArticleToEnglish } from "./enArticleTranslationService";

export async function loadEnAutoTranslateSettings(): Promise<EnAutoTranslateSettings> {
  const stored = await storage.getSystemSetting(EN_AUTO_TRANSLATE_SETTINGS_KEY);
  if (stored == null) return DEFAULT_EN_AUTO_TRANSLATE_SETTINGS;
  return enAutoTranslateSettingsSchema.parse({ ...DEFAULT_EN_AUTO_TRANSLATE_SETTINGS, ...stored });
}

export async function saveEnAutoTranslateSettings(value: unknown): Promise<EnAutoTranslateSettings> {
  const settings = enAutoTranslateSettingsSchema.parse(value);
  await storage.upsertSystemSetting(EN_AUTO_TRANSLATE_SETTINGS_KEY, settings, "content", false);
  return settings;
}

/** أخبار عربية منشورة في النافذة، ليست رأيًا، ولم تُترجم بعد. الأحدث أولًا. */
async function loadCandidates(now: Date): Promise<EnAutoCandidate[]> {
  const rows = await db
    .select({
      id: articles.id,
      title: articles.title,
      excerpt: articles.excerpt,
      categoryNameAr: categories.nameAr,
      newsType: articles.newsType,
    })
    .from(articles)
    .leftJoin(categories, eq(categories.id, articles.categoryId))
    .where(
      and(
        eq(articles.status, "published"),
        eq(articles.articleType, "news"),
        gte(articles.publishedAt, new Date(now.getTime() - EN_AUTO_LOOKBACK_MS)),
        lte(articles.publishedAt, new Date(now.getTime() - EN_AUTO_SETTLE_MS)),
        sql`NOT EXISTS (SELECT 1 FROM ${enArticles} WHERE ${enArticles.seoMetadata}->>'sourceArticleId' = ${articles.id})`,
      ),
    )
    .orderBy(desc(articles.publishedAt))
    .limit(EN_AUTO_MAX_CANDIDATES);
  return rows.map((r) => ({ ...r, newsType: r.newsType || "regular" }));
}

async function loadRecentEnTitles(now: Date): Promise<string[]> {
  const rows = await db
    .select({ title: enArticles.title })
    .from(enArticles)
    .where(
      and(
        gte(enArticles.createdAt, new Date(now.getTime() - 48 * 60 * 60_000)),
        sql`${enArticles.status} IN ('published', 'draft')`,
      ),
    )
    .orderBy(desc(enArticles.createdAt))
    .limit(40);
  return rows.map((r) => r.title);
}

async function sabqAccountId(): Promise<string | null> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, "admin@sabq.org"))
    .limit(1);
  return row?.id ?? null;
}

export interface EnAutoRunResult {
  status: "disabled" | "no_candidates" | "no_account" | "done";
  candidates: number;
  scores: Array<EnAutoScore & { title: string }>;
  translated: Array<{ articleId: string; enArticleId: string; title: string; score: number }>;
  skipped: Array<{ articleId: string; reason: string }>;
}

/**
 * دورة واحدة. dryRun = الاختيار فقط (للمعاينة من لوحة التحكم) دون ترجمة أو نشر،
 * ويعمل حتى لو كانت المهمة معطّلة.
 */
export async function runEnAutoTranslate(opts: { dryRun?: boolean; now?: Date } = {}): Promise<EnAutoRunResult> {
  const now = opts.now ?? new Date();
  const settings = await loadEnAutoTranslateSettings();
  const result: EnAutoRunResult = { status: "done", candidates: 0, scores: [], translated: [], skipped: [] };
  if (!settings.enabled && !opts.dryRun) return { ...result, status: "disabled" };

  const accountId = await sabqAccountId();
  if (!accountId) return { ...result, status: "no_account" };

  const candidates = await loadCandidates(now);
  result.candidates = candidates.length;
  if (candidates.length === 0) return { ...result, status: "no_candidates" };

  const recentEn = await loadRecentEnTitles(now);
  const res = await aiGateway.complete({
    feature: "en-auto-translate-select",
    userId: accountId,
    messages: [
      { role: "system", content: EN_AUTO_SELECTION_SYSTEM },
      { role: "user", content: buildEnAutoSelectionPrompt(candidates, recentEn) },
    ],
    options: { jsonMode: true, maxTokens: 3000, cacheSystemPrompt: true },
  });
  const ids = candidates.map((c) => c.id);
  const scores = parseEnAutoScores(res.content, ids);
  const titleById = new Map(candidates.map((c) => [c.id, c.title]));
  result.scores = scores
    .map((s) => ({ ...s, title: titleById.get(s.id) || "" }))
    .sort((a, b) => b.score - a.score);

  const winners = pickEnAutoWinners(scores, ids, settings);
  if (opts.dryRun) return result;

  // بالتتابع: كل ترجمة نداء طويل، والتوازي لا يفيد مع سقف 3.
  for (const winner of winners) {
    try {
      const { enArticle } = await translateArticleToEnglish({
        articleId: winner.id,
        actorUserId: accountId,
        status: settings.mode === "publish" ? "published" : "draft",
        trigger: "auto",
      });
      result.translated.push({ articleId: winner.id, enArticleId: enArticle.id, title: enArticle.title, score: winner.score });
      await logActivity({
        userId: accountId,
        action: "auto_translate_en",
        entityType: "en_article",
        entityId: enArticle.id,
        newValue: { title: enArticle.title, status: enArticle.status },
        metadata: { sourceArticleId: winner.id, score: winner.score, reason: winner.reason, mode: settings.mode },
      });
    } catch (error) {
      const reason = error instanceof EnTranslationError ? error.code : error instanceof Error ? error.message : String(error);
      result.skipped.push({ articleId: winner.id, reason });
    }
  }
  return result;
}
