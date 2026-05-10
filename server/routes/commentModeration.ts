import { Router, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { moderateComment, getStatusFromClassification, ModerationResult } from "../ai/commentModeration";
import { z } from "zod";
import { db } from "../db";
import { userRoles, roles, users, comments } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

const router = Router();

// List of moderator roles that can access comment moderation features
const MODERATOR_ROLES = ['admin', 'superadmin', 'editor', 'chief_editor', 'moderator', 'comments_moderator'];

async function requireModeratorAuth(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ error: "يجب تسجيل الدخول للقيام بهذا الإجراء" });
  }
  
  // Check 1: Legacy role field in users table
  if (user.role && MODERATOR_ROLES.includes(user.role)) {
    return next();
  }
  
  // Check 2: RBAC user_roles table (for new role-based system)
  try {
    const rbacRoles = await db
      .select({ roleName: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, user.id));
    
    const userRoleNames = rbacRoles.map(r => r.roleName);
    const hasModeratorRole = userRoleNames.some(roleName => MODERATOR_ROLES.includes(roleName));
    
    if (hasModeratorRole) {
      console.log(`[Moderation] RBAC auth granted for user ${user.email} with roles: ${userRoleNames.join(', ')}`);
      return next();
    }
    
    console.log(`[Moderation] Access denied for user ${user.email}. Legacy role: ${user.role}, RBAC roles: ${userRoleNames.join(', ')}`);
  } catch (error) {
    console.error("[Moderation] RBAC check error:", error);
  }
  
  return res.status(403).json({ error: "ليس لديك صلاحية للوصول إلى هذه الميزة" });
}

// Analyze a comment with AI
router.post("/analyze", async (req: Request, res: Response) => {
  try {
    const { comment } = req.body;
    
    if (!comment || typeof comment !== "string") {
      return res.status(400).json({ error: "يجب توفير نص التعليق" });
    }

    const result = await moderateComment(comment);
    res.json(result);
  } catch (error) {
    console.error("[Moderation API] Error:", error);
    res.status(500).json({ error: "حدث خطأ أثناء تحليل التعليق" });
  }
});

// Get AI moderation statistics (for dashboard)
router.get("/stats", async (req: Request, res: Response) => {
  try {
    const stats = await storage.getAIModerationStats();
    res.json(stats);
  } catch (error) {
    console.error("[Moderation API] Stats error:", error);
    res.status(500).json({ error: "حدث خطأ أثناء جلب الإحصائيات" });
  }
});

// Get moderation results with filters
router.get("/results", async (req: Request, res: Response) => {
  try {
    const { classification, minScore, maxScore, limit = "50" } = req.query;
    
    const results = await storage.getModerationResults({
      classification: classification as string | undefined,
      minScore: minScore ? parseInt(minScore as string, 10) : undefined,
      maxScore: maxScore ? parseInt(maxScore as string, 10) : undefined,
      limit: parseInt(limit as string, 10),
    });
    
    res.json(results);
  } catch (error) {
    console.error("[Moderation API] Results error:", error);
    res.status(500).json({ error: "حدث خطأ أثناء جلب النتائج" });
  }
});

// Analyze all pending comments
router.post("/analyze-all", async (req: Request, res: Response) => {
  try {
    const pendingComments = await storage.getUnanalyzedComments(50);
    
    let analyzed = 0;
    for (const comment of pendingComments) {
      try {
        const result = await moderateComment(comment.content);
        await storage.updateCommentModeration(comment.id, {
          aiModerationScore: result.score,
          aiClassification: result.classification,
          aiDetectedIssues: result.detected,
          aiModerationReason: result.reason,
          aiAnalyzedAt: new Date(),
        });
        analyzed++;
      } catch (err) {
        console.error(`[Moderation] Failed to analyze comment ${comment.id}:`, err);
      }
    }
    
    res.json({ success: true, count: analyzed });
  } catch (error) {
    console.error("[Moderation API] Analyze all error:", error);
    res.status(500).json({ error: "حدث خطأ أثناء تحليل التعليقات" });
  }
});

