import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { articleMediaAssets, articleTags, articles, categories, enArticles, enCategories, tags, users } from "@shared/schema";
import { botEditorArchiveSchema, botEditorDeleteSchema, botEditorEditSchema, botEditorEmptySchema, botEditorVisibilitySchema } from "@shared/botEditorWrites";
import { mergeBotEditorBodyImages } from "./botEditorBodyImages";
import { resolveContentBylineUserId } from "@shared/mediaLicense";
import { assertMediaLicenseAllowsSubmission } from "./mediaLicenseService";
import { hasMeaningfulEditorialChange } from "../utils/editorialDates";
import { assertBotEditorUnlocked } from "./botEditorLocks";
import { BotDraftError, appendBotDraftBodyImages, normalizeDraftContent } from "./botDraftsService";
import { recordBotEditorAudit } from "./botEditorAudit";
import { assertNotProtected } from "./botEditorCapabilityGuard";
import { invalidateClearedBreakingArticles } from "./breakingNewsService";
import { botEditorAssignableStaff } from "./botEditorWritesRoster";
import { demoteOtherBreaking } from "./botEditorWritesBreaking";
import { toBotDraftResponse } from "./botDraftsService";
import { toEnBotDraftResponse } from "./enBotDraftsService";
import { invalidateArticleWrite } from "./contentInvalidation";
import { queueEnBotDraftSurfaceEffects } from "./enBotDraftPublishEffects";
import { memoryCache } from "../memoryCache";
import { queueBotDraftPublishedContentEffects, queueBotDraftVisibilityEffects, queueBotDraftRestoreEffects } from "./botDraftPublishEffects";
import { AR_SITEMAP_BUCKETS } from "./archiveSeo";
import { clearNewsSitemapMemoryCache } from "./newsSitemapMemoryCache";
import { invalidateSitemapXmlCache } from "./sitemapCacheService";
import { purgeContentSurfaces } from "./cloudflarePurge";

export type BotEditorLanguage = "ar" | "en";
type Guard = { expectedUpdatedAt: Date };
const editable = new Set(["draft", "ready_to_publish", "scheduled", "published"]);

function noteOf(input: { updateReason?: string | null; reason?: string | null }): string | null {
  return (input.updateReason ?? input.reason ?? "").trim() || null;
}

function assertEditorFresh(before: { updatedAt?: Date | null }, raw: unknown): void {
  if (typeof raw !== "string" || !raw.trim()) throw new BotDraftError(422, "validation_error", "expectedUpdatedAt مطلوب");
  const expected = new Date(raw);
  if (Number.isNaN(expected.getTime()) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(raw.trim())) {
    throw new BotDraftError(422, "validation_error", "expectedUpdatedAt يجب أن يكون ISO-8601 مع منطقة زمنية");
  }
  if (before.updatedAt?.getTime() !== expected.getTime()) throw new BotDraftError(409, "draft_changed", "تغيّرت المادة — أعد القراءة ثم أعد المحاولة");
}

function parse<T>(schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false; error: unknown } }, input: unknown): T {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    const issues = (result.error as any)?.issues ?? [];
    const fields = issues.filter((issue: any) => issue.code === "unrecognized_keys").flatMap((issue: any) => issue.keys);
    if (fields.length) throw new BotDraftError(422, "forbidden_fields", "حقول غير مسموحة", { fields });
    throw new BotDraftError(422, "validation_error", "بيانات الطلب غير صالحة", result.error);
  }
  return result.data;
}

