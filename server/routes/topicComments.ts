/**
 * Comments on Muqtarab topics — public read + authenticated write + likes.
 *
 *   GET    /api/muqtarab/topics/:topicId/comments            approved tree (mods see pending)
 *   POST   /api/muqtarab/topics/:topicId/comments            create (auth)
 *   POST   /api/topic-comments/:id/like                      like (auth)
 *   DELETE /api/topic-comments/:id/like                      unlike (auth)
 *   GET    /api/muqtarab/topics/:topicId/comments/my-likes   liked ids overlay (auth)
 *
 * The POST flow mirrors the article comment route (server/routes.ts) exactly:
 * suspicious-words gate → insert (pending) → loyalty → background AI moderation.
 * Drizzle queries live in topicCommentsService per ADR-001.
 */
import { Router } from "express";
import { insertTopicCommentSchema } from "@shared/schema";
import { requireAuth } from "../rbac";
import { checkUserStatus } from "../userStatusMiddleware";
import { awardPoints } from "../services/loyalty";
import { LOYALTY_ACTIONS } from "@shared/loyalty";
import { checkTextForSuspiciousWords, incrementSuspiciousWordFlagCount } from "../utils/suspiciousWordsChecker";
import { moderateComment, getStatusFromClassification } from "../ai/commentModeration";
import {
  getTopicForComment,
  getTopicComments,
  createTopicComment,
  updateTopicCommentStatus,
  updateTopicCommentModeration,
  likeTopicComment,
  unlikeTopicComment,
  getLikedTopicCommentIds,
} from "../services/topicCommentsService";

const router = Router();

function noStore(res: any) {
  res.set("Cache-Control", "private, no-store");
}

// Public: comment tree for a topic. Moderators see pending; everyone else sees
// approved only. The payload is user-neutral (likesCount yes, hasLiked no) so
// it's safe to cache for anonymous/regular reads.
router.get("/api/muqtarab/topics/:topicId/comments", async (req: any, res) => {
  try {
    const userRole = req.user?.role;
    const showPending = userRole === "admin" || userRole === "editor";
    if (showPending) {
      noStore(res);
    } else {
      res.set("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=120");
    }
    const comments = await getTopicComments(req.params.topicId, showPending);
    res.json(comments);
  } catch (error) {
    console.error("Error fetching topic comments:", error);
    res.status(500).json({ message: "Failed to fetch comments" });
  }
});

// Liked-comment ids for the current viewer under one topic (overlay source).
router.get("/api/muqtarab/topics/:topicId/comments/my-likes", requireAuth, async (req: any, res) => {
  try {
    const ids = await getLikedTopicCommentIds(req.params.topicId, req.user.id);
    noStore(res);
    res.json(ids);
  } catch (error) {
    console.error("[TopicComments] my-likes error:", error);
    res.status(500).json({ message: "Failed to fetch liked comments" });
  }
});

