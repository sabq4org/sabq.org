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
import { KcPredictionsCTA } from "@/components/kingscup/KcPredictionsCTA";
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

  const { data: scorersData, isLoading: scorersLoading } = useQuery<{ scorers: KcScorer[] }>({
    queryKey: ["/api/kings-cup/scorers"],
    staleTime: 10 * 60_000,
  });

  const { data: teamsData, isLoading: teamsLoading } = useQuery<{ teams: KcTeam[] }>({
    queryKey: ["/api/kings-cup/teams"],
    staleTime: 30 * 60_000,
  });

  const fixtures = Array.isArray(fixturesData?.fixtures) ? fixturesData.fixtures : [];
  const scorers = Array.isArray(scorersData?.scorers) ? scorersData.scorers : [];
  const teams = Array.isArray(teamsData?.teams) ? teamsData.teams : [];

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />
      <NavigationBar />

      <main className="flex-1">
        <KcHero overview={overview} isLoading={overviewLoading} onOpenMatch={setOpenFixtureId} />
        <KcFacts onOpenPlayer={setOpenPlayerId} />
        <KcPredictionsCTA />
        <KcMatches fixtures={fixtures} isLoading={fixturesLoading} onOpenMatch={setOpenFixtureId} />
        <KcBracket onOpenMatch={setOpenFixtureId} />
        <KcScorers scorers={scorers} isLoading={scorersLoading} onOpenPlayer={setOpenPlayerId} />
        <KcTeams teams={teams} isLoading={teamsLoading} />
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
