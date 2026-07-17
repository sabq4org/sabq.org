/**
 * مركز دوري روشن السعودي — /roshn (و/rsl يحوّل إليه).
 *
 * أُعيد بناؤه كليًّا بنظام تصميم المونديال (نفس نهج /world-cup و/kings-cup):
 * هيرو الملعب الليلي بحالات الموسم الأربع (ما قبل الموسم بعدّاد الانطلاق /
 * عطلة بين الموسمين / يوم جولة / مباراة الليلة)، شريط إرث الموسم الماضي،
 * المباريات بتبويبات، بانر التوقّعات (محرّك المونديال)، جدول الترتيب الملوّن،
 * سباقات الموسم، الأندية، وأخبار الدوري — البيانات من /api/rsl/hero
 * و/api/sports/pro-league/* القائمة.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { SportsNewsBlock } from "@/components/sports/SportsNewsBlock";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";
import { MatchDialog } from "@/pages/SportsHub";
import { TeamOfTheWeekSection } from "@/components/worldcup/TeamOfTheWeekSection";
import { RslHero } from "@/components/rsl/RslHero";
import { RslFacts } from "@/components/rsl/RslFacts";
import { RslMatches, type RslMatchBuckets } from "@/components/rsl/RslMatches";
import { RslStandings } from "@/components/rsl/RslStandings";
import { RslScorers } from "@/components/rsl/RslScorers";
import { RslTeams } from "@/components/rsl/RslTeams";
import {
  RSL_SLUG,
  type RslHero as RslHeroData,
  type RslStandingRow,
} from "@/components/rsl/rslTypes";

export default function RoshnHub() {
  const { user } = useAuth();
  const [openMatchId, setOpenMatchId] = useState<number | null>(null);

  useEffect(() => {
    document.title = "دوري روشن السعودي — تغطية حية وجدول وترتيب وتوقّعات | سبق";
  }, []);
  useCanonical("https://sabq.org/roshn");

  const { data: hero, isLoading: heroLoading } = useQuery<RslHeroData>({
    queryKey: ["/api/rsl/hero"],
    // مباراة حية → 15ث؛ غير ذلك → دقيقة (ما قبل الموسم بيانات شبه ثابتة)
    refetchInterval: (query) =>
      (query.state.data?.live?.length ?? 0) > 0 ? 15_000 : 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const { data: matchesData, isLoading: matchesLoading } = useQuery<
    { configured: boolean } & RslMatchBuckets
  >({
    queryKey: [`/api/sports/${RSL_SLUG}/matches`],
    refetchInterval: (query) =>
      (query.state.data?.live ?? []).some((f) => f.status.live) ? 15_000 : 60_000,
    refetchIntervalInBackground: false,
  });

  const { data: standingsData, isLoading: standingsLoading } = useQuery<{ standings: RslStandingRow[] }>({
    queryKey: [`/api/sports/${RSL_SLUG}/standings`],
    refetchInterval: (query) =>
      (query.state.data?.standings ?? []).some((r) => r.live) ? 15_000 : 5 * 60_000,
    refetchIntervalInBackground: false,
  });

  const buckets: RslMatchBuckets = {
    live: Array.isArray(matchesData?.live) ? matchesData.live : [],
    today: Array.isArray(matchesData?.today) ? matchesData.today : [],
    upcoming: Array.isArray(matchesData?.upcoming) ? matchesData.upcoming : [],
    results: Array.isArray(matchesData?.results) ? matchesData.results : [],
  };
  const standings = Array.isArray(standingsData?.standings) ? standingsData.standings : [];

  const inSeason = hero?.outlook?.phase === "in-season";
  const previousSeason =
    hero?.lastSeason?.previousSeason ??
    (hero?.outlook ? (hero.outlook.nextSeason ?? hero.outlook.season) - 1 : null);

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />
      <NavigationBar />

      <main className="flex-1">
        <RslHero hero={hero} isLoading={heroLoading} onOpenMatch={setOpenMatchId} />
        <RslFacts hero={hero} />
        <RslMatches buckets={buckets} isLoading={matchesLoading} onOpenMatch={setOpenMatchId} />
        <RslStandings
          standings={standings}
          isLoading={standingsLoading}
          inSeason={inSeason}
          previousSeason={previousSeason}
        />
        <RslScorers inSeason={inSeason} previousSeason={previousSeason} />
        <TeamOfTheWeekSection
          endpoint="/api/sports/pro-league/totw"
          subtitle="الأعلى تقييمًا في آخر جولة من دوري روشن"
        />
        <RslTeams standings={standings} isLoading={standingsLoading} />
        <SportsNewsBlock query="دوري روشن" title="أخبار دوري روشن" />
      </main>

      <MatchDialog id={openMatchId} onClose={() => setOpenMatchId(null)} />
      <Footer />
    </div>
  );
}
