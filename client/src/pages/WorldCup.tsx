import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { HeroSection } from "@/components/worldcup/HeroSection";
import { MatchCenterDialog } from "@/components/worldcup/MatchCenterDialog";
import { MatchesSection } from "@/components/worldcup/MatchesSection";
import { NewsSection } from "@/components/worldcup/NewsSection";
import { PredictionsCTA } from "@/components/worldcup/PredictionsCTA";
import { PlayerCardDialog } from "@/components/worldcup/PlayerCardDialog";
import { SaudiSpotlight } from "@/components/worldcup/SaudiSpotlight";
import { ScorersSection } from "@/components/worldcup/ScorersSection";
import { StandingsSection } from "@/components/worldcup/StandingsSection";
import { TeamsSection } from "@/components/worldcup/TeamsSection";
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
    // حول لحظة الانطلاق (الموعد مرّ والمزود لم يرفع «حية» بعد) نستعجل كل 10 ثوانٍ
    // حتى تنقلب الواجهة للوضع المباشر بأقل تأخير ممكن
    refetchInterval: (query) => {
      const fixture = query.state.data?.matchOfTheDay?.fixture;
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
    refetchInterval: 60_000,
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
        <SaudiSpotlight
          saudi={overview?.saudi}
          onOpenMatch={setOpenFixtureId}
          onOpenPlayer={setOpenPlayerId}
        />
        <MatchesSection fixtures={fixtures} isLoading={fixturesLoading} onOpenMatch={setOpenFixtureId} />
        <PredictionsCTA />
        <StandingsSection groups={groups} isLoading={standingsLoading} />
        <ScorersSection
          scorers={scorers}
          isLoading={scorersLoading}
          tournamentStarted={fixtures.some((f) => f.status.live || f.status.finished)}
          onOpenPlayer={setOpenPlayerId}
        />
        <TeamsSection onOpenPlayer={setOpenPlayerId} />
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
