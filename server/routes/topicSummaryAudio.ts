/**
 * الموجز الصوتي لمواضيع مُقترب — النص يُبنى في الخادم من الموضوع المنشور فقط.
 *
 *   GET /api/muqtarab/topics/:id/summary-audio
 *
 * استبدلت POST /api/ai/text-to-speech التي كانت بلا مصادقة وتُخلّق أي نص
 * يرسله العميل مباشرة على حساب ElevenLabs — ثغرة استنزاف أُغلقت هنا.
 * نفس نمط موجز المقالات: كاش 24 ساعة + حارس حصص ElevenLabs + بديل Google TTS.
 */
import { Router } from "express";
import { storage } from "../storage";
import { memoryCache, CACHE_TTL } from "../memoryCache";

const router = Router();

router.get("/api/muqtarab/topics/:id/summary-audio", async (req, res) => {
  try {
    const topic = await storage.getTopicById(req.params.id);

    if (!topic || topic.status !== "published") {
      return res.status(404).json({ message: "الموضوع غير موجود" });
    }

    const textToConvert = [topic.title, topic.excerpt].filter(Boolean).join(". ");
    if (!textToConvert) {
      return res.status(400).json({ message: "الموجز غير متوفر لهذا الموضوع" });
    }

    const updatedKey = topic.updatedAt instanceof Date
      ? topic.updatedAt.toISOString()
      : String(topic.updatedAt ?? topic.publishedAt ?? "");
    const audioCacheKey = `topic-summary-audio:v1:${topic.id}:${updatedKey}`;
    const cachedAudio = memoryCache.get<{ buffer: Buffer; provider: string }>(audioCacheKey);
    if (cachedAudio) {
      res.setHeader("X-TTS-Provider", cachedAudio.provider);
      res.setHeader("X-TTS-Cache", "HIT");
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", cachedAudio.buffer.length.toString());
      res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400");
      res.setHeader("ETag", `"${topic.id}-${updatedKey}-${cachedAudio.provider}"`);
      return res.send(cachedAudio.buffer);
    }

    const timeoutPromise = (ms: number) => new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TTS timeout')), ms)
    );

    let audioBuffer: Buffer | null = null;
    let usedProvider = '';

    const { getElevenLabsService, isElevenLabsQuotaCoolingDown } = await import("../services/elevenlabs");
    if (!isElevenLabsQuotaCoolingDown()) {
      const elevenLabsService = getElevenLabsService();
      if (elevenLabsService) {
        try {
          audioBuffer = await Promise.race([
            elevenLabsService.textToSpeech({
              text: textToConvert,
              model: 'eleven_flash_v2_5',
              voiceSettings: {
                stability: 0.75,
                similarity_boost: 0.75,
                style: 0.30,
                use_speaker_boost: true
              }
            }, 8_000),
            timeoutPromise(8_000)
          ]);
          usedProvider = 'elevenlabs';
        } catch (eErr) {
          console.warn('[topic-summary-audio] ElevenLabs TTS failed, trying Google fallback:',
            eErr instanceof Error ? eErr.message : String(eErr));
        }
      }
    }

    if (!audioBuffer) {
      const { getGoogleTTSService } = await import("../services/googleTts");
      const google = getGoogleTTSService();
      if (!google) {
        throw new Error('No TTS provider available');
      }
      audioBuffer = await Promise.race([
        google.textToSpeech({
          text: textToConvert,
          voiceId: 'ar-XA-Wavenet-C',
          voiceSettings: { stability: 0.6, speed: 1.0 }
        }),
        timeoutPromise(15000)
      ]);
      usedProvider = 'google';
    }

    memoryCache.set(audioCacheKey, { buffer: audioBuffer, provider: usedProvider }, CACHE_TTL.LONG);
    res.setHeader("X-TTS-Provider", usedProvider);
    res.setHeader("X-TTS-Cache", "MISS");
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audioBuffer.length.toString());
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400");
    res.setHeader("ETag", `"${topic.id}-${updatedKey}-${usedProvider}"`);
    res.send(audioBuffer);
  } catch (error) {
    console.error("Error generating topic summary audio:", error);
    res.status(500).json({ message: "فشل في توليد الموجز الصوتي" });
  }
});

export default router;
