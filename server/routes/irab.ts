// «أعرِب»: نقطة عامة واحدة لإعراب جملة. بلا تسجيل دخول، محمية بحد لكل IP وسقف يومي
// في الخدمة. الصفحة الثابتة في client/public/irab/index.html.
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { validateIrabInput } from "@shared/irab";
import { analyzeSentence, IrabUnavailableError } from "../services/irabService";
import { getRealIp } from "../utils/trustedProxyIp";

const router = Router();

const irabLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getRealIp(req as never),
  validate: { xForwardedForHeader: false, ip: false, keyGeneratorIpFallback: false },
  message: { code: "IRAB_RATE_LIMIT", message: "أرسلت جملًا كثيرة في وقت قصير. انتظر دقائق ثم أعد المحاولة." },
});

router.post("/api/irab", irabLimiter, async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const check = validateIrabInput(req.body?.sentence);
  if (!check.ok) return res.status(400).json({ code: "IRAB_BAD_INPUT", message: check.message });
  try {
    const { result, cached } = await analyzeSentence(check.sentence);
    return res.json({ ...result, cached });
  } catch (err) {
    if (err instanceof IrabUnavailableError) {
      const status = err.code === "IRAB_DAILY_LIMIT" ? 429 : 503;
      return res.status(status).json({ code: err.code, message: err.message });
    }
    console.error("[Irab] unexpected:", (err as Error).message);
    return res.status(503).json({ code: "IRAB_FAILED", message: "تعذر إعراب الجملة الآن. أعد المحاولة بعد قليل." });
  }
});

export default router;
