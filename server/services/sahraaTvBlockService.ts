/**
 * بلوك قناة الصحراء — إعداد يومي عبر system_settings.
 * يعرض على الرئيسية فيديو فقط (MP4) + وصف تحريري — بلا واجهة تغريدة.
 */
import { storage } from "../storage";
import {
  SAHRAA_MEDIA_PATH,
  SAHRAA_TV_BLOCK_KEY,
  extractTweetId,
  mergeSahraaTvBlockConfig,
  parseSahraaTvBlockConfig,
  toPublicSahraaTvBlock,
  type SahraaTvBlockConfig,
  type SahraaTvBlockPublic,
  type SaveSahraaTvBlockInput,
} from "./sahraaTvBlockUtils";
import { resolveXVideoFromPostUrl } from "./sahraaTvVideoResolver";
import { mirrorSahraaVideoToR2 } from "./sahraaTvMediaMirror";

export {
  SAHRAA_MEDIA_PATH,
  SAHRAA_TV_BLOCK_KEY,
  DEFAULT_SAHRAA_TITLE,
  normalizeXPostUrl,
  isValidXPostUrl,
  extractTweetId,
  parseSahraaTvBlockConfig,
  toPublicSahraaTvBlock,
  mergeSahraaTvBlockConfig,
  pickBestMp4Url,
  type SahraaTvBlockConfig,
  type SahraaTvBlockPublic,
  type SaveSahraaTvBlockInput,
} from "./sahraaTvBlockUtils";

export async function getSahraaTvBlockConfig(): Promise<SahraaTvBlockConfig> {
  try {
    const stored = await storage.getSystemSetting(SAHRAA_TV_BLOCK_KEY);
    return parseSahraaTvBlockConfig(stored);
  } catch {
    return parseSahraaTvBlockConfig(null);
  }
}

/** يضمن وجود videoUrl مستخرج من رابط إكس، ويُخزّنه إن نجح. */
async function ensureVideoResolved(
  config: SahraaTvBlockConfig,
  persist: boolean,
): Promise<SahraaTvBlockConfig> {
  if (!config.isActive) return config;
  if (config.videoUrl) return config;
  if (!extractTweetId(config.xPostUrl)) return config;

  const resolved = await resolveXVideoFromPostUrl(config.xPostUrl);
  const next: SahraaTvBlockConfig = {
    ...config,
    videoUrl: resolved.videoUrl,
    posterUrl: resolved.posterUrl,
    updatedAt: config.updatedAt ?? new Date().toISOString(),
  };

  if (persist) {
    try {
      await storage.upsertSystemSetting(SAHRAA_TV_BLOCK_KEY, next, "content", true);
    } catch (e) {
      console.warn("[SahraaTvBlock] failed to persist resolved video:", e);
    }
  }
  return next;
}

/** ينسخ الفيديو إلى R2 ويثبّت الرابط في الإعدادات. single-flight داخل الناسخ. */
async function mirrorAndPersist(config: SahraaTvBlockConfig): Promise<void> {
  const tweetId = extractTweetId(config.xPostUrl);
  if (!tweetId || !config.videoUrl || config.mirroredVideoUrl) return;
  const mirrored = await mirrorSahraaVideoToR2(config.videoUrl, tweetId);
  if (!mirrored) return;
  try {
    await storage.upsertSystemSetting(
      SAHRAA_TV_BLOCK_KEY,
      { ...config, mirroredVideoUrl: mirrored },
      "content",
      true,
    );
  } catch (e) {
    console.warn("[SahraaTvBlock] failed to persist mirrored url:", e);
  }
}

export async function getPublicSahraaTvBlock(): Promise<SahraaTvBlockPublic> {
  let config = await getSahraaTvBlockConfig();
  try {
    config = await ensureVideoResolved(config, true);
  } catch (e: any) {
    console.warn(
      "[SahraaTvBlock] video resolve failed:",
      e?.code ?? e?.message ?? e,
      e?.details ?? "",
    );
    return { isVisible: false };
  }
  const pub = toPublicSahraaTvBlock(config);
  if (pub.isVisible && pub.videoUrl) {
    // نسخة R2 تُقدَّم من الحافة مباشرة. قبل اكتمال النسخ: بروكسي نفس المنشأ
    // (المتصفح يرسل Referer=sabq.org فيُرفض الفيديو من twimg) — ويُطلق النسخ
    // بالخلفية دون تعطيل الاستجابة.
    if (config.mirroredVideoUrl) {
      return { ...pub, videoUrl: config.mirroredVideoUrl };
    }
    void mirrorAndPersist(config);
    return { ...pub, videoUrl: SAHRAA_MEDIA_PATH };
  }
  return pub;
}

export async function saveSahraaTvBlockConfig(
  input: SaveSahraaTvBlockInput,
): Promise<SahraaTvBlockConfig> {
  const current = await getSahraaTvBlockConfig();
  let next = mergeSahraaTvBlockConfig(current, input);

  // عند التفعيل (أو تغيير الرابط) نستخرج الفيديو فوراً ونرفض الحفظ بلا فيديو
  if (next.isActive) {
    const resolved = await resolveXVideoFromPostUrl(next.xPostUrl);
    next = {
      ...next,
      videoUrl: resolved.videoUrl,
      posterUrl: resolved.posterUrl,
    };
    // النسخ إلى R2 أثناء الحفظ (ثوانٍ للمشرف) فيصل الجمهور من الحافة مباشرة.
    // فشله لا يمنع الحفظ — يبقى بروكسي /media احتياطًا.
    const tweetId = extractTweetId(next.xPostUrl);
    if (tweetId && !next.mirroredVideoUrl) {
      const mirrored = await mirrorSahraaVideoToR2(resolved.videoUrl, tweetId);
      if (mirrored) next = { ...next, mirroredVideoUrl: mirrored };
    }
  }

  await storage.upsertSystemSetting(SAHRAA_TV_BLOCK_KEY, next, "content", true);
  return next;
}
