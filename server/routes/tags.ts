import type { Express } from "express";
import { db } from "../db";
import { eq, and, or, desc, sql, ilike } from "drizzle-orm";
import {
  tags,
  articleTags,
  articles,
  insertTagSchema,
  updateTagSchema,
} from "@shared/schema";
import { requireAuth, requireRole, logActivity } from "../rbac";
import { generateEnglishSlug } from "../utils/slugTransliterator";

function generateSlug(text: string): string {
  return generateEnglishSlug(text);
}

export function registerTagRoutes(app: Express) {
  app.get("/api/tags", async (req, res) => {
    try {
      const { status, search } = req.query;

      let query = db.select().from(tags);

      // Build where conditions
      const conditions = [];
      
      if (status) {
        conditions.push(eq(tags.status, status as string));
      }
      
      if (search) {
        const searchTerm = `%${search}%`;
        conditions.push(
          or(
            ilike(tags.nameAr, searchTerm),
            ilike(tags.nameEn, searchTerm)
          )
        );
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      const result = await query.orderBy(desc(tags.usageCount)).limit(1000);

      res.json(result);
    } catch (error) {
      console.error("Error fetching tags:", error);
      res.status(500).json({ message: "فشل في جلب الوسوم" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // 2. GET /api/tags/:id - Get specific tag with article count
  app.get("/api/tags/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const [tag] = await db
        .select()
        .from(tags)
        .where(eq(tags.id, id))
        .limit(1);

      if (!tag) {
        return res.status(404).json({ message: "الوسم غير موجود" });
      }

      // Count associated articles
      const [articleCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(articleTags)
        .where(eq(articleTags.tagId, id));

      res.json({
        ...tag,
        articleCount: articleCount?.count || 0,
      });
    } catch (error) {
      console.error("Error fetching tag:", error);
      res.status(500).json({ message: "فشل في جلب الوسم" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // 3. POST /api/tags - Create new tag (admin & editor only)
  app.post("/api/tags", requireAuth, requireRole("admin", "editor"), async (req: any, res) => {
    try {
      const parsed = insertTagSchema.safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({ 
          message: "بيانات غير صحيحة",
          errors: parsed.error.errors 
        });
      }

      const data = parsed.data;

      // Generate slug automatically from nameEn or nameAr
      const slug = data.slug || generateSlug(data.nameEn || data.nameAr);

      // Check if slug already exists
      const [existingTag] = await db
        .select()
        .from(tags)
        .where(eq(tags.slug, slug))
        .limit(1);

      if (existingTag) {
        return res.status(409).json({ message: "الوسم موجود بالفعل (slug مكرر)" });
      }

      // Create tag
      const [newTag] = await db
        .insert(tags)
        .values({
          ...data,
          slug,
          usageCount: 0,
        })
        .returning();

      await logActivity({
        userId: req.user.id,
        action: "create",
        entityType: "tag",
        entityId: newTag.id,
        newValue: newTag,
      });

      res.status(201).json(newTag);
    } catch (error) {
      console.error("Error creating tag:", error);
      res.status(500).json({ message: "فشل في إنشاء الوسم" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // 4. PATCH /api/tags/:id - Update tag (admin & editor only)
  app.patch("/api/tags/:id", requireAuth, requireRole("admin", "editor"), async (req: any, res) => {
    try {
      const { id } = req.params;

      const parsed = updateTagSchema.safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({ 
          message: "بيانات غير صحيحة",
          errors: parsed.error.errors 
        });
      }

      const data = parsed.data;

      // Check if tag exists
      const [existingTag] = await db
        .select()
        .from(tags)
        .where(eq(tags.id, id))
        .limit(1);

      if (!existingTag) {
        return res.status(404).json({ message: "الوسم غير موجود" });
      }

      // If slug is being updated, check for duplicates
      if (data.slug && data.slug !== existingTag.slug) {
        const [duplicateTag] = await db
          .select()
          .from(tags)
          .where(eq(tags.slug, data.slug))
          .limit(1);

        if (duplicateTag) {
          return res.status(409).json({ message: "الوسم موجود بالفعل (slug مكرر)" });
        }
      }

      // Update tag
      const [updatedTag] = await db
        .update(tags)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(tags.id, id))
        .returning();

      await logActivity({
        userId: req.user.id,
        action: "update",
        entityType: "tag",
        entityId: id,
        oldValue: existingTag,
        newValue: updatedTag,
      });

      res.json(updatedTag);
    } catch (error) {
      console.error("Error updating tag:", error);
      res.status(500).json({ message: "فشل في تحديث الوسم" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // 5. DELETE /api/tags/:id - Delete tag (admin only)
  app.delete("/api/tags/:id", requireAuth, requireRole("admin"), async (req: any, res) => {
    try {
      const { id } = req.params;

      // Check if tag exists
      const [existingTag] = await db
        .select()
        .from(tags)
        .where(eq(tags.id, id))
        .limit(1);

      if (!existingTag) {
        return res.status(404).json({ message: "الوسم غير موجود" });
      }

      // Delete all article-tag relations first
      await db
        .delete(articleTags)
        .where(eq(articleTags.tagId, id));

      // Delete the tag
      await db
        .delete(tags)
        .where(eq(tags.id, id));

      await logActivity({
        userId: req.user.id,
        action: "delete",
        entityType: "tag",
        entityId: id,
        oldValue: existingTag,
      });

      res.json({ message: "تم حذف الوسم بنجاح" });
    } catch (error) {
      console.error("Error deleting tag:", error);
      res.status(500).json({ message: "فشل في حذف الوسم" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // 6. GET /api/tags/:id/articles - Get articles for a specific tag
  app.get("/api/tags/:id/articles", async (req, res) => {
    try {
      const { id } = req.params;

      // Check if tag exists
      const [tag] = await db
        .select()
        .from(tags)
        .where(eq(tags.id, id))
        .limit(1);

      if (!tag) {
        return res.status(404).json({ message: "الوسم غير موجود" });
      }

      // Get articles with tag
      const result = await db
        .select({
          id: articles.id,
          title: articles.title,
        subtitle: articles.subtitle,
          slug: articles.slug,
          imageUrl: articles.imageUrl,
          imageFocalPoint: articles.imageFocalPoint,
          excerpt: articles.excerpt,
          publishedAt: articles.publishedAt,
          views: articles.views,
          status: articles.status,
        })
        .from(articleTags)
        .innerJoin(articles, eq(articleTags.articleId, articles.id))
        .where(eq(articleTags.tagId, id))
        .orderBy(desc(articles.publishedAt));

      res.json(result);
    } catch (error) {
      console.error("Error fetching tag articles:", error);
      res.status(500).json({ message: "فشل في جلب مقالات الوسم" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // 7. POST /api/articles/:articleId/tags - Link tag to article (admin & editor only)
  app.post("/api/articles/:articleId/tags", requireAuth, requireRole("admin", "editor"), async (req: any, res) => {
    try {
      const { articleId } = req.params;
      const { tagId } = req.body;

      if (!tagId) {
        return res.status(400).json({ message: "معرف الوسم مطلوب" });
      }

      // Check if article exists
      const [article] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, articleId))
        .limit(1);

      if (!article) {
        return res.status(404).json({ message: "المقالة غير موجودة" });
      }

      // Check if tag exists
      const [tag] = await db
        .select()
        .from(tags)
        .where(eq(tags.id, tagId))
        .limit(1);

      if (!tag) {
        return res.status(404).json({ message: "الوسم غير موجود" });
      }

      // Check if relation already exists
      const [existingRelation] = await db
        .select()
        .from(articleTags)
        .where(
          and(
            eq(articleTags.articleId, articleId),
            eq(articleTags.tagId, tagId)
          )
        )
        .limit(1);

      if (existingRelation) {
        return res.status(409).json({ message: "الوسم مرتبط بالمقالة بالفعل" });
      }

      // Create relation
      await db
        .insert(articleTags)
        .values({
          articleId,
          tagId,
        });

      // Update usage count (+1)
      await db
        .update(tags)
        .set({
          usageCount: sql`${tags.usageCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(tags.id, tagId));

      await logActivity({
        userId: req.user.id,
        action: "link",
        entityType: "article_tag",
        entityId: articleId,
        newValue: { articleId, tagId },
      });

      res.status(201).json({ message: "تم ربط الوسم بالمقالة بنجاح" });
    } catch (error) {
      console.error("Error linking tag to article:", error);
      res.status(500).json({ message: "فشل في ربط الوسم" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // 8. DELETE /api/articles/:articleId/tags/:tagId - Unlink tag from article (admin & editor only)
  app.delete("/api/articles/:articleId/tags/:tagId", requireAuth, requireRole("admin", "editor"), async (req: any, res) => {
    try {
      const { articleId, tagId } = req.params;

      // Check if relation exists
      const [relation] = await db
        .select()
        .from(articleTags)
        .where(
          and(
            eq(articleTags.articleId, articleId),
            eq(articleTags.tagId, tagId)
          )
        )
        .limit(1);

      if (!relation) {
        return res.status(404).json({ message: "الربط غير موجود" });
      }

      // Delete relation
      await db
        .delete(articleTags)
        .where(
          and(
            eq(articleTags.articleId, articleId),
            eq(articleTags.tagId, tagId)
          )
        );

      // Update usage count (-1)
      await db
        .update(tags)
        .set({
          usageCount: sql`GREATEST(${tags.usageCount} - 1, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(tags.id, tagId));

      await logActivity({
        userId: req.user.id,
        action: "unlink",
        entityType: "article_tag",
        entityId: articleId,
        oldValue: { articleId, tagId },
      });

      res.json({ message: "تم فك ربط الوسم بنجاح" });
    } catch (error) {
      console.error("Error unlinking tag from article:", error);
      res.status(500).json({ message: "فشل في فك الربط" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // 9. GET /api/articles/:articleId/tags - Get tags for an article
  app.get("/api/articles/:articleId/tags", async (req, res) => {
    try {
      const { articleId } = req.params;

      // Check if article exists
      const [article] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, articleId))
        .limit(1);

      if (!article) {
        return res.status(404).json({ message: "المقالة غير موجودة" });
      }

      // Get tags for article
      const result = await db
        .select({
          id: tags.id,
          nameAr: tags.nameAr,
          nameEn: tags.nameEn,
          slug: tags.slug,
          color: tags.color,
          description: tags.description,
          usageCount: tags.usageCount,
          status: tags.status,
        })
        .from(articleTags)
        .innerJoin(tags, eq(articleTags.tagId, tags.id))
        .where(eq(articleTags.articleId, articleId));

      res.json(result);
    } catch (error) {
      console.error("Error fetching article tags:", error);
      res.status(500).json({ message: "فشل في جلب وسوم المقالة" });
    }
  });
}
