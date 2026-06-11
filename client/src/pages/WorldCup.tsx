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
import { SaudiSpotlight } from "@/components/worldcup/SaudiSpotlight";
import { ScorersSection } from "@/components/worldcup/ScorersSection";
import { StandingsSection } from "@/components/worldcup/StandingsSection";
import { TeamsSection } from "@/components/worldcup/TeamsSection";
import type { WcFixture, WcGroup, WcOverview, WcScorer } from "@/components/worldcup/wcTypes";

export default function WorldCup() {
  const { user } = useAuth();
  const [openFixtureId, setOpenFixtureId] = useState<number | null>(null);

  useEffect(() => {
    document.title = "مونديال 2026 — تغطية حية لكأس العالم | سبق";
  }, []);

  const { data: overview, isLoading: overviewLoading } = useQuery<WcOverview>({
    queryKey: ["/api/world-cup/overview"],
    refetchInterval: 30_000,
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
        <SaudiSpotlight saudi={overview?.saudi} onOpenMatch={setOpenFixtureId} />
        <MatchesSection fixtures={fixtures} isLoading={fixturesLoading} onOpenMatch={setOpenFixtureId} />
        <StandingsSection groups={groups} isLoading={standingsLoading} />
        <ScorersSection scorers={scorers} isLoading={scorersLoading} />
        <TeamsSection />
        <NewsSection />
      </main>

      <MatchCenterDialog fixtureId={openFixtureId} onClose={() => setOpenFixtureId(null)} />
      <Footer />
    </div>
  );
}