// Analyze a single comment by ID
router.post("/analyze/:commentId", async (req: Request, res: Response) => {
  try {
    const { commentId } = req.params;
    
    const comment = await storage.getCommentById(commentId);
    if (!comment) {
      return res.status(404).json({ error: "التعليق غير موجود" });
    }

    const result = await moderateComment(comment.content);
    
    await storage.updateCommentModeration(commentId, {
      aiModerationScore: result.score,
      aiClassification: result.classification,
      aiDetectedIssues: result.detected,
      aiModerationReason: result.reason,
      aiAnalyzedAt: new Date(),
    });

    res.json({ success: true, result });
  } catch (error) {
    console.error("[Moderation API] Analyze single error:", error);
    res.status(500).json({ error: "حدث خطأ أثناء تحليل التعليق" });
  }
});

// Get comments for moderation with filters
router.get("/comments", async (req: Request, res: Response) => {
  try {
    const { 
      classification, 
      status, 
      page = "1", 
      limit = "20",
      search 
    } = req.query;

    const filters = {
      classification: classification as string | undefined,
      status: status as string | undefined,
      search: search as string | undefined,
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
    };

    const result = await storage.getCommentsForModeration(filters);
    res.json(result);
  } catch (error) {
    console.error("[Moderation API] Comments error:", error);
    res.status(500).json({ error: "حدث خطأ أثناء جلب التعليقات" });
  }
});

// Re-analyze a comment
router.post("/reanalyze/:commentId", requireModeratorAuth, async (req: Request, res: Response) => {
  try {
    const { commentId } = req.params;
    
    const comment = await storage.getCommentById(commentId);
    if (!comment) {
      return res.status(404).json({ error: "التعليق غير موجود" });
    }

    const result = await moderateComment(comment.content);
    
    await storage.updateCommentModeration(commentId, {
      aiModerationScore: result.score,
      aiClassification: result.classification,
      aiDetectedIssues: result.detected,
      aiModerationReason: result.reason,
      aiAnalyzedAt: new Date(),
    });

    res.json({ success: true, result });
  } catch (error) {
    console.error("[Moderation API] Reanalyze error:", error);
    res.status(500).json({ error: "حدث خطأ أثناء إعادة التحليل" });
  }
});

// Approve a comment
router.post("/approve/:commentId", requireModeratorAuth, async (req: Request, res: Response) => {
  try {
    const { commentId } = req.params;
    const userId = (req as any).user?.id;

    await storage.updateCommentStatus(commentId, {
      status: "approved",
      moderatedBy: userId,
      moderatedAt: new Date(),
    });

    res.json({ success: true });
  } catch (error) {
    console.error("[Moderation API] Approve error:", error);
    res.status(500).json({ error: "حدث خطأ أثناء اعتماد التعليق" });
  }
});

// Reject a comment
router.post("/reject/:commentId", requireModeratorAuth, async (req: Request, res: Response) => {
  try {
    const { commentId } = req.params;
    const { reason } = req.body;
    const userId = (req as any).user?.id;

    await storage.updateCommentStatus(commentId, {
      status: "rejected",
      moderatedBy: userId,
      moderatedAt: new Date(),
      moderationReason: reason,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("[Moderation API] Reject error:", error);
    res.status(500).json({ error: "حدث خطأ أثناء رفض التعليق" });
  }
});

// Bulk actions
router.post("/bulk", requireModeratorAuth, async (req: Request, res: Response) => {
  try {
    const { commentIds, action, reason } = req.body;
    const userId = (req as any).user?.id;

    if (!Array.isArray(commentIds) || commentIds.length === 0) {
      return res.status(400).json({ error: "يجب توفير قائمة التعليقات" });
    }

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "إجراء غير صالح" });
    }

    const status = action === "approve" ? "approved" : "rejected";
    
    for (const commentId of commentIds) {
      await storage.updateCommentStatus(commentId, {
        status,
        moderatedBy: userId,
        moderatedAt: new Date(),
        moderationReason: action === "reject" ? reason : undefined,
      });
    }

    res.json({ success: true, count: commentIds.length });
  } catch (error) {
    console.error("[Moderation API] Bulk error:", error);
    res.status(500).json({ error: "حدث خطأ أثناء تنفيذ الإجراء" });
  }
});

