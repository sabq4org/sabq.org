/**
 * بلوك قناة الصحراء — إعداد يومي عبر system_settings.
 * يعرض على الرئيسية اقتباس فيديو من منشور إكس + وصف تحريري.
 */
import { storage } from "../storage";
import {
  SAHRAA_TV_BLOCK_KEY,
  mergeSahraaTvBlockConfig,
  parseSahraaTvBlockConfig,
  toPublicSahraaTvBlock,
  type SahraaTvBlockConfig,
  type SahraaTvBlockPublic,
  type SaveSahraaTvBlockInput,
} from "./sahraaTvBlockUtils";

export {
  SAHRAA_TV_BLOCK_KEY,
  DEFAULT_SAHRAA_TITLE,
  normalizeXPostUrl,
  isValidXPostUrl,
  parseSahraaTvBlockConfig,
  toPublicSahraaTvBlock,
  mergeSahraaTvBlockConfig,
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

export async function getPublicSahraaTvBlock(): Promise<SahraaTvBlockPublic> {
  const config = await getSahraaTvBlockConfig();
  return toPublicSahraaTvBlock(config);
}

export async function saveSahraaTvBlockConfig(
  input: SaveSahraaTvBlockInput,
): Promise<SahraaTvBlockConfig> {
  const current = await getSahraaTvBlockConfig();
  const next = mergeSahraaTvBlockConfig(current, input);
  await storage.upsertSystemSetting(SAHRAA_TV_BLOCK_KEY, next, "content", true);
  return next;
}
