/**
 * مركز دوري روشن السعودي — /roshn (و/rsl يحوّل إليه).
 *
 * أُعيد بناؤه كليًّا بنظام تصميم المونديال (نفس نهج /world-cup و/kings-cup):
 * هيرو الملعب الليلي بحالات الموسم الأربع (ما قبل الموسم بعدّاد الانطلاق /
 * عطلة بين الموسمين / يوم جولة / مباراة الليلة)، شريط إرث الموسم الماضي،
 * المباريات بتبويبات، جدول الترتيب الملوّن، سباقات الموسم، الأندية، وأخبار
 * الدوري — البيانات من /api/rsl/hero و/api/sports/pro-league/* القائمة.
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

  const {
    data: hero,
    isLoading: heroLoading,
    isError: heroError,
    refetch: refetchHero,
  } = useQuery<RslHeroData>({
    queryKey: ["/api/rsl/hero"],
    // مباراة حية → 15ث؛ غير ذلك → دقيقة (ما قبل الموسم بيانات شبه ثابتة)
    refetchInterval: (query) =>
      (query.state.data?.live?.length ?? 0) > 0 ? 15_000 : 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const {
    data: matchesData,
    isLoading: matchesLoading,
    isError: matchesError,
    refetch: refetchMatches,
  } = useQuery<{ configured: boolean } & RslMatchBuckets>({
    queryKey: [`/api/sports/${RSL_SLUG}/matches`],
    refetchInterval: (query) =>
      (query.state.data?.live ?? []).some((f) => f.status.live) ? 15_000 : 60_000,
    refetchIntervalInBackground: false,
  });

  const {
    data: standingsData,
    isLoading: standingsLoading,
    isError: standingsError,
    refetch: refetchStandings,
  } = useQuery<{ standings: RslStandingRow[] }>({
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
        <RslHero
          hero={hero}
          isLoading={heroLoading}
          onOpenMatch={setOpenMatchId}
          teamsCount={standings.length || undefined}
        />
        {heroError && !hero && (
          <SectionError label="حالة الموسم والمباريات الحية" onRetry={() => void refetchHero()} />
        )}
        <RslFacts hero={hero} />
        {matchesError && !matchesData ? (
          <SectionError label="جدول المباريات" onRetry={() => void refetchMatches()} />
        ) : (
          <RslMatches buckets={buckets} isLoading={matchesLoading} onOpenMatch={setOpenMatchId} />
        )}
        {standingsError && !standingsData ? (
          <SectionError label="جدول الترتيب" onRetry={() => void refetchStandings()} />
        ) : (
          <RslStandings
            standings={standings}
            isLoading={standingsLoading}
            inSeason={inSeason}
            previousSeason={previousSeason}
          />
        )}
        <RslScorers inSeason={inSeason} previousSeason={previousSeason} />
        <TeamOfTheWeekSection
          endpoint="/api/sports/pro-league/totw"
          subtitle="الأعلى تقييمًا في آخر جولة من دوري روشن"
        />
        <RslTeams standings={standings} isLoading={standingsLoading} />
        {/* كتلة الأخبار داخل حاوية القسم — كانت تمتد للحواف بلا هوامش كبقية الأقسام */}
        <section dir="rtl" className="py-10">
          <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SportsNewsBlock query="دوري روشن" title="أخبار دوري روشن" />
          </div>
        </section>
      </main>

      <MatchDialog id={openMatchId} onClose={() => setOpenMatchId(null)} />
      <Footer />
    </div>
  );
}

/**
 * حالة فشل قسم — الأقسام كانت تعيد null عند فشل الجلب فيرى الزائر صفحة
 * شبه فارغة بلا تفسير أثناء عطل مزوّد. رسالة صريحة + زر إعادة محاولة.
 */
function SectionError({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <section dir="rtl" className="py-8">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-10 text-center">
          <p className="text-sm font-bold text-foreground">تعذّر تحميل {label} حاليًا</p>
          <p className="text-xs text-muted-foreground">قد يكون خللًا مؤقتًا لدى مزوّد البيانات</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full bg-primary px-5 py-1.5 text-xs font-bold text-primary-foreground transition hover:opacity-90"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    </section>
  );
}