// Edit a comment with audit trail
const editCommentSchema = z.object({
  content: z.string().min(1, "يجب توفير محتوى التعليق").max(5000, "التعليق طويل جداً"),
  reason: z.string().max(500, "السبب طويل جداً").optional(),
});

router.put("/edit/:commentId", requireModeratorAuth, async (req: Request, res: Response) => {
  try {
    const { commentId } = req.params;
    
    // Check authentication first - before any other operation
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "يجب تسجيل الدخول للقيام بهذا الإجراء" });
    }

    // Validate request body
    const parsed = editCommentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: parsed.error.errors[0].message,
        field: parsed.error.errors[0].path[0]
      });
    }

    const { content, reason } = parsed.data;
    
    // Verify comment exists before attempting edit
    const existingComment = await storage.getCommentById(commentId);
    if (!existingComment) {
      return res.status(404).json({ error: "التعليق غير موجود" });
    }
    
    const updatedComment = await storage.editCommentWithHistory(
      commentId, 
      content.trim(), 
      userId, 
      reason?.trim()
    );

    res.json({ success: true, comment: updatedComment });
  } catch (error) {
    console.error("[Moderation API] Edit error:", error);
    const message = error instanceof Error ? error.message : "حدث خطأ أثناء تعديل التعليق";
    res.status(500).json({ error: message });
  }
});

// Delete a comment with audit trail
const deleteCommentSchema = z.object({
  reason: z.string().max(500, "السبب طويل جداً").optional(),
});

router.delete("/delete/:commentId", requireModeratorAuth, async (req: Request, res: Response) => {
  try {
    const { commentId } = req.params;
    
    // Check authentication first - before any other operation
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "يجب تسجيل الدخول للقيام بهذا الإجراء" });
    }

    // Validate request body
    const parsed = deleteCommentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: parsed.error.errors[0].message,
        field: parsed.error.errors[0].path[0]
      });
    }

    const { reason } = parsed.data;
    
    // Verify comment exists before attempting delete
    const existingComment = await storage.getCommentById(commentId);
    if (!existingComment) {
      return res.status(404).json({ error: "التعليق غير موجود" });
    }
    
    await storage.deleteCommentWithLog(commentId, userId, reason?.trim());

    res.json({ success: true });
  } catch (error) {
    console.error("[Moderation API] Delete error:", error);
    const message = error instanceof Error ? error.message : "حدث خطأ أثناء حذف التعليق";
    res.status(500).json({ error: message });
  }
});

// Get edit history for a comment
router.get("/history/:commentId", async (req: Request, res: Response) => {
  try {
    const { commentId } = req.params;
    
    const history = await storage.getCommentEditHistory(commentId);
    
    res.json(history);
  } catch (error) {
    console.error("[Moderation API] History error:", error);
    res.status(500).json({ error: "حدث خطأ أثناء جلب سجل التعديلات" });
  }
});

// Get comment with article details
router.get("/details/:commentId", async (req: Request, res: Response) => {
  try {
    const { commentId } = req.params;
    
    const result = await storage.getCommentWithArticle(commentId);
    
    if (!result) {
      return res.status(404).json({ error: "التعليق غير موجود" });
    }
    
    res.json(result);
  } catch (error) {
    console.error("[Moderation API] Details error:", error);
    res.status(500).json({ error: "حدث خطأ أثناء جلب تفاصيل التعليق" });
  }
});

// Get member profile with statistics (for moderators)
router.get("/member/:memberId", requireModeratorAuth, async (req: Request, res: Response) => {
  try {
    const { memberId } = req.params;
    
    const profile = await storage.getMemberModerationProfile(memberId);
    
    if (!profile) {
      return res.status(404).json({ error: "العضو غير موجود" });
    }
    
    res.json(profile);
  } catch (error) {
    console.error("[Moderation API] Member profile error:", error);
    res.status(500).json({ error: "حدث خطأ أثناء جلب ملف العضو" });
  }
});