router.post(
  "/api/muqtarab/topics/:topicId/comments",
  requireAuth,
  checkUserStatus(),
  async (req: any, res) => {
    try {
      const userId = req.user.id;
      const topicId = req.params.topicId;

      const topic = await getTopicForComment(topicId);
      if (!topic) {
        return res.status(404).json({ message: "Topic not found" });
      }

      const parsed = insertTopicCommentSchema.safeParse({
        ...req.body,
        topicId,
        userId,
        platform: "web",
      });
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid comment data" });
      }

      // فحص الكلمات المشبوهة قبل إنشاء التعليق
      const suspiciousCheck = await checkTextForSuspiciousWords(parsed.data.content);
      const blockedBySuspiciousWords = suspiciousCheck.hasSuspiciousWords;

      const comment = await createTopicComment(parsed.data);

      // معالجة الكلمات المشبوهة - رفض تلقائي أو تعليق للمراجعة
      if (blockedBySuspiciousWords && suspiciousCheck.foundWords.length > 0) {
        const autoReject = suspiciousCheck.shouldAutoReject;
        const rejectingWords = suspiciousCheck.foundWords
          .filter((w) => w.action === "reject")
          .map((w) => w.word);
        const foundWordsStr = suspiciousCheck.foundWords.map((w) => w.word).join(", ");
        await updateTopicCommentStatus(comment.id, {
          status: autoReject ? "rejected" : "pending",
          moderatedAt: autoReject ? new Date() : undefined,
          moderationReason: autoReject
            ? `رُفض تلقائياً - كلمات محظورة: ${rejectingWords.join(", ")}`
            : `يحتوي على كلمات مشبوهة: ${foundWordsStr}`,
        });
        await incrementSuspiciousWordFlagCount(suspiciousCheck.foundWords.map((w) => w.wordId));
      }

      // نقطة ولاء للتعليق
      try {
        await awardPoints({
          userId,
          action: LOYALTY_ACTIONS.COMMENT,
          source: topicId,
          metadata: { topicId, topicCommentId: comment.id },
        });
      } catch (error) {
        console.error("Error recording loyalty points:", error);
      }

      // AI Moderation في الخلفية (نفس منطق تعليقات المقالات)
      const commentId = comment.id;
      const commentContent = comment.content;
      const suspiciousWordsData = blockedBySuspiciousWords ? suspiciousCheck : null;
      (async () => {
        try {
          const moderationResult = await moderateComment(commentContent);
          await updateTopicCommentModeration(commentId, {
            aiModerationScore: moderationResult.score,
            aiClassification: moderationResult.classification,
            aiDetectedIssues: moderationResult.detected,
            aiModerationReason: moderationResult.reason,
            aiAnalyzedAt: new Date(),
          });

          const aiStatus = getStatusFromClassification(moderationResult.classification);
          const wasAutoRejected = suspiciousWordsData?.shouldAutoReject;
          const newStatus = wasAutoRejected ? "rejected" : suspiciousWordsData ? "pending" : aiStatus;
          if (newStatus !== "pending" && !wasAutoRejected) {
            await updateTopicCommentStatus(commentId, {
              status: newStatus,
              moderatedAt: new Date(),
              moderationReason:
                moderationResult.classification === "safe"
                  ? "تم الاعتماد تلقائياً بواسطة الذكاء الاصطناعي"
                  : `تم الرفض تلقائياً - ${moderationResult.reason}`,
            });
          }

          if (suspiciousWordsData && suspiciousWordsData.foundWords.length > 0) {
            const foundWordsStr = suspiciousWordsData.foundWords.map((w) => w.word).join(", ");
            await updateTopicCommentModeration(commentId, {
              aiDetectedIssues: [...(moderationResult.detected || []), `كلمات مشبوهة: ${foundWordsStr}`],
              aiModerationReason:
                `يحتوي على كلمات مشبوهة: ${foundWordsStr}` +
                (moderationResult.reason ? ` - ${moderationResult.reason}` : ""),
            });
          }
        } catch (error) {
          console.error("[AI Moderation][Topic] Error analyzing comment:", error);
        }
      })();

      res.json(comment);
    } catch (error) {
      console.error("Error creating topic comment:", error);
      res.status(500).json({ message: "Failed to create comment" });
    }
  },
);

router.post("/api/topic-comments/:id/like", requireAuth, async (req: any, res) => {
  try {
    const result = await likeTopicComment(req.params.id, req.user.id);
    noStore(res);
    if (!result) return res.status(404).json({ message: "Comment not found" });
    res.json(result);
  } catch (error) {
    console.error("[TopicComments] like error:", error);
    res.status(500).json({ message: "Failed to like comment" });
  }
});

router.delete("/api/topic-comments/:id/like", requireAuth, async (req: any, res) => {
  try {
    const result = await unlikeTopicComment(req.params.id, req.user.id);
    noStore(res);
    if (!result) return res.status(404).json({ message: "Comment not found" });
    res.json(result);
  } catch (error) {
    console.error("[TopicComments] unlike error:", error);
    res.status(500).json({ message: "Failed to unlike comment" });
  }
});

export default router;
