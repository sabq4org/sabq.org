import { useQuery } from "@tanstack/react-query";
import kingsCupLogo from "@assets/kings-cup-logo.png";
import CupHomeStrip, {
  type CupChampion,
  type CupFixture,
  type CupStripTheme,
} from "../tournaments/CupHomeStrip";

/**
 * بلوك «كأس خادم الحرمين الشريفين» في الصفحة الرئيسية — نفس تجربة بلوك المونديال:
 * المباراة القادمة/الحية أو بطاقة البطل، ويختفي كليًا عند إطفائه من لوحة التحكم
 * (blockHidden، شامل نافذة التوقيت) أو غياب البيانات.
 */

interface KcOverviewLite {
  started: boolean;
  nextMatch: CupFixture | null;
  champion?: CupChampion | null;
  blockHidden?: boolean;
}

// أخضر سعودي بلمسة ذهبية — هوية كأس الملك
const KINGS_CUP_THEME: CupStripTheme = {
  band: "bg-emerald-50 dark:bg-emerald-950/25 border-emerald-600/10 dark:border-emerald-400/10",
  card: "bg-gradient-to-bl from-[#0b3d2e] via-[#0f5138] to-[#08301f]",
  ring: "ring-emerald-900/40",
  soft: "text-emerald-100/80",
  accent: "text-amber-300",
  cta: "bg-amber-300 text-emerald-950 hover:bg-amber-200",
};

export default function KingsCupHomeSection() {
  const { data } = useQuery<KcOverviewLite>({
    queryKey: ["/api/kings-cup/overview"],
    refetchInterval: (query) =>
      query.state.data?.nextMatch?.status.live ? 15_000 : 5 * 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });

  if (!data || data.blockHidden) return null;

  return (
    <CupHomeStrip
      title="كأس خادم الحرمين الشريفين"
      subtitle="كأس الملك — تغطية بتوقيت الرياض"
      championSubtitle="اكتملت البطولة — كأس الملك"
      championLabel="بطل كأس خادم الحرمين الشريفين"
      href="/kings-cup"
      ctaLabel="مركز كأس الملك"
      theme={KINGS_CUP_THEME}
      fixture={data.nextMatch ?? null}
      champion={data.champion ?? null}
      emblemSrc={kingsCupLogo}
      emblemAlt="شعار كأس خادم الحرمين الشريفين"
    />
  );
}
