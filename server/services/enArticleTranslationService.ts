/**
 * Arabic → English article translation: the pipeline behind the dashboard
 * «ترجمة» button (POST /api/admin/articles/:id/translate-to-english) and the
 * two-hourly auto-translate job, plus category mapping, slug preference and
 * sibling sync.
 */
import { nanoid } from "nanoid";
import { db } from "../db";
import { articles, categories, enArticles, enCategories, users } from "@shared/schema";
import { and, eq, or, sql } from "drizzle-orm";
import { aiGateway } from "../ai/gateway";
import { notifySearchEngines } from "../indexNow";
import { generateEnglishSlug } from "../utils/slugTransliterator";
import {
  clearOtherBreakingArticles,
  clearOtherEnBreakingArticles,
  invalidateClearedBreakingArticles,
  isBreakingNewsType,
} from "./breakingNewsService";
import { invalidatePublishedContent } from "./contentInvalidation";
import { invalidateSitemapXmlCache } from "./sitemapCacheService";
import { clearNewsSitemapMemoryCache } from "./newsSitemapMemoryCache";

/** Map an Arabic category to en_categories via slug / englishSlug / name. */
export async function resolveEnCategoryId(
  arCategoryId: string | null | undefined,
): Promise<{ enCategoryId: string | null; categoryNameAr: string }> {
  if (!arCategoryId) return { enCategoryId: null, categoryNameAr: "" };

  const [cat] = await db
    .select({
      nameAr: categories.nameAr,
      nameEn: categories.nameEn,
      slug: categories.slug,
      englishSlug: categories.englishSlug,
    })
    .from(categories)
    .where(eq(categories.id, arCategoryId))
    .limit(1);

  if (!cat) return { enCategoryId: null, categoryNameAr: "" };

  const slugCandidates = [cat.englishSlug, cat.slug]
    .filter((s): s is string => Boolean(s && s.trim()))
    .map((s) => s.trim().toLowerCase());

  if (slugCandidates.length > 0) {
    const [bySlug] = await db
      .select({ id: enCategories.id })
      .from(enCategories)
      .where(
        and(
          eq(enCategories.status, "active"),
          or(...slugCandidates.map((s) => sql`LOWER(${enCategories.slug}) = ${s}`)),
        ),
      )
      .limit(1);
    if (bySlug) {
      return { enCategoryId: bySlug.id, categoryNameAr: cat.nameAr || "" };
    }
  }

  const nameEn = (cat.nameEn || "").trim();
  if (nameEn) {
    const [byName] = await db
      .select({ id: enCategories.id })
      .from(enCategories)
      .where(
        and(
          eq(enCategories.status, "active"),
          sql`LOWER(${enCategories.name}) = LOWER(${nameEn})`,
        ),
      )
      .limit(1);
    if (byName) {
      return { enCategoryId: byName.id, categoryNameAr: cat.nameAr || "" };
    }
  }

  console.warn(
    `[Translate] No EN category match for AR category id=${arCategoryId} nameEn=${nameEn} slug=${cat.slug}`,
  );
  return { enCategoryId: null, categoryNameAr: cat.nameAr || "" };
}

/**
 * Prefer the Arabic article's englishSlug for the EN URL when free,
 * so hreflang can share the same short code (/article/X ↔ /en/article/X).
 */
export async function pickEnArticleSlug(opts: {
  preferredFromAr: string | null | undefined;
  fromTitle: string;
}): Promise<string> {
  const preferred = (opts.preferredFromAr || "").trim();
  if (preferred) {
    const [taken] = await db
      .select({ id: enArticles.id })
      .from(enArticles)
      .where(
        or(eq(enArticles.slug, preferred), eq(enArticles.englishSlug, preferred)),
      )
      .limit(1);
    if (!taken) return preferred;
  }
  return opts.fromTitle;
}

/** Sync newsType onto the Arabic source linked via seoMetadata.sourceArticleId. */
export async function syncBreakingToArabicSource(
  enArticle: { seoMetadata?: unknown },
  newsType: string,
): Promise<void> {
  const sourceId =
    enArticle.seoMetadata && typeof enArticle.seoMetadata === "object"
      ? (enArticle.seoMetadata as { sourceArticleId?: string }).sourceArticleId
      : undefined;
  if (!sourceId) return;

  await db
    .update(articles)
    .set({ newsType, updatedAt: new Date() })
    .where(eq(articles.id, sourceId));

  if (isBreakingNewsType(newsType)) {
    const cleared = await clearOtherBreakingArticles(sourceId);
    if (cleared.length > 0) {
      invalidateClearedBreakingArticles(cleared, "en-sync-breaking-clear");
    }
  }
}

