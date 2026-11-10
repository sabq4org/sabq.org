// حدود تسبق mobileApiRoutes (ملف عند سقف الأسطر) لمسارات /api/v1 المجهولة
// التي تشغّل نموذجًا مدفوعًا عند كل طلب.
//
// تدقيق 2026-11-10: POST /sports/intel/ask بلا جلسة، والكاش مفتاحه نص السؤال،
// فسؤال مختلف في كل طلب = توليد جديد، والحد الوحيد كان محدِّد الكتابة العام
// (1000 طلب / 15 دقيقة لكل IP).
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { cfKeyGenerator, cfValidate } from "../../utils/rateLimiting";

export const SPORTS_INTEL_ASK_PER_MINUTE = 6;
export const SPORTS_INTEL_ASK_PER_DAY = 60;

const message = { success: false, message: "أسئلة كثيرة. حاول بعد قليل." };

const perMinute = rateLimit({
  windowMs: 60 * 1000,
  max: SPORTS_INTEL_ASK_PER_MINUTE,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: cfKeyGenerator,
  validate: cfValidate,
  message,
});

const perDay = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: SPORTS_INTEL_ASK_PER_DAY,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: cfKeyGenerator,
  validate: cfValidate,
  message,
});

const router = Router();
router.post("/sports/intel/ask", perMinute, perDay);

export default router;
