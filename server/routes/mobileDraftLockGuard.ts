// «قفل المسودات» في تطبيقات الجوال (/api/v1): يسبق mobileApiRoutes (ملف فوق
// سقف الأسطر) فيرفض تعديل مسودة مقفلة عند زميل أو نشرها أو أرشفتها أو حذفها
// أو إعادة إرسالها، بأي نسخة من التطبيق. مكتب سبق (/api/v1/staff) محروس في
// خدماته عبر articleLockAllowsWriter.

import { Router, type NextFunction, type Request, type Response } from "express";
import { draftLockTargets } from "@shared/draftLock";
import { verifyMemberBearer } from "../services/memberSessionService";
import { findDraftLockBlock } from "../services/draftLockService";

const router = Router();

router.use(async (req: Request, res: Response, next: NextFunction) => {
  const targets = draftLockTargets("mobile", req.method, req.path, req.body);
  if (!targets) return next();
  try {
    const session = await verifyMemberBearer(req);
    // بلا جلسة صالحة: يرد المسار نفسه بالرفض المعتاد
    if (!session?.userId) return next();
    const block = await findDraftLockBlock(targets, session.userId);
    if (!block) return next();
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(block.status).json(block.body);
  } catch (error) {
    console.error("[draft-lock] mobile guard failed", error);
    return next();
  }
});

export default router;