// Get member comment history with filtering (for moderators)
router.get("/member/:memberId/comments", requireModeratorAuth, async (req: Request, res: Response) => {
  try {
    const { memberId } = req.params;
    const { status, classification, sortBy, sortOrder, limit, offset } = req.query;
    
    const result = await storage.getMemberCommentHistory(memberId, {
      status: status as string,
      classification: classification as string,
      sortBy: sortBy as 'date' | 'score',
      sortOrder: sortOrder as 'asc' | 'desc',
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    
    res.json(result);
  } catch (error) {
    console.error("[Moderation API] Member comments error:", error);
    res.status(500).json({ error: "حدث خطأ أثناء جلب تعليقات العضو" });
  }
});

// Bulk action on member's comments (for moderators) - Specific IDs
const bulkActionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  commentIds: z.array(z.string()).min(1, "يجب تحديد تعليق واحد على الأقل"),
  reason: z.string().optional(),
});

router.post("/member/:memberId/bulk-action", requireModeratorAuth, async (req: Request, res: Response) => {
  try {
    const { memberId } = req.params;
    const moderatorId = (req as any).user?.id;
    
    // Validate request
    const parsed = bulkActionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: parsed.error.errors[0].message,
        field: parsed.error.errors[0].path[0]
      });
    }
    
    const { action, commentIds, reason } = parsed.data;
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    
    // Process each comment with full audit data
    const results = { success: 0, failed: 0 };
    const now = new Date();
    for (const commentId of commentIds) {
      try {
        await storage.updateCommentStatus(commentId, {
          status: newStatus,
          moderatedBy: moderatorId,
          moderatedAt: now,
          moderationReason: reason || (action === 'approve' 
            ? 'تم الاعتماد الجماعي' 
            : 'تم الرفض الجماعي'),
        });
        results.success++;
      } catch {
        results.failed++;
      }
    }
    
    res.json({ 
      success: true, 
      message: `تم تنفيذ الإجراء على ${results.success} تعليق`,
      results
    });
  } catch (error) {
    console.error("[Moderation API] Bulk action error:", error);
    res.status(500).json({ error: "حدث خطأ أثناء تنفيذ الإجراء الجماعي" });
  }
});

// Bulk action on ALL member's comments by filter (for moderators)
const bulkActionByFilterSchema = z.object({
  action: z.enum(['approve', 'reject']),
  filter: z.enum(['pending', 'flagged']),
  reason: z.string().optional(),
});

router.post("/member/:memberId/bulk-action-by-filter", requireModeratorAuth, async (req: Request, res: Response) => {
  try {
    const { memberId } = req.params;
    const moderatorId = (req as any).user?.id;
    
    // Validate request
    const parsed = bulkActionByFilterSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: parsed.error.errors[0].message,
        field: parsed.error.errors[0].path[0]
      });
    }
    
    const { action, filter, reason } = parsed.data;
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    
    // Get all member's comments matching the filter
    const allComments = await storage.getMemberCommentHistory(memberId, {
      status: filter === 'pending' ? 'pending' : undefined,
      classification: filter === 'flagged' ? undefined : undefined,
      limit: 1000,
    });
    
    // Filter by classification if needed
    let commentIds = allComments.comments.map(c => c.id);
    if (filter === 'flagged') {
      commentIds = allComments.comments
        .filter(c => c.aiClassification && ['flagged', 'spam', 'harmful'].includes(c.aiClassification))
        .map(c => c.id);
    } else if (filter === 'pending') {
      commentIds = allComments.comments
        .filter(c => c.status === 'pending')
        .map(c => c.id);
    }
    
    if (commentIds.length === 0) {
      return res.json({ 
        success: true, 
        message: "لا توجد تعليقات مطابقة",
        results: { success: 0, failed: 0 }
      });
    }
    
    // Process each comment with full audit data
    const results = { success: 0, failed: 0 };
    const now = new Date();
    for (const commentId of commentIds) {
      try {
        await storage.updateCommentStatus(commentId, {
          status: newStatus,
          moderatedBy: moderatorId,
          moderatedAt: now,
          moderationReason: reason || (action === 'approve' 
            ? 'تم الاعتماد الجماعي' 
            : 'تم الرفض الجماعي'),
        });
        results.success++;
      } catch {
        results.failed++;
      }
    }
    
    res.json({ 
      success: true, 
      message: `تم تنفيذ الإجراء على ${results.success} تعليق`,
      results
    });
  } catch (error) {
    console.error("[Moderation API] Bulk action by filter error:", error);
    res.status(500).json({ error: "حدث خطأ أثناء تنفيذ الإجراء الجماعي" });
  }
});

