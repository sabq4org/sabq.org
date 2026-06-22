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
import { SaudiSpotlight } from "@/components/worldcup/SaudiSpotlight";
import { ScorersSection } from "@/components/worldcup/ScorersSection";
import { StandingsSection } from "@/components/worldcup/StandingsSection";
import { TeamsSection } from "@/components/worldcup/TeamsSection";
import { WorldCupPulse } from "@/components/worldcup/WorldCupPulse";
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
      if (hasLive) return 15_000;
      const kickoffPassed =
        fixture &&
        !fixture.status.live &&
        !fixture.status.finished &&
        fixture.timestamp * 1000 <= Date.now();
      return kickoffPassed ? 10_000 : 30_000;
    },
    refetchIntervalInBackground: false,
  });

  const { data: fixturesData, isLoading: fixturesLoading } = useQuery<{ fixtures: WcFixture[] }>({
    queryKey: ["/api/world-cup/fixtures"],
    // مباراة حية في الجدول → 20ث لتطازج نتائج بطاقات المباريات؛ غير ذلك → 60ث
    refetchInterval: (query) =>
      (query.state.data?.fixtures ?? []).some((f) => f.status.live) ? 20_000 : 60_000,
    refetchIntervalInBackground: false,
  });

  const { data: standingsData, isLoading: standingsLoading } = useQuery<{ groups: WcGroup[] }>({
    queryKey: ["/api/world-cup/standings"],
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
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
        {/* نبض المباراة اللحظي — أقرب/أحدث مباراة (هوية المونديال الخضراء) */}
        <div className="mx-auto w-full max-w-2xl px-4 mt-5">
          <WorldCupPulse />
        </div>
        <SaudiSpotlight
          saudi={overview?.saudi}
          onOpenMatch={setOpenFixtureId}
          onOpenPlayer={setOpenPlayerId}
        />
        <MatchesSection fixtures={fixtures} isLoading={fixturesLoading} onOpenMatch={setOpenFixtureId} />
        <PredictionsCTA />
        <StandingsSection groups={groups} isLoading={standingsLoading} />
        <KnockoutBracket fixtures={fixtures} isLoading={fixturesLoading} onOpenMatch={setOpenFixtureId} />
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
