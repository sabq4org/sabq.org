import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { HeroSection } from "@/components/worldcup/HeroSection";
import { KnockoutBracket } from "@/components/worldcup/KnockoutBracket";
import { MatchCenterDialog } from "@/components/worldcup/MatchCenterDialog";
import { MatchesSection } from "@/components/worldcup/MatchesSection";
import { NewsSection } from "@/components/worldcup/NewsSection";
import { PredictionsCTA } from "@/components/worldcup/PredictionsCTA";
import { PlayerCardDialog } from "@/components/worldcup/PlayerCardDialog";
import { ArabTeamsSpotlight } from "@/components/worldcup/ArabTeamsSpotlight";
import { ScorersSection } from "@/components/worldcup/ScorersSection";
import { StandingsSection } from "@/components/worldcup/StandingsSection";
import { TeamsSection } from "@/components/worldcup/TeamsSection";
import { TournamentFacts } from "@/components/worldcup/TournamentFacts";
import type { WcFixture, WcGroup, WcOverview, WcScorer } from "@/components/worldcup/wcTypes";

export default function WorldCup() {
  const { user } = useAuth();
  const [openFixtureId, setOpenFixtureId] = useState<number | null>(null);
  // بطاقة اللاعب تعلو أي نافذة مفتوحة (قائمة منتخب / مركز مباراة) دون إغلاقها
  const [openPlayerId, setOpenPlayerId] = useState<number | null>(null);

  useEffect(() => {
    document.title = "مونديال 2026 — تغطية حية لكأس العالم | سبق";
  }, []);

  const { data: overview, isLoading: overviewLoading } = useQuery<WcOverview>({
    queryKey: ["/api/world-cup/overview"],
    // مباراة حية → 15ث (نتيجة/دقيقة طازجة)؛ حول لحظة الانطلاق (الموعد مرّ
    // والمزود لم يرفع «حية» بعد) → 10ث لتنقلب الواجهة للوضع المباشر بأسرع ما يمكن؛
    // غير ذلك → 30ث
    refetchInterval: (query) => {
      const data = query.state.data;
      const fixture = data?.matchOfTheDay?.fixture;
      const hasLive = (data?.live?.length ?? 0) > 0 || Boolean(fixture?.status.live);
      if (hasLive) return 7_000;
      const kickoffPassed =
        fixture &&
        !fixture.status.live &&
        !fixture.status.finished &&
        fixture.timestamp * 1000 <= Date.now();
      return kickoffPassed ? 8_000 : 30_000;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const { data: fixturesData, isLoading: fixturesLoading } = useQuery<{ fixtures: WcFixture[] }>({
    queryKey: ["/api/world-cup/fixtures"],
    // مباراة حية في الجدول → 8ث لتطازج نتائج بطاقات المباريات؛ غير ذلك → 60ث
    refetchInterval: (query) =>
      (query.state.data?.fixtures ?? []).some((f) => f.status.live) ? 8_000 : 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const { data: standingsData, isLoading: standingsLoading } = useQuery<{ groups: WcGroup[] }>({
    queryKey: ["/api/world-cup/standings"],
    // ترتيب لحظي مفعّل (صفّ live) → 8ث لتطازج الجدول أثناء المباراة؛ غير ذلك → 5د
    refetchInterval: (query) =>
      (query.state.data?.groups ?? []).some((g) => g.rows.some((r) => r.live)) ? 8_000 : 5 * 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const { data: scorersData, isLoading: scorersLoading } = useQuery<{ scorers: WcScorer[] }>({
    queryKey: ["/api/world-cup/scorers"],
    staleTime: 10 * 60_000,
  });

  const fixtures = Array.isArray(fixturesData?.fixtures) ? fixturesData.fixtures : [];
  const groups = Array.isArray(standingsData?.groups) ? standingsData.groups : [];
  const scorers = Array.isArray(scorersData?.scorers) ? scorersData.scorers : [];

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />
      <NavigationBar />

      <main className="flex-1">
        <HeroSection overview={overview} isLoading={overviewLoading} onOpenMatch={setOpenFixtureId} />
        <TournamentFacts />
        <ArabTeamsSpotlight fixtures={fixtures} groups={groups} onOpenMatch={setOpenFixtureId} />
        <MatchesSection fixtures={fixtures} isLoading={fixturesLoading} onOpenMatch={setOpenFixtureId} />
        <PredictionsCTA />
        <StandingsSection groups={groups} isLoading={standingsLoading} />
        <KnockoutBracket
          fixtures={fixtures}
          groups={groups}
          isLoading={fixturesLoading}
          onOpenMatch={setOpenFixtureId}
        />
        <ScorersSection
          scorers={scorers}
          isLoading={scorersLoading}
          tournamentStarted={fixtures.some((f) => f.status.live || f.status.finished)}
          onOpenPlayer={setOpenPlayerId}
        />
        <TeamsSection />
        <NewsSection />
      </main>

      <MatchCenterDialog
        fixtureId={openFixtureId}
        onClose={() => setOpenFixtureId(null)}
        onOpenPlayer={setOpenPlayerId}
      />
      <PlayerCardDialog playerId={openPlayerId} onClose={() => setOpenPlayerId(null)} />
      <Footer />
    </div>
  );
}