export class EnTranslationError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "NOT_PUBLISHED" | "ALREADY_TRANSLATED" | "AI_FAILED",
    readonly existing?: { id: string; title: string },
  ) {
    super(message);
    this.name = "EnTranslationError";
  }
}

/** The EN article translated from this Arabic id (seoMetadata.sourceArticleId), if any. */
export async function findEnTranslation(
  arArticleId: string,
): Promise<{ id: string; title: string } | null> {
  const [row] = await db
    .select({ id: enArticles.id, title: enArticles.title })
    .from(enArticles)
    .where(sql`${enArticles.seoMetadata}->>'sourceArticleId' = ${arArticleId}`)
    .limit(1);
  return row ?? null;
}

interface TranslatedFields {
  title: string;
  subtitle?: string | null;
  content: string;
  excerpt?: string | null;
  seoKeywords?: string[];
}

function parseTranslation(raw: string): TranslatedFields {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  const parsed = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
  if (typeof parsed?.title !== "string" || !parsed.title.trim() || typeof parsed?.content !== "string" || !parsed.content.trim()) {
    throw new Error("translation is missing title or content");
  }
  return parsed as TranslatedFields;
}

/**
 * Translate a published Arabic article and create its EN twin.
 * `status: "published"` matches the dashboard button; "draft" leaves it for an editor.
 * The duplicate check runs again under an advisory lock right before insert, so the
 * button and the job can never create two translations of the same story.
 */
