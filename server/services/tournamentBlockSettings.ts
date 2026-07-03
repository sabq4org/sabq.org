/**
 * إعدادات بلوكات البطولات في الواجهة (المونديال، خليجي 27، كأس آسيا) —
 * مفاتيح system_settings تتحكم من لوحة التحكم في: الإظهار/الإخفاء، نافذة
 * التوقيت (بدء/انتهاء العرض)، والبطل المعيَّن يدويًا. تعطّل القراءة لا
 * يُسقط البلوك — الافتراضي «ظاهر بلا نافذة».
 */
import { storage } from "../storage";

export const TOURNAMENT_BLOCK_KEYS = {
  "world-cup": "world_cup_block",
  "gulf-cup": "gulf_cup_block",
  "asian-cup": "asian_cup_block",
  "kings-cup": "kings_cup_block",
  "pro-league": "roshn_league_block",
} as const;

export type TournamentBlockSlug = keyof typeof TOURNAMENT_BLOCK_KEYS;

export interface TournamentBlockSettings {
  visible: boolean;
  manualChampionTeamId: number | null;
  /** ISO — البلوك يظهر من هذا الوقت؛ null = بلا حدّ */
  startAt: string | null;
  /** ISO — البلوك يختفي بعده؛ null = بلا حدّ */
  endAt: string | null;
}

const isoOrNull = (v: unknown): string | null =>
  typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null;

export async function getTournamentBlockSettings(
  slug: TournamentBlockSlug,
): Promise<TournamentBlockSettings> {
  try {
    const s = await storage.getSystemSetting(TOURNAMENT_BLOCK_KEYS[slug]);
    return {
      visible: s?.visible ?? true,
      manualChampionTeamId: Number(s?.manualChampionTeamId) || null,
      startAt: isoOrNull(s?.startAt),
      endAt: isoOrNull(s?.endAt),
    };
  } catch {
    return { visible: true, manualChampionTeamId: null, startAt: null, endAt: null };
  }
}

/** مخفي إذا أُطفئ المفتاح، أو كنا قبل startAt، أو بعد endAt. */
export function isBlockHidden(
  s: TournamentBlockSettings,
  now: number = Date.now(),
): boolean {
  if (!s.visible) return true;
  if (s.startAt && now < Date.parse(s.startAt)) return true;
  if (s.endAt && now > Date.parse(s.endAt)) return true;
  return false;
}
