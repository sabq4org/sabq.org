/**
 * GET /api/articles/:slug/summary-audio — the «استمع» clip of an article's
 * summary as raw audio bytes (web player, iOS AVPlayer, Android ExoPlayer).
 *
 * Moved out of routes.ts on 2026-10-23 with the R2 copy and the synthesis
 * limit (services/summaryAudioService.ts, summaryAudioBudget.ts). Mounted right
 * after unpublishedArticleGuard, which answers 404 for drafts and marks
 * published rows for the edge caches. A refused or busy synthesis is 503 with
 * Retry-After, never 429: the Pages proxy retries any 429 through api.sabq.org.
 */
import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { getSummaryAudio } from "../services/summaryAudioService";
import { summaryAudioRetryAfterSeconds, takeSummaryAudioSlot } from "../services/summaryAudioBudget";
import { getRealIp } from "../utils/trustedProxyIp";

const router = Router();

router.get("/api/articles/:slug/summary-audio", async (req: Request, res: Response) => {
  // Settings changes must reach the origin; generated audio remains cached on the server.
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
  res.append("Access-Control-Expose-Headers", "X-TTS-Provider, X-TTS-Cache");
  const user = req.user as { id?: string; role?: string } | undefined;
  // The API rate limiter's key: the signed-in user, else the verified client IP.
  const visitor = user?.id ? `u:${user.id}` : getRealIp(req);
  try {
    const article = await storage.getArticleBySlug(req.params.slug, user?.id, user?.role);
    if (!article) {
      return res.status(404).json({ message: "المقال غير موجود" });
    }

    // Use aiSummary or excerpt (in priority order)
    const textToConvert = article.aiSummary || article.excerpt;
    if (!textToConvert) {
      return res.status(400).json({ message: "الموجز غير متوفر لهذا المقال" });
    }

    const audio = await getSummaryAudio(String(article.id), textToConvert, {
      // A draft's clip stays in memory only; staff may still rewrite its summary.
      persist: article.status === "published",
      takeSynthesisSlot: () => takeSummaryAudioSlot(visitor),
    });
    res.setHeader("X-TTS-Provider", audio.provider);
    res.setHeader("X-TTS-Cache", audio.cache);
    res.setHeader("Content-Type", audio.contentType);
    res.setHeader("Content-Length", audio.buffer.length.toString());
    res.send(audio.buffer);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "TTS_RATE_LIMITED" || code === "TTS_BUSY") {
      res.setHeader("Retry-After", String(code === "TTS_BUSY" ? 5 : summaryAudioRetryAfterSeconds(visitor)));
      return res.status(503).json({ message: "الموجز الصوتي غير متاح الآن، حاول بعد قليل" });
    }
    console.error("Error generating summary audio:", error);
    const errorMessage = code === "ElevenLabs timeout"
      ? "انتهت مهلة توليد الموجز الصوتي"
      : "فشل في توليد الموجز الصوتي";
    res.status(500).json({ message: errorMessage });
  }
});

export default router;