// Runtime selection retains the real Drizzle table's columns in each language.
async function mutate(language: BotEditorLanguage, id: string, operation: string, input: Record<string, any>, guard?: Guard) {
  assertNotProtected(id);
  const table: any = language === "ar" ? articles : enArticles;
  const categoryTable: any = language === "ar" ? categories : enCategories;
  let cleared: any[] = [];
  let clearedEnglish: any[] = [];
  const result = await db.transaction(async (tx) => {
    if ((operation === "visibility" || operation === "edit") && input.newsType === "breaking") await tx.execute(sql`select pg_advisory_xact_lock(hashtext('sabq-bot-editor-breaking'))`);
    const [before]: any[] = await tx.select().from(table).where(eq(table.id, id)).limit(1).for("update");
    if (!before) throw new BotDraftError(404, "not_found", "الخبر غير موجود");
    if (before.articleType !== "news" && before.articleType !== "infographic") {
      throw new BotDraftError(403, "forbidden_action", "نوع المادة غير مدعوم");
    }
    if (guard && before.updatedAt?.getTime() !== guard.expectedUpdatedAt.getTime()) throw new BotDraftError(409, "draft_changed", "تغيّرت المادة أثناء التوليد — لم يُحفظ شيء");
    await assertBotEditorUnlocked(tx, language, id, before);
    const now = new Date();
    const auditBefore: Record<string, unknown> = { ...before };
    const auditAfterExtra: Record<string, unknown> = {};
    let patch: Record<string, any> = { updatedAt: now };
    if (operation === "edit") {
      if (!editable.has(before.status)) throw new BotDraftError(409, "not_a_draft", "حالة المادة لا تسمح بالتعديل", { status: before.status });
      for (const key of ["authorId", "reporterId"]) {
        const candidate = input[key];
        if (candidate === undefined) continue;
        if (candidate === null && key === "reporterId") { patch.reporterId = null; continue; }
        const [staff] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, candidate), botEditorAssignableStaff())).limit(1);
        if (!staff) throw new BotDraftError(422, "validation_error", "المؤلف أو المراسل غير موجود ضمن طاقم التحرير النشط", { field: key });
        patch[key] = candidate;
      }
      if (before.status === "published" && (input.notes !== undefined || input.clientReference !== undefined || input.infographic !== undefined)) throw new BotDraftError(422, "forbidden_fields", "المرجع والملاحظات ونوع المادة لا تتغير بعد النشر");
      if (language === "ar" && input.sourceArticleId !== undefined) throw new BotDraftError(422, "forbidden_fields", "ربط الأصل متاح للإنجليزية فقط");
      if (language === "en" && ["thumbnailUrl", "albumImages", "isVideoTemplate", "videoUrl", "videoThumbnailUrl"].some((key) => input[key] !== undefined)) {
        throw new BotDraftError(422, "forbidden_fields", "حقول الفيديو والألبوم والصورة المصغرة خاصة بالنسخة العربية");
      }
      if (input.infographic !== undefined) { patch.articleType = input.infographic ? "infographic" : "news"; if (language === "ar" && input.infographic) patch.infographicType = "image"; }
      if (language === "ar") {
        if (input.infographicBannerUrl !== undefined) patch.infographicBannerUrl = input.infographicBannerUrl;
        if (input.sourceUrl !== undefined) patch.sourceUrl = input.sourceUrl;
        if (input.riskLabel !== undefined) patch.riskLabel = input.riskLabel;
        if (input.notes !== undefined || input.clientReference !== undefined) patch.sourceMetadata = { ...(before.sourceMetadata ?? { type: before.source || "manual" }), ...(input.notes !== undefined ? { notes: input.notes ?? undefined } : {}), ...(input.clientReference !== undefined ? { clientReference: input.clientReference } : {}) };
      } else {
        const meta: Record<string, unknown> = { ...(before.seoMetadata ?? {}) };
        for (const key of ["sourceUrl", "riskLabel", "notes", "clientReference", "infographicBannerUrl"]) if (input[key] !== undefined) meta[key] = input[key] ?? undefined;
        if (input.sourceArticleId !== undefined) {
          if (input.sourceArticleId !== null) {
            await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`en-bot:${input.sourceArticleId}`}))`);
            const [original] = await tx.select({ id: articles.id }).from(articles).where(eq(articles.id, input.sourceArticleId)).limit(1);
            if (!original) throw new BotDraftError(422, "source_article_not_found", "الخبر العربي الأصلي غير موجود");
            const [linked] = await tx.select({ id: enArticles.id }).from(enArticles).where(and(sql`${enArticles.seoMetadata}->>'sourceArticleId' = ${input.sourceArticleId}`, sql`${enArticles.id} <> ${id}`)).limit(1);
            if (linked) throw new BotDraftError(409, "source_article_already_linked", "الخبر العربي مرتبط بمادة إنجليزية أخرى");
          }
          meta.sourceArticleId = input.sourceArticleId ?? undefined;
        }
        if (["sourceUrl", "riskLabel", "notes", "clientReference", "sourceArticleId", "infographicBannerUrl"].some((key) => input[key] !== undefined)) patch.seoMetadata = meta;
      }
      if (language === "en" && input.isAiGeneratedImage !== undefined) patch.seoMetadata = { ...(before.seoMetadata ?? {}), ...(patch.seoMetadata ?? {}), isAiGeneratedImage: input.isAiGeneratedImage };
      if (language === "ar" && input.isAiGeneratedImage !== undefined) patch.isAiGeneratedImage = input.isAiGeneratedImage;
      if (language === "ar" && (input.imageCaption !== undefined || input.imageAltText !== undefined)) {
        const [hero] = await tx.select().from(articleMediaAssets).where(and(eq(articleMediaAssets.articleId, id), eq(articleMediaAssets.locale, "ar"), eq(articleMediaAssets.displayOrder, 0), eq(articleMediaAssets.moderationStatus, "approved"))).orderBy(articleMediaAssets.id).limit(1).for("update");
        auditBefore.imageCaption = hero?.captionPlain ?? null;
        auditBefore.imageCaptionHtml = hero?.captionHtml ?? null;
        auditAfterExtra.imageCaptionHtml = input.imageCaption !== undefined ? null : hero?.captionHtml ?? null;
        auditBefore.imageAltText = hero?.altText ?? null;
        auditAfterExtra.imageCaption = input.imageCaption !== undefined ? input.imageCaption || null : hero?.captionPlain ?? null;
        auditAfterExtra.imageAltText = input.imageAltText !== undefined ? input.imageAltText || before.title : hero?.altText ?? before.title;
        if (hero) {
          await tx.update(articleMediaAssets).set({
            ...(input.imageCaption !== undefined ? { captionPlain: input.imageCaption || null, captionHtml: null } : {}),
            ...(input.imageAltText !== undefined ? { altText: input.imageAltText || before.title } : {}),
            updatedAt: now,
          }).where(eq(articleMediaAssets.id, hero.id));
        } else {
          await tx.insert(articleMediaAssets).values({ articleId: id, locale: "ar", displayOrder: 0, altText: input.imageAltText || before.title, captionPlain: input.imageCaption || null });
        }
      }
      for (const key of ["title", "subtitle", "imageUrl", "imageFocalPoint", "thumbnailUrl", "albumImages", "isVideoTemplate", "videoUrl", "videoThumbnailUrl", "hideFromHomepage", "newsType", "isFeatured", "isReading"]) if (input[key] !== undefined) patch[key] = input[key];
      if (input.tagIds !== undefined) {
        const requested = input.tagIds as string[];
        const activeTags = requested.length ? await tx.select().from(tags).where(and(inArray(tags.id, requested), eq(tags.status, "active"))) : [];
        if (activeTags.length !== requested.length) throw new BotDraftError(422, "validation_error", "أحد الوسوم غير موجود أو غير نشط");
        const old = language === "ar" ? await tx.select().from(articleTags).where(eq(articleTags.articleId, id)) : [];
        const oldIds: string[] = language === "ar" ? old.map((tag) => tag.tagId) : Array.isArray(before.seo?.tagIds) ? before.seo.tagIds : [];
        auditBefore.tagIds = oldIds.slice().sort();
        auditAfterExtra.tagIds = requested.slice().sort();
        if (language === "en") patch.seo = { ...(before.seo ?? {}), tagIds: requested };
        for (const tagId of (language === "ar" ? oldIds : []).filter((v) => !requested.includes(v))) {
          await tx.delete(articleTags).where(and(eq(articleTags.articleId, id), eq(articleTags.tagId, tagId)));
          await tx.update(tags).set({ usageCount: sql`greatest(${tags.usageCount} - 1, 0)`, updatedAt: now }).where(eq(tags.id, tagId));
        }
        for (const tagId of (language === "ar" ? requested : []).filter((v) => !oldIds.includes(v))) {
          await tx.insert(articleTags).values({ articleId: id, tagId });
          await tx.update(tags).set({ usageCount: sql`${tags.usageCount} + 1`, updatedAt: now }).where(eq(tags.id, tagId));
        }
      }
      if (input.content !== undefined) {
        const normalized = normalizeDraftContent(input.content, input.contentFormat, input.imageUrls);
        patch.content = normalized;
      } else if (input.imageUrls !== undefined) patch.content = appendBotDraftBodyImages(before.content ?? "", input.imageUrls);
      if (input.content !== undefined || input.imageUrls !== undefined || input.bodyImages !== undefined) patch.content = mergeBotEditorBodyImages(before.content, patch.content ?? before.content, input.bodyImages);
      if (input.excerpt !== undefined) {
        patch.excerpt = input.excerpt || null; patch.aiSummary = patch.excerpt;
        if (language === "en") patch.smartSummary = patch.excerpt;
        else { patch.aiBullets = null; patch.aiBulletsGeneratedAt = null; }
      }
      if (input.categoryId !== undefined || input.categorySlug !== undefined) {
        const conditions = [language === "ar" ? and(inArray(categoryTable.status, ["visible", "active"]), eq(categoryTable.isIfoxCategory, false))! : and(eq(categoryTable.status, "active"), eq(categoryTable.type, "core"))!];
        if (input.categoryId !== undefined) conditions.push(eq(categoryTable.id, input.categoryId));
        if (input.categorySlug !== undefined) conditions.push(eq(categoryTable.slug, input.categorySlug));
        const [category]: any[] = await tx.select().from(categoryTable).where(and(...conditions)).limit(1);
        if (!category) throw new BotDraftError(422, "category_not_found", "التصنيف غير موجود أو غير نشط");
        patch.categoryId = category.id;
      }
      if (["keywords", "alternativeTitle", "seoTitle", "seoDescription", ...(language === "en" ? ["imageCaption", "imageAltText"] : [])].some((k) => input[k] !== undefined)) {
        const seo = { ...(before.seo ?? {}), ...(patch.seo ?? {}) };
        for (const [key, target] of [["keywords", "keywords"], ["alternativeTitle", "alternativeTitle"], ["seoTitle", "metaTitle"], ["seoDescription", "metaDescription"], ["imageCaption", "imageCaption"], ["imageAltText", "imageAltText"]]) {
          if (language === "ar" && (key === "imageCaption" || key === "imageAltText")) continue;
          if (input[key] !== undefined) { if (input[key] === null || input[key] === "") delete seo[target]; else seo[target] = input[key]; }
        }
        patch.seo = seo;
      }
      if (before.status === "published") {
        const visibleChange = hasMeaningfulEditorialChange(patch, before) || ["imageCaption", "imageAltText"].some((key) => key in auditAfterExtra && auditAfterExtra[key] !== auditBefore[key]);
        if (visibleChange && language === "ar") patch.correctedAt = now;
        if (visibleChange || (language === "en" && input.updateReason !== undefined)) {
          patch.seoMetadata = { ...(before.seoMetadata ?? {}), ...(patch.seoMetadata ?? {}), ...(visibleChange ? { editorialModifiedAt: now.toISOString(), ...(language === "en" ? { correctedAt: now.toISOString() } : {}) } : {}), ...(language === "en" && input.updateReason !== undefined ? { updateReason: input.updateReason } : {}) };
        }
      }
    } else if (operation === "visibility") {
      if (before.status !== "published") throw new BotDraftError(409, "not_published", "الخبر غير منشور");
      if (input.displayOrder !== undefined && input.displayOrder > (language === "en" ? 2147483647 : Number.MAX_SAFE_INTEGER)) throw new BotDraftError(422, "validation_error", "ترتيب العرض خارج الحد المسموح");
      if (input.specialSections !== undefined) { patch.isFeatured = input.specialSections.includes("featured"); patch.isReading = input.specialSections.includes("reading"); }
      for (const key of ["isFeatured", "newsType", "hideFromHomepage", "isReading", "displayOrder"]) if (input[key] !== undefined) patch[key] = input[key];
    } else if (operation === "archive") {
      if (!["draft", "ready_to_publish", "scheduled", "published"].includes(before.status)) throw new BotDraftError(409, "not_published", "لا يمكن أرشفة هذه الحالة");
      const note = (input.updateReason ?? input.reason ?? "").trim();
      if (before.status !== "published" || input.__strictDelete === true) {
        if (!note) throw new BotDraftError(422, "validation_error", "updateReason مطلوب لأرشفة المسودة");
        assertEditorFresh(before, input.expectedUpdatedAt);
      }
      patch = { ...patch, status: "archived", reviewStatus: null, publishType: "instant", scheduledAt: null, ...(note ? { reviewNotes: note } : {}) };
    } else if (operation === "restore") {
      if (before.status !== "archived") throw new BotDraftError(409, "not_archived", "المادة غير مؤرشفة");
      patch = { ...patch, status: "draft", publishType: "instant", scheduledAt: null };
    } else if (operation === "unpublish") {
      if (before.status !== "published") throw new BotDraftError(409, "not_published", "الخبر غير منشور");
      patch = { ...patch, status: "draft", publishType: "instant", scheduledAt: null };
    } else throw new BotDraftError(400, "validation_error", "الإجراء غير مدعوم");
    if (operation === "edit" && (before.status === "published" || before.status === "scheduled") && (input.authorId !== undefined || input.reporterId !== undefined)) {
      const oldByline = resolveContentBylineUserId(before);
      const nextByline = resolveContentBylineUserId({ ...before, ...patch });
      if (nextByline !== oldByline) {
        const gate = await assertMediaLicenseAllowsSubmission(nextByline);
        if (!gate.ok) throw new BotDraftError(403, "license_required", gate.message, { licenseCode: gate.code });
      }
    }
    if (operation === "edit" && (before.status === "published" || before.status === "scheduled")) {
      const { denyBannedWords } = await import("./publishBannedWordsService");
      const banned = await denyBannedWords({ userId: null, nextStatus: before.status, content: { ...before, ...patch }, previous: before, articleId: language === "ar" ? id : null, actorLabel: "نشر سبق", surface: "bot" });
      if (banned) throw new BotDraftError(403, "forbidden_action", banned.message, { reason: "banned_word", bannedWords: banned.bannedWords });
    }
    const [after]: any[] = await tx.update(table).set(patch).where(eq(table.id, id)).returning();
    if (input.newsType === "breaking" && (operation === "visibility" || (operation === "edit" && before.status === "published"))) {
      const demoted = await demoteOtherBreaking(tx, language, id, input.updateReason ?? null, "nashr-sabq");
      cleared = demoted.cleared; clearedEnglish = demoted.english;
    }
    await recordBotEditorAudit(tx, { language, articleId: id, actorId: null, operation, originalSource: language === "ar" ? before.source : before.seoMetadata?.source, before: auditBefore, after: { ...after, ...auditAfterExtra }, updateReason: input.updateReason ?? input.reason ?? noteOf(input), actorName: operation === "archive" && before.status !== "published" ? "nashr-sabq" : undefined });
    return { before, after };
  });
  if (cleared.length) invalidateClearedBreakingArticles(cleared, `bot-editor:${operation}`);
  for (const item of clearedEnglish) queueEnBotDraftSurfaceEffects(item, "visibility");
  memoryCache.invalidatePattern("^articles:");
  if (language === "ar") {
    if (operation === "edit" && result.before.status === "published") queueBotDraftPublishedContentEffects(result.after, "nashr-sabq");
    else if (operation === "visibility") queueBotDraftVisibilityEffects(result.after, result.before.newsType, "nashr-sabq");
    else if (operation === "restore") queueBotDraftRestoreEffects(result.after, "nashr-sabq");
    else if (operation === "archive" || operation === "unpublish") {
      invalidateArticleWrite(result.after, { reason: `bot-editor:${operation}`, warm: false });
      memoryCache.delete("lite-feed");
      clearNewsSitemapMemoryCache();
      void invalidateSitemapXmlCache(["__sitemapArticlesCanonicalV3", "index_archive_v4"]).catch(console.error);
      void (async () => {
        const paths = ["/sitemap-news.xml", "/sitemap.xml", "/api/rss/articles", "/api/rss/articles.json"];
        const response = await db.execute(sql`SELECT (abs(hashtext(${id}::text)) % ${AR_SITEMAP_BUCKETS}) + 1 AS bucket`);
        const rows = (response as any).rows ?? response;
        const bucket = Number(rows[0]?.bucket);
        if (Number.isInteger(bucket) && bucket >= 1 && bucket <= AR_SITEMAP_BUCKETS) paths.push(`/sitemap-articles-${bucket}.xml`);
        if (result.after.categoryId) {
          const [category] = await db.select({ slug: categories.slug }).from(categories).where(eq(categories.id, result.after.categoryId)).limit(1);
          if (category?.slug) paths.push(`/api/rss/articles/category/${encodeURIComponent(category.slug)}`);
        }
        await purgeContentSurfaces(paths, { immediate: true });
      })().catch(console.error);
    } else invalidateArticleWrite(result.after, { reason: `bot-editor:${operation}`, warm: false });
  }
  else queueEnBotDraftSurfaceEffects(result.after, operation === "archive" || operation === "unpublish" ? "archive" : operation === "visibility" ? "visibility" : "update");
  const [category]: any[] = result.after.categoryId ? await db.select({ slug: categoryTable.slug }).from(categoryTable).where(eq(categoryTable.id, result.after.categoryId)).limit(1) : [];
  const response = language === "ar" ? toBotDraftResponse(result.after, category?.slug ?? null) : toEnBotDraftResponse(result.after, category?.slug ?? null);
  return { ...response, updatable: editable.has(result.after.status) };
}

export async function editBotArticle(language: BotEditorLanguage, id: string, body: unknown, guard?: Guard) {
  return mutate(language, id, "edit", parse(botEditorEditSchema, body), guard);
}
export async function transitionBotArticle(language: BotEditorLanguage, id: string, action: "archive" | "restore" | "unpublish", body: unknown) {
  return mutate(language, id, action, action === "archive" ? parse(botEditorArchiveSchema, body) : parse(botEditorEmptySchema, body));
}
/**
 * «حذف» نشر سبق = أرشفة ناعمة كما في اللوحة (DELETE /api/admin/articles/:id)، لا حذف نهائي.
 * السبب وإصدار المادة (expectedUpdatedAt) إلزاميان لكل الحالات، والتدقيق في سجل الأحداث.
 */
export async function deleteBotArticle(language: BotEditorLanguage, id: string, body: unknown) {
  const input = parse(botEditorDeleteSchema, body);
  const result = await mutate(language, id, "archive", { reason: input.updateReason, updateReason: input.updateReason, expectedUpdatedAt: input.expectedUpdatedAt, __strictDelete: true });
  const { recordBotEditorOperation } = await import("./botEditorOperationsAudit");
  await recordBotEditorOperation({ actorId: null, operation: "delete_article", outcome: "succeeded", metadata: { language, articleId: id, softDelete: true } }).catch(() => undefined);
  return result;
}
export async function changeBotVisibility(language: BotEditorLanguage, id: string, body: unknown) {
  return mutate(language, id, "visibility", parse(botEditorVisibilitySchema, body));
}

/** Preflight before generation; the final edit still checks its CAS under lock. */
export async function assertBotEditorEditable(language: BotEditorLanguage, id: string): Promise<void> {
  const table: any = language === "ar" ? articles : enArticles;
  await db.transaction(async (tx) => {
    const [row]: any[] = await tx.select().from(table).where(eq(table.id, id)).limit(1).for("update");
    if (!row) throw new BotDraftError(404, "not_found", "الخبر غير موجود");
    if (row.articleType !== "news" && row.articleType !== "infographic") throw new BotDraftError(403, "forbidden_action", "نوع المادة غير مدعوم");
    if (!editable.has(row.status)) throw new BotDraftError(409, "not_a_draft", "حالة المادة لا تسمح بالتعديل", { status: row.status });
    await assertBotEditorUnlocked(tx, language, id, row);
  });
}