export async function translateArticleToEnglish(opts: {
  articleId: string;
  actorUserId: string;
  status?: "published" | "draft";
  trigger?: "manual" | "auto";
}) {
  const { articleId, actorUserId } = opts;
  const status = opts.status ?? "published";
  const trigger = opts.trigger ?? "manual";

  const existing = await findEnTranslation(articleId);
  if (existing) {
    throw new EnTranslationError(
      `هذا المقال مترجم بالفعل في النسخة الإنجليزية: "${existing.title}"`,
      "ALREADY_TRANSLATED",
      existing,
    );
  }

  const [article] = await db
    .select({
      id: articles.id,
      title: articles.title,
      subtitle: articles.subtitle,
      content: articles.content,
      excerpt: articles.excerpt,
      imageUrl: articles.imageUrl,
      imageFocalPoint: articles.imageFocalPoint,
      categoryId: articles.categoryId,
      reporterId: articles.reporterId,
      articleType: articles.articleType,
      newsType: articles.newsType,
      isFeatured: articles.isFeatured,
      englishSlug: articles.englishSlug,
      status: articles.status,
    })
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);

  if (!article) throw new EnTranslationError("المقال غير موجود", "NOT_FOUND");
  if (article.status !== "published") {
    throw new EnTranslationError("يجب أن يكون المقال منشوراً قبل الترجمة", "NOT_PUBLISHED");
  }

  const { enCategoryId, categoryNameAr } = await resolveEnCategoryId(article.categoryId);

  const prompt = `You are a professional news translator for "Sabq" (سبق), a leading Saudi Arabian news platform. Translate the following Arabic news article into fluent, natural English suitable for an international English-speaking audience.

IMPORTANT RULES:
- Translate the title, subtitle, excerpt, and full content into English
- Keep the journalistic tone and style
- Preserve all factual information, names, dates, and quotes
- For proper nouns (people, places, organizations), use standard English transliterations
- Maintain the article structure and paragraphs
- Content is in HTML format - preserve all HTML tags and structure
- Generate 3-5 SEO keywords in English related to the article

Arabic Article Title: ${article.title}
${article.subtitle ? `Arabic Subtitle: ${article.subtitle}` : ''}
${article.excerpt ? `Arabic Excerpt: ${article.excerpt}` : ''}
${categoryNameAr ? `Category: ${categoryNameAr}` : ''}

Arabic Content:
${article.content}

Respond in valid JSON format only:
{
  "title": "English title",
  "subtitle": "English subtitle or null",
  "content": "Full English HTML content",
  "excerpt": "English excerpt (max 200 chars)",
  "seoKeywords": ["keyword1", "keyword2", "keyword3"]
}`;

  let translated: TranslatedFields;
  let provider: string;
  let model: string;
  try {
    const res = await aiGateway.complete({
      feature: "en-translate",
      userId: actorUserId,
      prompt,
      options: { jsonMode: true, temperature: 0.3, maxTokens: 8000 },
    });
    if (res.truncated) throw new Error("translation was truncated");
    translated = parseTranslation(res.content);
    provider = res.provider;
    model = res.modelId;
  } catch (error) {
    console.error(`[Translate] AI translation failed for ${articleId}:`, error instanceof Error ? error.message : error);
    throw new EnTranslationError("فشل الحصول على الترجمة من الذكاء الاصطناعي", "AI_FAILED");
  }

  // Prefer Arabic englishSlug so AR/EN share the same short code (hreflang-safe).
  let englishSlug = await pickEnArticleSlug({
    preferredFromAr: article.englishSlug,
    fromTitle: generateEnglishSlug(translated.title),
  });
  const [slugExists] = await db
    .select({ id: enArticles.id })
    .from(enArticles)
    .where(or(eq(enArticles.slug, englishSlug), eq(enArticles.englishSlug, englishSlug)))
    .limit(1);
  if (slugExists) englishSlug = `${generateEnglishSlug(translated.title)}-${nanoid(5)}`;

  // Always under the "Sabq Newspaper" account.
  const [sabqNewspaperUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, "admin@sabq.org"))
    .limit(1);
  const sabqAuthorId = sabqNewspaperUser?.id || actorUserId;

  if (!enCategoryId && article.categoryId) {
    console.warn(`[Translate] EN category missing for AR article ${articleId} — saving without category`);
  }

  const isPublished = status === "published";
  const newEnArticle = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`en-translate:${articleId}`}))`);
    const [dupe] = await tx
      .select({ id: enArticles.id, title: enArticles.title })
      .from(enArticles)
      .where(sql`${enArticles.seoMetadata}->>'sourceArticleId' = ${articleId}`)
      .limit(1);
    if (dupe) {
      throw new EnTranslationError(
        `هذا المقال مترجم بالفعل في النسخة الإنجليزية: "${dupe.title}"`,
        "ALREADY_TRANSLATED",
        dupe,
      );
    }
    // Pin new translations at the top of the EN dashboard (displayOrder leads sort).
    const [maxOrderRow] = await tx
      .select({ maxOrder: sql<number>`COALESCE(MAX(${enArticles.displayOrder}), 0)::int` })
      .from(enArticles);
    const [row] = await tx
      .insert(enArticles)
      .values([{
        title: translated.title,
        subtitle: translated.subtitle || null,
        slug: englishSlug,
        englishSlug: englishSlug,
        content: translated.content,
        excerpt: translated.excerpt || null,
        imageUrl: article.imageUrl,
        imageFocalPoint: article.imageFocalPoint || null,
        categoryId: enCategoryId,
        authorId: sabqAuthorId,
        reporterId: article.reporterId || null,
        articleType: article.articleType,
        newsType: article.newsType,
        isFeatured: article.isFeatured ?? false,
        status,
        publishedAt: isPublished ? new Date() : null,
        displayOrder: (maxOrderRow?.maxOrder || 0) + 1,
        hideFromHomepage: false,
        aiGenerated: true,
        aiSummary: translated.excerpt || null,
        seo: {
          metaTitle: translated.title,
          metaDescription: translated.excerpt || "",
          keywords: translated.seoKeywords || [],
        },
        seoMetadata: {
          sourceArticleId: articleId,
          provider,
          model,
          generatedAt: new Date().toISOString(),
          generatedBy: actorUserId,
          status: "generated" as const,
          trigger,
        },
      } as any])
      .returning();
    return row;
  });

  console.log(`[Translate] Article ${articleId} → EN ${newEnArticle.id} (${status}, ${trigger}) by ${actorUserId}`);

  if (isPublished) {
    if (isBreakingNewsType(newEnArticle.newsType)) {
      await clearOtherEnBreakingArticles(newEnArticle.id).catch((err) =>
        console.warn("[Translate] Failed to clear other EN breaking articles:", err),
      );
    }
    // Notify search engines for the EN URL + refresh AR hreflang cluster.
    const enSlug = newEnArticle.englishSlug || newEnArticle.slug;
    if (enSlug) notifySearchEngines(enSlug, "en").catch(() => {});
    if (article.englishSlug) notifySearchEngines(article.englishSlug, "ar").catch(() => {});
    invalidatePublishedContent({ reason: "en-translate" });
    invalidateSitemapXmlCache(["__sitemapEnArticles", "index"]).catch(() => {});
    try {
      clearNewsSitemapMemoryCache();
    } catch {
      /* best-effort */
    }
  }

  return { enArticle: newEnArticle, enCategoryId, hadArCategory: Boolean(article.categoryId) };
}
