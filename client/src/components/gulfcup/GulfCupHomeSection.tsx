import { useQuery } from "@tanstack/react-query";
import gulfCupLogoHorizontal from "@assets/gulf-cup-27-logo-horizontal.svg";
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

// ليلي تركوازي بارد + سكاي — مطابقة تطبيق خليجي 27 (بلا ذهب).
const GULF_THEME: CupStripTheme = {
  band: "bg-sky-50 dark:bg-sky-950/25 border-sky-600/10 dark:border-sky-400/10",
  card: "bg-gradient-to-bl from-[#041C22] via-[#052830] to-[#0A3D45]",
  ring: "ring-sky-950/40",
  soft: "text-sky-200/80",
  accent: "text-sky-300",
  cta: "bg-sky-300 text-sky-950 hover:bg-sky-200",
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
      emblemSrc={gulfCupLogoHorizontal}
      emblemAlt="شعار خليجي 27 الرسمي"
    />
  );
}
