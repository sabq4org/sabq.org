/**
 * إثراء سجل النشاط بعنوان الكيان ورابطه (مقال/رابط مختصر/تصنيف).
 * استُخرج من server/storage.ts في 2026-11-02 لتصغير الملف (ADR-001)؛ المنطق كما هو.
 */
import { db } from "../db";
import { or, inArray } from "drizzle-orm";
import { articles, categories } from "@shared/schema";

export async function enrichActivityLogsWithEntityInfo<
  T extends {
    entityType: string;
    entityId: string;
    oldValue: Record<string, any> | null;
    newValue: Record<string, any> | null;
  }
>(
  items: T[]
): Promise<
  Array<
    T & {
      entityInfo: {
        title: string | null;
        subtitle?: string | null;
        url?: string | null;
        status?: string | null;
      } | null;
    }
  >
> {
  if (!items.length) return [];

  const articleIds = new Set<string>();
  const articleSlugs = new Set<string>();
  const categoryIds = new Set<string>();

  for (const item of items) {
    const type = (item.entityType || "").toLowerCase();
    if (
      (type === "article" || type === "publisher_article") &&
      item.entityId &&
      !item.entityId.includes(",") &&
      !item.entityId.startsWith("draft-")
    ) {
      articleIds.add(item.entityId);
    } else if (type === "short_link") {
      const orig =
        typeof item.newValue?.originalUrl === "string"
          ? item.newValue.originalUrl
          : null;
      if (orig) {
        const match = orig.match(/\/article\/([^/?#\s]+)/i);
        if (match?.[1]) {
          try {
            articleSlugs.add(decodeURIComponent(match[1]));
          } catch {
            articleSlugs.add(match[1]);
          }
        }
      }
    } else if (type === "category" && item.entityId && !item.entityId.includes(",")) {
      categoryIds.add(item.entityId);
    }
  }

  const articleById = new Map<
    string,
    { id: string; title: string; slug: string; englishSlug: string | null; status: string }
  >();
  const articleBySlug = new Map<
    string,
    { id: string; title: string; slug: string; englishSlug: string | null; status: string }
  >();
  const categoryById = new Map<string, { id: string; nameAr: string; slug: string }>();

  try {
    const articleConditions: any[] = [];
    if (articleIds.size > 0) {
      articleConditions.push(inArray(articles.id, Array.from(articleIds)));
    }
    if (articleSlugs.size > 0) {
      const slugsArr = Array.from(articleSlugs);
      articleConditions.push(inArray(articles.slug, slugsArr));
      articleConditions.push(inArray(articles.englishSlug, slugsArr));
    }
    if (articleConditions.length > 0) {
      const rows = await db
        .select({
          id: articles.id,
          title: articles.title,
          slug: articles.slug,
          englishSlug: articles.englishSlug,
          status: articles.status,
        })
        .from(articles)
        .where(or(...articleConditions))
        .limit(100);
      for (const r of rows) {
        articleById.set(r.id, r);
        if (r.slug) articleBySlug.set(r.slug, r);
        if (r.englishSlug) articleBySlug.set(r.englishSlug, r);
      }
    }
  } catch (err) {
    console.warn("[ActivityLogs] Failed to batch-resolve articles:", err);
  }

  try {
    if (categoryIds.size > 0) {
      const cats = await db
        .select({
          id: categories.id,
          nameAr: categories.nameAr,
          slug: categories.slug,
        })
        .from(categories)
        .where(inArray(categories.id, Array.from(categoryIds)))
        .limit(50);
      for (const c of cats) {
        categoryById.set(c.id, c);
      }
    }
  } catch (err) {
    console.warn("[ActivityLogs] Failed to batch-resolve categories:", err);
  }

  return items.map((item) => {
    const type = (item.entityType || "").toLowerCase();
    const nv = item.newValue || {};
    const ov = item.oldValue || {};

    if (type === "article" || type === "en_article" || type === "ur_article" || type === "publisher_article") {
      const resolved = articleById.get(item.entityId);
      const title =
        resolved?.title ||
        (typeof nv.title === "string" && nv.title.trim() ? nv.title : null) ||
        (typeof ov.title === "string" && ov.title.trim() ? ov.title : null);
      const slug =
        resolved?.englishSlug ||
        resolved?.slug ||
        (typeof nv.englishSlug === "string" ? nv.englishSlug : null) ||
        (typeof nv.slug === "string" ? nv.slug : null) ||
        (typeof ov.englishSlug === "string" ? ov.englishSlug : null) ||
        (typeof ov.slug === "string" ? ov.slug : null);
      const status =
        resolved?.status ||
        (typeof nv.status === "string" ? nv.status : null) ||
        (typeof ov.status === "string" ? ov.status : null);

      let subtitle: string | null = null;
      if (typeof nv.primary === "string") {
        const suggested = Array.isArray(nv.suggested) && nv.suggested.length > 0
          ? ` · مقترحات: ${nv.suggested.join("، ")}`
          : "";
        subtitle = `التصنيف الذكي: ${nv.primary}${suggested}`;
      } else if (typeof nv.metaTitle === "string") {
        subtitle = `عنوان SEO: ${nv.metaTitle}`;
      } else if (typeof nv.count === "number") {
        subtitle = `عدد المقالات المتأثرة: ${nv.count}`;
      }

      return {
        ...item,
        entityInfo:
          title || subtitle || slug
            ? {
                title,
                subtitle,
                url: slug ? `/article/${slug}` : null,
                status,
              }
            : null,
      };
    }

    if (type === "short_link") {
      const shortCode = typeof nv.shortCode === "string" ? nv.shortCode : null;
      const originalUrl = typeof nv.originalUrl === "string" ? nv.originalUrl : null;
      let linkedArticle: { title: string; slug: string; englishSlug: string | null; status: string } | undefined;
      if (originalUrl) {
        const match = originalUrl.match(/\/article\/([^/?#\s]+)/i);
        if (match?.[1]) {
          try {
            linkedArticle = articleBySlug.get(decodeURIComponent(match[1])) || articleBySlug.get(match[1]);
          } catch {
            linkedArticle = articleBySlug.get(match[1]);
          }
        }
      }
      return {
        ...item,
        entityInfo: {
          title: linkedArticle?.title || (shortCode ? `رابط مختصر: sabq.org/s/${shortCode}` : originalUrl),
          subtitle: shortCode ? `sabq.org/s/${shortCode}` : originalUrl,
          url: originalUrl || (shortCode ? `/s/${shortCode}` : null),
          status: linkedArticle?.status || null,
        },
      };
    }

    if (type === "category") {
      const cat = categoryById.get(item.entityId);
      const title =
        cat?.nameAr ||
        (typeof nv.nameAr === "string" ? nv.nameAr : null) ||
        (typeof ov.nameAr === "string" ? ov.nameAr : null) ||
        (typeof nv.name === "string" ? nv.name : null);
      return {
        ...item,
        entityInfo: title ? { title, subtitle: cat?.slug || null, url: cat?.slug ? `/category/${cat.slug}` : null } : null,
      };
    }

    const genericTitle =
      (typeof nv.title === "string" ? nv.title : null) ||
      (typeof ov.title === "string" ? ov.title : null) ||
      (typeof nv.nameAr === "string" ? nv.nameAr : null) ||
      (typeof nv.name === "string" ? nv.name : null) ||
      (typeof nv.email === "string" ? nv.email : null);

    return {
      ...item,
      entityInfo: genericTitle ? { title: genericTitle } : null,
    };
  });
}
