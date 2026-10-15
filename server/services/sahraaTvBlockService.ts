/**
 * بلوك قناة الصحراء — إعداد يومي عبر system_settings.
 * يعرض على الرئيسية فيديو فقط (MP4) + وصف تحريري — بلا واجهة تغريدة.
 */
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
import {
  compareAndSetSahraaTvBlockSetting,
  readSahraaTvBlockSetting,
} from "./sahraaTvBlockPersistence";

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
  const snapshot = await readSahraaTvBlockSetting();
  return parseSahraaTvBlockConfig(snapshot?.rawValue ?? null);
}

export async function getPublicSahraaTvBlock(): Promise<SahraaTvBlockPublic> {
  // Public reads are deliberately read-only. Activation and mirroring happen
  // only in an explicit admin save, so a hidden block cannot be resurrected by
  // a homepage request.
  let config: SahraaTvBlockConfig;
  try {
    config = await getSahraaTvBlockConfig();
  } catch (err) {
    console.error("[SahraaTvBlock] public config read failed:", err);
    return { isVisible: false };
  }
  const pub = toPublicSahraaTvBlock(config);
  return pub.isVisible
    ? { ...pub, videoUrl: config.mirroredVideoUrl || SAHRAA_MEDIA_PATH }
    : pub;
}

export async function saveSahraaTvBlockConfig(
  input: SaveSahraaTvBlockInput,
): Promise<SahraaTvBlockConfig> {
  // Capture the raw row before resolver/mirror work. The final write is a
  // conditional CAS, so a concurrent hide wins over this slow save.
  const snapshot = await readSahraaTvBlockSetting();
  const current = parseSahraaTvBlockConfig(snapshot?.rawValue ?? null);
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

  await compareAndSetSahraaTvBlockSetting(snapshot, next);
  return next;
}