// =============================================
// Advanced Search API - البحث المتقدم في الرقابة الذكية
// =============================================

// Search comments with advanced filters
const searchCommentsSchema = z.object({
  query: z.string().optional(),
  userId: z.string().optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'flagged']).optional(),
  aiClassification: z.enum(['safe', 'flagged', 'spam', 'harmful']).optional(),
  dateFrom: z.string().optional().transform(val => val ? new Date(val) : undefined),
  dateTo: z.string().optional().transform(val => val ? new Date(val) : undefined),
  sortBy: z.enum(['relevance', 'date', 'score']).optional().default('date'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

router.get("/search/comments", async (req: Request, res: Response) => {
  try {
    const parsed = searchCommentsSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: "معلمات البحث غير صالحة",
        details: parsed.error.flatten()
      });
    }

    const params = parsed.data;
    console.log("[Moderation Search] Comments search params:", params);

    const results = await storage.searchModerationComments({
      query: params.query,
      userId: params.userId,
      status: params.status,
      aiClassification: params.aiClassification,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
      page: params.page,
      limit: params.limit,
    });

    res.json(results);
  } catch (error) {
    console.error("[Moderation Search] Comments search error:", error);
    res.status(500).json({ error: "حدث خطأ أثناء البحث في التعليقات" });
  }
});

// Search articles with their comments
const searchArticlesSchema = z.object({
  query: z.string().optional(),
  categoryId: z.string().optional(),
  publishFrom: z.string().optional().transform(val => val ? new Date(val) : undefined),
  publishTo: z.string().optional().transform(val => val ? new Date(val) : undefined),
  includeComments: z.string().optional().transform(val => val !== 'false'),
  sortBy: z.enum(['relevance', 'date', 'comments', 'engagement']).optional().default('date'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

router.get("/search/articles", async (req: Request, res: Response) => {
  try {
    const parsed = searchArticlesSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: "معلمات البحث غير صالحة",
        details: parsed.error.flatten()
      });
    }

    const params = parsed.data;
    console.log("[Moderation Search] Articles search params:", params);

    const results = await storage.searchModerationArticles({
      query: params.query,
      categoryId: params.categoryId,
      publishFrom: params.publishFrom,
      publishTo: params.publishTo,
      includeComments: params.includeComments,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
      page: params.page,
      limit: params.limit,
    });

    res.json(results);
  } catch (error) {
    console.error("[Moderation Search] Articles search error:", error);
    res.status(500).json({ error: "حدث خطأ أثناء البحث في الأخبار" });
  }
});

// Get categories for filter dropdown
router.get("/search/categories", async (req: Request, res: Response) => {
  try {
    const categoriesData = await storage.getAllCategories();
    const activeCategories = categoriesData
      .filter(c => c.status === 'active')
      .map(c => ({
        id: c.id,
        name: c.nameAr,
        slug: c.slug,
      }));
    
    res.json(activeCategories);
  } catch (error) {
    console.error("[Moderation Search] Categories error:", error);
    res.status(500).json({ error: "حدث خطأ أثناء جلب الأقسام" });
  }
});

// Get users who have comments (for filter dropdown)
router.get("/search/commenters", async (req: Request, res: Response) => {
  try {
    const { search, limit = "20" } = req.query;
    
    // Get users who have at least one comment
    const commentersData = await db
      .selectDistinct({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        profileImage: users.profileImageUrl,
      })
      .from(users)
      .innerJoin(comments, eq(users.id, comments.userId))
      .where(
        search 
          ? sql`(
              ${users.firstName} ILIKE ${`%${search}%`}
              OR ${users.lastName} ILIKE ${`%${search}%`}
              OR ${users.email} ILIKE ${`%${search}%`}
            )`
          : undefined
      )
      .limit(parseInt(limit as string, 10));
    
    res.json(commentersData);
  } catch (error) {
    console.error("[Moderation Search] Commenters error:", error);
    res.status(500).json({ error: "حدث خطأ أثناء جلب المعلقين" });
  }
});

export default router;
