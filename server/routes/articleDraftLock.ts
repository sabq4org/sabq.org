// «قفل المسودات» على الويب: مسارات القفل وفكّه، وحارس يسبق مسارات
// routes.ts فيرفض أي كتابة على مسودة مقفلة عند زميل (تعديل، نشر، جدولة،
// أرشفة، حذف، ومثلها بالجملة). البيانات في services/draftLockService.ts.

import { Router, type NextFunction, type Response } from "express";
import { draftLockTargets } from "@shared/draftLock";
import { getEffectiveUserPermissions, requireAuth } from "../rbac";
import {
  draftLockSummary,
  findDraftLockBlock,
  getDraftLock,
  lockDraft,
  unlockDraft,
  type DraftLockResult,
} from "../services/draftLockService";

const router = Router();

function noStore(res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
}

function send(res: Response, result: DraftLockResult) {
  if (result.ok) return res.json(result.state);
  return res.status(result.status).json({ message: result.message, code: result.code, draftLock: result.state });
}

// الحارس أولًا: يمر على كل الطلبات ويتوقف فقط عند كتابة على مادة بعينها.
router.use(async (req: any, res: Response, next: NextFunction) => {
  const targets = draftLockTargets("web", req.method, req.path, req.body);
  if (!targets) return next();
  const userId: string | undefined = req.user?.id;
  // بلا جلسة: يرد المسار نفسه 401 كالعادة
  if (!userId) return next();
  try {
    const block = await findDraftLockBlock(targets, userId);
    if (!block) return next();
    noStore(res);
    return res.status(block.status).json(block.body);
  } catch (error) {
    // فشل الفحص لا يفتح الباب: الكتابات المحروسة تعيد الفحص في قاعدة البيانات
    console.error("[draft-lock] guard failed", error);
    return next();
  }
});

router.get("/api/admin/draft-locks/summary", requireAuth, async (req: any, res) => {
  noStore(res);
  try {
    const permissions = await getEffectiveUserPermissions(req.user.id);
    const canViewAll = permissions.includes("*")
      || permissions.includes("articles.view_all")
      || permissions.includes("articles.manage")
      || ["admin", "system_admin", "editor", "chief_editor", "content_manager"].includes(req.user.role);
    res.json(await draftLockSummary(req.user.id, !canViewAll));
  } catch (error) {
    console.error("[draft-lock] summary failed", error);
    res.status(500).json({ message: "تعذر قراءة المسودات المقفلة" });
  }
});

router.get("/api/admin/articles/:id/draft-lock", requireAuth, async (req: any, res) => {
  noStore(res);
  try {
    send(res, await getDraftLock(req.params.id, req.user.id));
  } catch (error) {
    console.error("[draft-lock] read failed", error);
    res.status(500).json({ message: "تعذر قراءة حالة القفل" });
  }
});

router.post("/api/admin/articles/:id/draft-lock", requireAuth, async (req: any, res) => {
  noStore(res);
  try {
    const permissions = await getEffectiveUserPermissions(req.user.id);
    send(res, await lockDraft({
      articleId: req.params.id,
      userId: req.user.id,
      permissions,
      note: req.body?.note,
      sessionUser: req.user,
    }));
  } catch (error) {
    console.error("[draft-lock] lock failed", error);
    res.status(500).json({ message: "تعذر قفل المسودة" });
  }
});

router.delete("/api/admin/articles/:id/draft-lock", requireAuth, async (req: any, res) => {
  noStore(res);
  try {
    const permissions = await getEffectiveUserPermissions(req.user.id);
    send(res, await unlockDraft({
      articleId: req.params.id,
      userId: req.user.id,
      permissions,
      reason: req.body?.reason,
    }));
  } catch (error) {
    console.error("[draft-lock] unlock failed", error);
    res.status(500).json({ message: "تعذر فك القفل" });
  }
});

export default router;
