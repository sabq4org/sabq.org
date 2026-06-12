/**
 * مُصدِّر الرادار — يحوّل مسودة المادة إلى مقال حقيقي بحالة "draft" ثم تفتح
 * الواجهة محرر المقالات عليه معبأً بالكامل. النشر نفسه يبقى قرارًا تحريريًا
 * بشريًا من داخل المحرر (ضغطة زر واحدة).
 */
import { nanoid } from "nanoid";
import { storage } from "../../storage";
import type { RadarItem } from "@shared/schema";
import { approvedCategories, categoryIdBySlug, getItem, getSource, updateItem } from "./repo";

function arabicSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^؀-ۿ\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 140);
  return `${base}-${nanoid(8)}`;
}

async function resolveCategoryId(
  item: RadarItem,
  sourceCategorySlug: string | null | undefined,
  overrideCategoryId?: string
): Promise<string> {
  if (overrideCategoryId) return overrideCategoryId;
  for (const slug of [item.draft?.categorySlug, item.suggestedCategorySlug, sourceCategorySlug, "world"]) {
    if (!slug) continue;
    const id = await categoryIdBySlug(slug);
    if (id) return id;
  }
  const fallback = await approvedCategories();
  if (!fallback.length) throw new Error("[Radar Export] no active categories found");
  return fallback[0].id;
}

export interface RadarExportResult {
  articleId: string;
  item: RadarItem;
}

export async function exportItemToArticle(
  itemId: string,
  userId: string,
  overrideCategoryId?: string
): Promise<RadarExportResult> {
  const item = await getItem(itemId);
  if (!item) throw new Error("RADAR_ITEM_NOT_FOUND");
  if (!item.draft) throw new Error("RADAR_DRAFT_MISSING");
  if (item.status === "exported" && item.exportedArticleId) {
    // تصدير سابق — أعد فتح نفس المقال بدل إنشاء نسخة مكررة
    return { articleId: item.exportedArticleId, item };
  }

  const source = await getSource(item.sourceId);
  const draft = item.draft;
  const categoryId = await resolveCategoryId(item, source?.categorySlug, overrideCategoryId);
  const now = new Date();

  const created = await storage.createArticle({
    title: draft.title,
    slug: arabicSlug(draft.title),
    content: draft.content,
    excerpt: (draft.excerpt || draft.summary || "").substring(0, 200) || undefined,
    aiSummary: draft.summary,
    locale: "ar",
    categoryId,
    authorId: userId,
    articleType: "news",
    newsType: item.isBreaking ? "breaking" : "regular",
    publishType: "instant",
    status: "draft",
    aiGenerated: true,
    sourceUrl: item.link,
    seo: {
      metaTitle: draft.seoTitle || draft.title,
      metaDescription: draft.seoDescription || draft.summary || "",
      keywords: draft.seoKeywords || [],
    },
    seoMetadata: {
      status: "generated",
      generatedAt: now.toISOString(),
      generatedBy: "smart-radar",
      provider: draft.provider || "anthropic",
      model: draft.model || "",
    },
    sourceMetadata: {
      type: "radar",
      radarItemId: item.id,
      sourceName: source?.name || null,
      sourceUrl: item.link,
      originalTitle: item.originalTitle,
      originalLanguage: item.originalLanguage,
    },
  } as any); // authorId/aiGenerated خارج insertArticleSchema — نفس نمط WC News وiFox

  const updated = await updateItem(item.id, {
    status: "exported",
    exportedArticleId: created.id,
    exportedAt: now,
    exportedBy: userId,
  });

  return { articleId: created.id, item: updated ?? item };
}
