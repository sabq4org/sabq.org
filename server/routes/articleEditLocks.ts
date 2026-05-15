/**
 * Article edit-lock endpoints.
 *
 * The dashboard ArticleEditor calls these on every "edit existing article"
 * mount to coordinate concurrent editors:
 *
 *   GET    /api/admin/articles/:id/lock            check current lock
 *   POST   /api/admin/articles/:id/lock            acquire (or refresh own)
 *   DELETE /api/admin/articles/:id/lock            release
 *   POST   /api/admin/articles/:id/lock/heartbeat  keep-alive
 *
 * The schema (shared/schema.ts → articleEditLocks) and a periodic cleanup
 * job (server/jobs/articleEditLocksCleanup.ts) both already exist; only the
 * routes themselves were missing — without this file the editor surfaces
 * "تعذر الحصول على قفل التحرير. يرجى المحاولة مرة أخرى." on every open.
 *
 * Lock TTL: 10 minutes. Heartbeats from the editor extend it; the cleanup
 * job removes any lock past expires_at.
 */

import { Router } from "express";
import { db } from "../db";
import { articleEditLocks, users } from "@shared/schema";
import { eq } from "drizzle-orm";

const router = Router();
const LOCK_TTL_MS = 10 * 60 * 1000;

function requireAuth(req: any, res: any, next: any) {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user?.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

interface LockRow {
  articleId: string;
  userId: string;
  userName: string;
  acquiredAt: Date;
  expiresAt: Date;
  lastHeartbeat: Date;
}

function shape(lock: LockRow | undefined, currentUserId: string) {
  if (!lock) {
    return { locked: false, lockedBy: null, isOwner: false, acquiredAt: null, expiresAt: null };
  }
  const expired = lock.expiresAt.getTime() <= Date.now();
  if (expired) {
    return { locked: false, lockedBy: null, isOwner: false, acquiredAt: null, expiresAt: null };
  }
  return {
    locked: true,
    lockedBy: { id: lock.userId, name: lock.userName },
    isOwner: lock.userId === currentUserId,
    acquiredAt: lock.acquiredAt.toISOString(),
    expiresAt: lock.expiresAt.toISOString(),
  };
}

router.get("/api/admin/articles/:id/lock", requireAuth, async (req: any, res) => {
  try {
    const [row] = await db
      .select()
      .from(articleEditLocks)
      .where(eq(articleEditLocks.articleId, req.params.id))
      .limit(1);
    res.json(shape(row as LockRow | undefined, req.user.id));
  } catch (err) {
    console.error("[edit-lock] GET error:", err);
    res.status(500).json({ message: "Failed to read lock state" });
  }
});

router.post("/api/admin/articles/:id/lock", requireAuth, async (req: any, res) => {
  try {
    const articleId = req.params.id;
    const userId = req.user.id;

    const [existing] = await db
      .select()
      .from(articleEditLocks)
      .where(eq(articleEditLocks.articleId, articleId))
      .limit(1);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);

    if (existing) {
      const lock = existing as LockRow;
      const expired = lock.expiresAt.getTime() <= Date.now();
      if (!expired && lock.userId !== userId) {
        return res.status(409).json({
          message: "المقالة مقفلة من مستخدم آخر",
          ...shape(lock, userId),
        });
      }
    }

    const userName = await resolveUserName(userId, req.user);

    const [upserted] = await db
      .insert(articleEditLocks)
      .values({
        articleId,
        userId,
        userName,
        acquiredAt: now,
        expiresAt,
        lastHeartbeat: now,
      })
      .onConflictDoUpdate({
        target: articleEditLocks.articleId,
        set: { userId, userName, acquiredAt: now, expiresAt, lastHeartbeat: now },
      })
      .returning();

    res.json(shape(upserted as LockRow, userId));
  } catch (err) {
    console.error("[edit-lock] POST error:", err);
    res.status(500).json({ message: "Failed to acquire lock" });
  }
});

router.post("/api/admin/articles/:id/lock/heartbeat", requireAuth, async (req: any, res) => {
  try {
    const articleId = req.params.id;
    const userId = req.user.id;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);

    const [existing] = await db
      .select()
      .from(articleEditLocks)
      .where(eq(articleEditLocks.articleId, articleId))
      .limit(1);

    if (!existing || (existing as LockRow).userId !== userId) {
      return res.status(409).json({ message: "Lock no longer owned" });
    }

    const [updated] = await db
      .update(articleEditLocks)
      .set({ lastHeartbeat: now, expiresAt })
      .where(eq(articleEditLocks.articleId, articleId))
      .returning();

    res.json(shape(updated as LockRow, userId));
  } catch (err) {
    console.error("[edit-lock] heartbeat error:", err);
    res.status(500).json({ message: "Failed to refresh lock" });
  }
});

router.delete("/api/admin/articles/:id/lock", requireAuth, async (req: any, res) => {
  try {
    const articleId = req.params.id;
    const userId = req.user.id;

    // Only the lock owner can release. Silently no-op for anyone else so
    // navigating away doesn't surface a confusing error.
    const [existing] = await db
      .select()
      .from(articleEditLocks)
      .where(eq(articleEditLocks.articleId, articleId))
      .limit(1);

    if (existing && (existing as LockRow).userId === userId) {
      await db.delete(articleEditLocks).where(eq(articleEditLocks.articleId, articleId));
    }

    res.json({ released: true });
  } catch (err) {
    console.error("[edit-lock] DELETE error:", err);
    res.status(500).json({ message: "Failed to release lock" });
  }
});

async function resolveUserName(userId: string, sessionUser: any): Promise<string> {
  if (sessionUser?.firstName || sessionUser?.lastName) {
    return [sessionUser.firstName, sessionUser.lastName].filter(Boolean).join(" ").trim()
      || sessionUser.email
      || userId;
  }
  try {
    const [u] = await db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (u) {
      const composed = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
      return composed || u.email || userId;
    }
  } catch { /* fall through */ }
  return userId;
}

export default router;
