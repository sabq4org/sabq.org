import { useQuery } from "@tanstack/react-query";
import asianCupLogo from "@assets/asian-cup-2027-logo.png";
import CupHomeStrip, {
  type CupChampion,
  type CupFixture,
  type CupStripTheme,
} from "../tournaments/CupHomeStrip";

/**
 * بلوك «كأس آسيا 2027» في الصفحة الرئيسية — نفس تجربة بلوك المونديال:
 * المباراة القادمة/الحية أو بطاقة البطل، ويختفي كليًا عند إطفائه من لوحة
 * التحكم (blockHidden، شامل نافذة التوقيت) أو غياب البيانات. البطولة في
 * السعودية يناير 2027.
 */

interface AcOverviewLite {
  startsAt: string | null;
  started: boolean;
  nextMatch: CupFixture | null;
  champion?: CupChampion | null;
  blockHidden?: boolean;
}

// أزرق ملكي عميق بلمسة ذهبية — تمييزًا عن أخضر المونديال وبنفسجي الخليج
const ASIAN_THEME: CupStripTheme = {
  band: "bg-sky-50 dark:bg-sky-950/25 border-sky-600/10 dark:border-sky-400/10",
  card: "bg-gradient-to-bl from-[#062a52] via-[#0a3a66] to-[#041c3a]",
  ring: "ring-sky-900/40",
  soft: "text-sky-200/80",
  accent: "text-amber-300",
  cta: "bg-amber-300 text-sky-950 hover:bg-amber-200",
};

export default function AsianCupHomeSection() {
  const { data } = useQuery<AcOverviewLite>({
    queryKey: ["/api/asian-cup/overview"],
    // مباراة جارية → 30ث (كاش الخادم 30/60)؛ غير ذلك → 5 دقائق
    refetchInterval: (query) =>
      query.state.data?.nextMatch?.status.live ? 30_000 : 5 * 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });

  if (!data || data.blockHidden) return null;

  return (
    <CupHomeStrip
      title="كأس آسيا 2027"
      subtitle="السعودية 2027 — تغطية بتوقيت الرياض"
      championSubtitle="اكتملت البطولة — السعودية 2027"
      championLabel="بطل كأس آسيا 2027"
      href="/asian-cup"
      ctaLabel="مركز كأس آسيا"
      theme={ASIAN_THEME}
      fixture={data.nextMatch ?? null}
      champion={data.champion ?? null}
      emblemSrc={asianCupLogo}
      emblemAlt="شعار كأس آسيا AFC 2027 الرسمي"
    />
  );
}
