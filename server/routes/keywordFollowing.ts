import { Router } from "express";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import { requireAuth, logActivity } from "../rbac";
import { tags, userFollowedTerms, articles, articleTags } from "@shared/schema";

const router: Router = Router();

// Follow a keyword
router.post("/api/keywords/follow", requireAuth, async (req: any, res) => {
  try {
    const { keyword } = req.body;
    const userId = req.user.id;

    if (!keyword || typeof keyword !== 'string') {
      return res.status(400).json({ message: "الكلمة المفتاحية مطلوبة" });
    }

    const slug = keyword.toLowerCase().trim().replace(/\s+/g, '-');
    let tag = await db.query.tags.findFirst({
      where: or(
        eq(tags.slug, slug),
        eq(tags.nameAr, keyword.trim())
      ),
    });

    if (!tag) {
      const [newTag] = await db.insert(tags).values({
        nameAr: keyword.trim(),
        nameEn: keyword.trim(),
        slug: slug,
        usageCount: 0,
        status: "active",
      }).returning();
      tag = newTag;
    }

    await db.insert(userFollowedTerms).values({
      userId,
      tagId: tag.id,
      notify: true,
    }).onConflictDoNothing();

    const currentCount = tag.usageCount || 0;
    await db.update(tags)
      .set({ usageCount: currentCount + 1 })
      .where(eq(tags.id, tag.id));

    await logActivity({
      userId,
      action: 'keyword_followed',
      entityType: 'tag',
      entityId: tag.id,
    });

    res.json({ success: true, tagId: tag.id });
  } catch (error) {
    console.error("Error following keyword:", error);
    res.status(500).json({ message: "حدث خطأ أثناء متابعة الكلمة" });
  }
});

// Unfollow a keyword
router.post("/api/keywords/unfollow", requireAuth, async (req: any, res) => {
  try {
    const { tagId } = req.body;
    const userId = req.user.id;

    if (!tagId) {
      return res.status(400).json({ message: "معرف الكلمة مطلوب" });
    }

    await db.delete(userFollowedTerms)
      .where(and(
        eq(userFollowedTerms.userId, userId),
        eq(userFollowedTerms.tagId, tagId)
      ));

    const currentTag = await db.query.tags.findFirst({
      where: eq(tags.id, tagId),
    });
    if (currentTag) {
      const newCount = Math.max(0, (currentTag.usageCount || 0) - 1);
      await db.update(tags)
        .set({ usageCount: newCount })
        .where(eq(tags.id, tagId));
    }

    await logActivity({
      userId,
      action: 'keyword_unfollowed',
      entityType: 'tag',
      entityId: tagId,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error unfollowing keyword:", error);
    res.status(500).json({ message: "حدث خطأ أثناء إلغاء متابعة الكلمة" });
  }
});

// Get followed keywords (legacy format)
router.get("/api/keywords/followed", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;

    const followedTerms = await db
      .select({
        id: userFollowedTerms.id,
        tagId: userFollowedTerms.tagId,
        notify: userFollowedTerms.notify,
        createdAt: userFollowedTerms.createdAt,
        tag: {
          id: tags.id,
          nameAr: tags.nameAr,
          nameEn: tags.nameEn,
          slug: tags.slug,
          usageCount: tags.usageCount,
          color: tags.color,
        },
      })
      .from(userFollowedTerms)
      .innerJoin(tags, eq(userFollowedTerms.tagId, tags.id))
      .where(eq(userFollowedTerms.userId, userId))
      .orderBy(desc(userFollowedTerms.createdAt));

    res.json(followedTerms);
  } catch (error) {
    console.error("Error fetching followed keywords:", error);
    res.status(500).json({ message: "حدث خطأ أثناء جلب الكلمات المتابعة" });
  }
});

// Get followed keywords (simplified format with article count)
router.get("/api/user/followed-keywords", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;

    const followedTerms = await db
      .select({
        tagId: userFollowedTerms.tagId,
        notify: userFollowedTerms.notify,
        tagName: tags.nameAr,
      })
      .from(userFollowedTerms)
      .innerJoin(tags, eq(userFollowedTerms.tagId, tags.id))
      .where(eq(userFollowedTerms.userId, userId))
      .orderBy(desc(userFollowedTerms.createdAt));

    const tagIds = followedTerms.map(t => t.tagId);
    const countRows = tagIds.length > 0
      ? await db
          .select({
            tagId: articleTags.tagId,
            count: sql<number>`count(*)::int`,
          })
          .from(articleTags)
          .innerJoin(articles, eq(articleTags.articleId, articles.id))
          .where(and(
            inArray(articleTags.tagId, tagIds),
            eq(articles.status, 'published')
          ))
          .groupBy(articleTags.tagId)
      : [];

    const countMap = new Map(countRows.map(r => [r.tagId, r.count]));

    const keywordsWithCount = followedTerms.map(term => ({
      tagId: term.tagId,
      tagName: term.tagName,
      notify: term.notify,
      articleCount: countMap.get(term.tagId) || 0,
    }));

    res.json(keywordsWithCount);
  } catch (error) {
    console.error("Error fetching followed keywords:", error);
    res.status(500).json({ message: "حدث خطأ أثناء جلب الكلمات المتابعة" });
  }
});

// Unfollow a keyword (DELETE method with path parameter)
router.delete("/api/keywords/unfollow/:tagId", requireAuth, async (req: any, res) => {
  try {
    const { tagId } = req.params;
    const userId = req.user.id;

    if (!tagId) {
      return res.status(400).json({ message: "معرف الكلمة مطلوب" });
    }

    await db.delete(userFollowedTerms)
      .where(and(
        eq(userFollowedTerms.userId, userId),
        eq(userFollowedTerms.tagId, tagId)
      ));

    const currentTag = await db.query.tags.findFirst({
      where: eq(tags.id, tagId),
    });
    if (currentTag) {
      const newCount = Math.max(0, (currentTag.usageCount || 0) - 1);
      await db.update(tags)
        .set({ usageCount: newCount })
        .where(eq(tags.id, tagId));
    }

    await logActivity({
      userId,
      action: 'keyword_unfollowed',
      entityType: 'tag',
      entityId: tagId,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error unfollowing keyword:", error);
    res.status(500).json({ message: "حدث خطأ أثناء إلغاء متابعة الكلمة" });
  }
});

export default router;
