/**
 * GET /api/public/ai-stats — أرقام حية لقسم «الأرقام تتحدث» في /sabq-ai.
 * عام بلا مصادقة؛ الحمل على القاعدة شبه صفري: كاش ذاكرة 5 دقائق في الخدمة
 * + كاش CDN عبر ترويسة Cache-Control.
 */
import { Router } from "express";
import { cacheControl, CACHE_DURATIONS } from "../cacheMiddleware";
import { getAiPublicStats } from "../services/aiPublicStatsService";

const router: Router = Router();

router.get(
  "/api/public/ai-stats",
  cacheControl({ maxAge: CACHE_DURATIONS.MEDIUM, staleWhileRevalidate: CACHE_DURATIONS.MEDIUM }),
  async (_req, res) => {
    try {
      res.json(await getAiPublicStats());
    } catch (error) {
      console.error("[ai-public-stats] failed:", error);
      // الواجهة تتعامل مع الفشل بالرجوع للشريط الثابت — لا أرقام وهمية
      res.status(500).json({ message: "تعذر جلب الإحصاءات" });
    }
  },
);

export default router;
