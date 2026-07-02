import { useQuery } from "@tanstack/react-query";
import CupHomeStrip, {
  type CupChampion,
  type CupFixture,
  type CupStripTheme,
} from "../tournaments/CupHomeStrip";

/**
 * بلوك «خليجي 27» في الصفحة الرئيسية — نفس تجربة بلوك المونديال: المباراة
 * القادمة/الحية أو بطاقة البطل، ويختفي كليًا عند إطفائه من لوحة التحكم
 * (blockHidden، شامل نافذة التوقيت) أو غياب البيانات. البطولة في جدة
 * 23 سبتمبر – 6 أكتوبر 2026.
 */

interface GcOverviewLite {
  startsAt: string | null;
  started: boolean;
  nextMatch: CupFixture | null;
  champion?: CupChampion | null;
  blockHidden?: boolean;
}

// ليالي الخليج — بنفسجي ليلي بلمسة ذهبية (تمييزًا عن أخضر المونديال)
const GULF_THEME: CupStripTheme = {
  band: "bg-violet-50 dark:bg-violet-950/25 border-violet-600/10 dark:border-violet-400/10",
  card: "bg-gradient-to-bl from-[#1d1040] via-[#2a1745] to-[#120a2e]",
  ring: "ring-violet-900/40",
  soft: "text-violet-200/80",
  accent: "text-amber-300",
  cta: "bg-amber-300 text-violet-950 hover:bg-amber-200",
};

export default function GulfCupHomeSection() {
  const { data } = useQuery<GcOverviewLite>({
    queryKey: ["/api/gulf-cup/overview"],
    // مباراة جارية → 30ث (كاش الخادم 30/60)؛ غير ذلك → 5 دقائق
    refetchInterval: (query) =>
      query.state.data?.nextMatch?.status.live ? 30_000 : 5 * 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });

  if (!data || data.blockHidden) return null;

  return (
    <CupHomeStrip
      title="خليجي 27"
      subtitle="جدة 2026 — تغطية بتوقيت الرياض"
      championSubtitle="اكتملت البطولة — جدة 2026"
      championLabel="بطل كأس الخليج «خليجي 27»"
      href="/gulf-cup"
      ctaLabel="مركز خليجي 27"
      theme={GULF_THEME}
      fixture={data.nextMatch ?? null}
      champion={data.champion ?? null}
    />
  );
}
