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

// ليل الخليج الزمردي — درجة أعمق من أخضر المونديال الساطع: الشريطان يتجاوران
// في الرئيسية فيبقى التمييز بالعمق اللوني مع وحدة هوية خليجي 27 (زمردي + ذهبي).
const GULF_THEME: CupStripTheme = {
  band: "bg-emerald-50 dark:bg-emerald-950/25 border-emerald-600/10 dark:border-emerald-400/10",
  card: "bg-gradient-to-bl from-[#0A6B47] via-[#08573B] to-[#04241A]",
  ring: "ring-emerald-900/40",
  soft: "text-emerald-200/80",
  accent: "text-amber-300",
  cta: "bg-amber-300 text-emerald-950 hover:bg-amber-200",
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
