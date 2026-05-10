import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, logActivity } from "../rbac";
import { insertSocialFollowSchema } from "@shared/schema";

function getRealIp(req: any): string {
  return req.headers['cf-connecting-ip'] as string ||
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.ip || 'unknown';
}

const followLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { message: "تم تجاوز حد طلبات المتابعة. يرجى المحاولة بعد دقيقة" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => getRealIp(req),
  validate: { xForwardedForHeader: false, ip: false, keyGeneratorIpFallback: false },
});

const router: Router = Router();

// POST /api/social/follow - Follow a user
router.post("/api/social/follow", followLimiter, requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;

    const validatedData = insertSocialFollowSchema.parse({
      followerId: userId,
      followingId: req.body.followingId,
      notificationsEnabled: req.body.notificationsEnabled ?? true,
    });

    if (validatedData.followerId === validatedData.followingId) {
      return res.status(400).json({ message: "لا يمكنك متابعة نفسك" });
    }

    const targetUser = await storage.getUser(validatedData.followingId);
    if (!targetUser) {
      return res.status(404).json({ message: "المستخدم غير موجود" });
    }

    const alreadyFollowing = await storage.isFollowing(validatedData.followerId, validatedData.followingId);
    if (alreadyFollowing) {
      return res.status(400).json({ message: "أنت تتابع هذا المستخدم بالفعل" });
    }

    const follow = await storage.followUser(validatedData);

    await logActivity({
      userId,
      action: 'user_followed',
      entityType: 'user',
      entityId: validatedData.followingId,
    });

    console.log('[Social Follow] User followed:', { followerId: userId, followingId: validatedData.followingId });
    res.json(follow);
  } catch (error) {
    console.error("Error following user:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "بيانات غير صحيحة", errors: error.errors });
    }
    res.status(500).json({ message: "حدث خطأ أثناء متابعة المستخدم" });
  }
});

// DELETE /api/social/unfollow/:userId - Unfollow a user
router.delete("/api/social/unfollow/:userId", followLimiter, requireAuth, async (req: any, res) => {
  try {
    const followerId = req.user.id;
    const followingId = req.params.userId;

    if (!followingId) {
      return res.status(400).json({ message: "معرف المستخدم مطلوب" });
    }

    const isFollowing = await storage.isFollowing(followerId, followingId);
    if (!isFollowing) {
      return res.status(400).json({ message: "أنت لا تتابع هذا المستخدم" });
    }

    await storage.unfollowUser(followerId, followingId);

    await logActivity({
      userId: followerId,
      action: 'user_unfollowed',
      entityType: 'user',
      entityId: followingId,
    });

    console.log('[Social Follow] User unfollowed:', { followerId, followingId });
    res.json({ success: true, message: "تم إلغاء المتابعة بنجاح" });
  } catch (error) {
    console.error("Error unfollowing user:", error);
    res.status(500).json({ message: "حدث خطأ أثناء إلغاء متابعة المستخدم" });
  }
});

// GET /api/social/followers/:userId - Get followers list
router.get("/api/social/followers/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 50));

    if (!userId) {
      return res.status(400).json({ message: "معرف المستخدم مطلوب" });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "المستخدم غير موجود" });
    }

    const followers = await storage.getFollowers(userId, limit);

    console.log('[Social Follow] Fetched followers:', { userId, count: followers.length });
    res.json(followers);
  } catch (error) {
    console.error("Error fetching followers:", error);
    res.status(500).json({ message: "حدث خطأ أثناء جلب المتابعين" });
  }
});

// GET /api/social/following/:userId - Get following list
router.get("/api/social/following/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 50));

    if (!userId) {
      return res.status(400).json({ message: "معرف المستخدم مطلوب" });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "المستخدم غير موجود" });
    }

    const following = await storage.getFollowing(userId, limit);

    console.log('[Social Follow] Fetched following:', { userId, count: following.length });
    res.json(following);
  } catch (error) {
    console.error("Error fetching following:", error);
    res.status(500).json({ message: "حدث خطأ أثناء جلب قائمة المتابعة" });
  }
});

// GET /api/social/stats/:userId - Get follow statistics
router.get("/api/social/stats/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!userId) {
      return res.status(400).json({ message: "معرف المستخدم مطلوب" });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "المستخدم غير موجود" });
    }

    const stats = await storage.getFollowStats(userId);

    console.log('[Social Follow] Fetched stats:', { userId, stats });
    res.json(stats);
  } catch (error) {
    console.error("Error fetching follow stats:", error);
    res.status(500).json({ message: "حدث خطأ أثناء جلب إحصائيات المتابعة" });
  }
});

// GET /api/social/is-following/:userId - Check if current user follows another user
router.get("/api/social/is-following/:userId", requireAuth, async (req: any, res) => {
  try {
    const followerId = req.user.id;
    const followingId = req.params.userId;

    if (!followingId) {
      return res.status(400).json({ message: "معرف المستخدم مطلوب" });
    }

    const isFollowing = await storage.isFollowing(followerId, followingId);

    console.log('[Social Follow] Checked following status:', { followerId, followingId, isFollowing });
    res.json({ isFollowing });
  } catch (error) {
    console.error("Error checking follow status:", error);
    res.status(500).json({ message: "حدث خطأ أثناء التحقق من حالة المتابعة" });
  }
});

export default router;
