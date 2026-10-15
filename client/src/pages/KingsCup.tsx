import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { KcHero } from "@/components/kingscup/KcHero";
import { KcFacts } from "@/components/kingscup/KcFacts";
import { KcMatches } from "@/components/kingscup/KcMatches";
import { KcBracket } from "@/components/kingscup/KcBracket";
import { KcScorers } from "@/components/kingscup/KcScorers";
import { KcTeams } from "@/components/kingscup/KcTeams";
import { KcHistorySection } from "@/components/kingscup/KcHistorySection";
import { KcMatchDialog } from "@/components/kingscup/KcMatchDialog";
import { KcPlayerDialog } from "@/components/kingscup/KcPlayerDialog";
import type { KcFixture, KcOverview, KcScorer, KcTeam } from "@/components/kingscup/kcTypes";

export default function KingsCup() {
  const { user } = useAuth();
  const [openFixtureId, setOpenFixtureId] = useState<number | null>(null);
  const [openPlayerId, setOpenPlayerId] = useState<number | null>(null);

  useEffect(() => {
    document.title = "كأس خادم الحرمين الشريفين — تغطية حية | سبق";
  }, []);

  const { data: overview, isLoading: overviewLoading } = useQuery<KcOverview>({
    queryKey: ["/api/kings-cup/overview"],
    refetchInterval: (query) => {
      const d = query.state.data;
      const live = (d?.live?.length ?? 0) > 0 || Boolean(d?.matchOfTheDay?.fixture?.status.live);
      return live ? 15_000 : 60_000;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const { data: fixturesData, isLoading: fixturesLoading } = useQuery<{ fixtures: KcFixture[] }>({
    queryKey: ["/api/kings-cup/fixtures"],
    refetchInterval: (query) =>
      (query.state.data?.fixtures ?? []).some((f) => f.status.live) ? 15_000 : 60_000,
    refetchIntervalInBackground: false,
  });

  const fixtures = Array.isArray(fixturesData?.fixtures) ? fixturesData.fixtures : [];
  const hasLiveMatch =
    fixtures.some((f) => f.status.live) ||
    (overview?.live?.length ?? 0) > 0 ||
    Boolean(overview?.matchOfTheDay?.fixture?.status.live);

  // أثناء البث: كل دقيقتين (كاش الخادم SHORT). خارج المباريات: 10 دقائق — نفس روشن.
  const raceStale = hasLiveMatch ? 2 * 60_000 : 10 * 60_000;
  const racePoll = hasLiveMatch ? 2 * 60_000 : false;

  const { data: scorersData, isLoading: scorersLoading } = useQuery<{ scorers: KcScorer[] }>({
    queryKey: ["/api/kings-cup/scorers"],
    staleTime: raceStale,
    refetchInterval: racePoll,
    refetchIntervalInBackground: false,
  });

  const { data: teamsData, isLoading: teamsLoading } = useQuery<{ teams: KcTeam[] }>({
    queryKey: ["/api/kings-cup/teams"],
    staleTime: 30 * 60_000,
  });

  const scorers = Array.isArray(scorersData?.scorers) ? scorersData.scorers : [];
  const teams = Array.isArray(teamsData?.teams) ? teamsData.teams : [];

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />
      <NavigationBar />

      <main className="flex-1">
        <KcHero
          overview={overview}
          fixtures={fixtures}
          isLoading={overviewLoading}
          onOpenMatch={setOpenFixtureId}
        />
        <KcFacts onOpenPlayer={setOpenPlayerId} />
        <KcMatches fixtures={fixtures} isLoading={fixturesLoading} onOpenMatch={setOpenFixtureId} />
        <KcBracket onOpenMatch={setOpenFixtureId} />
        <KcScorers
          scorers={scorers}
          isLoading={scorersLoading}
          tournamentStarted={fixtures.some((f) => f.status.live || f.status.finished)}
          hasLiveMatch={hasLiveMatch}
          onOpenPlayer={setOpenPlayerId}
        />
        <KcTeams teams={teams} isLoading={teamsLoading} />
        <KcHistorySection />
      </main>

      <KcMatchDialog
        fixtureId={openFixtureId}
        onClose={() => setOpenFixtureId(null)}
        onOpenPlayer={setOpenPlayerId}
      />
      <KcPlayerDialog playerId={openPlayerId} onClose={() => setOpenPlayerId(null)} />
      <Footer />
    </div>
  );
}
