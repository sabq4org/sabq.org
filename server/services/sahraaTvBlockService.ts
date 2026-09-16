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
  // المتصفح يرسل Referer=sabq.org فيُرفض الفيديو من twimg — التشغيل عبر بروكسي نفس المنشأ
  if (pub.isVisible && pub.videoUrl) {
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
  }

  await storage.upsertSystemSetting(SAHRAA_TV_BLOCK_KEY, next, "content", true);
  return next;
}
