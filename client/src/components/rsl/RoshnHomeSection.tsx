/**
 * بلوك «دوري روشن السعودي» في الصفحة الرئيسية — نفس تجربة بلوكات البطولات:
 * قبل الموسم عدّاد الانطلاق ومباراة الافتتاح، وأثناءه عدّاد الجولة أو المباراة
 * القادمة/الحية، وبعده بطاقة البطل. يختفي كليًّا عند إطفائه من لوحة التحكم
 * (blockHidden) أو غياب البيانات. كل البيانات من /api/rsl/hero بطلب واحد.
 */
import { useQuery } from "@tanstack/react-query";
import roshnLogo from "@assets/roshn-league-logo.png";
import CupHomeStrip, { type CupStripTheme } from "../tournaments/CupHomeStrip";
import { formatKickoffDay, type RslHero } from "./rslTypes";

// أخضر الملعب الليلي بلمسة روشن الزرقاء — نفس هوية هيرو /roshn
const RSL_THEME: CupStripTheme = {
  band: "bg-transparent border-transparent",
  card: "bg-gradient-to-bl from-emerald-950 via-[#04261b] to-[#063828]",
  ring: "ring-emerald-900/40",
  soft: "text-emerald-100/80",
  accent: "text-sky-300",
  cta: "bg-sky-300 text-sky-950 hover:bg-sky-200",
};

export default function RoshnHomeSection() {
  const { data } = useQuery<RslHero>({
    queryKey: ["/api/rsl/hero"],
    refetchInterval: (query) =>
      (query.state.data?.live?.length ?? 0) > 0 ? 15_000 : 5 * 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });

  if (!data || data.blockHidden) return null;
  const { outlook, matchday, nextMatch, lastSeason } = data;

  // بعد ختام الموسم وقبل نشر الجدول الجديد — بطاقة البطل
  const champion =
    outlook.phase === "off-season" && outlook.champion
      ? {
          team: outlook.champion,
          runnerUp: null,
          score: null,
          penalties: null,
          decidedAt: null,
          source: "auto" as const,
        }
      : null;

  // ما قبل الموسم — عدّاد الانطلاق + الافتتاح
  const seasonLabel = outlook.nextSeason ?? outlook.season;
  const preSeason =
    outlook.phase === "pre-season"
      ? {
          label: `موسم ${seasonLabel}-${(seasonLabel + 1) % 100} ينطلق`,
          kickoffTs: outlook.firstKickoff != null ? Math.floor(outlook.firstKickoff / 1000) : null,
          dateLabel: outlook.nextSeasonStart ? formatKickoffDay(outlook.nextSeasonStart) : null,
          opener: outlook.openers[0] ?? null,
        }
      : null;

  return (
    <CupHomeStrip
      title="دوري روشن السعودي"
      subtitle={
        lastSeason?.champion
          ? `حامل اللقب: ${lastSeason.champion.name} — تغطية بتوقيت الرياض`
          : "أقوى دوريات المنطقة — تغطية بتوقيت الرياض"
      }
      championSubtitle="اكتمل الموسم — دوري روشن السعودي"
      championLabel={`بطل دوري روشن ${outlook.season}`}
      href="/roshn"
      ctaLabel="مركز دوري روشن"
      theme={RSL_THEME}
      fixture={nextMatch ?? null}
      champion={champion}
      matchday={matchday ?? null}
      preSeason={preSeason}
      emblemSrc={roshnLogo}
      emblemAlt="شعار دوري روشن السعودي"
    />
  );
}
