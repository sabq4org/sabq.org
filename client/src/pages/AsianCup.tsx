import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { AcHero } from "@/components/asiancup/AcHero";
import { AcFacts } from "@/components/asiancup/AcFacts";
import { AcSaudiSpotlight } from "@/components/asiancup/AcSaudiSpotlight";
import { AcGroups } from "@/components/asiancup/AcGroups";
import { AcSchedule } from "@/components/asiancup/AcSchedule";
import { AcTeams } from "@/components/asiancup/AcTeams";
import { AcHostShowcase } from "@/components/asiancup/AcHostShowcase";
import { AcKnockoutSection, AcTournamentRaces } from "@/components/asiancup/AcTournamentSections";
import { AcMatchCenterDialog } from "@/components/asiancup/AcMatchCenterDialog";
import { AcPlayerCardDialog } from "@/components/asiancup/AcPlayerCardDialog";
import type { AcFixture, AcGroup, AcOverview, AcTeam } from "@/components/asiancup/acTypes";

export default function AsianCup() {
  const { user } = useAuth();
  const [openFixtureId, setOpenFixtureId] = useState<number | null>(null);
  const [openPlayerId, setOpenPlayerId] = useState<number | null>(null);

  useEffect(() => {
    document.title = "كأس آسيا 2027 — التغطية الكاملة من السعودية | سبق";
  }, []);

  const { data: overview } = useQuery<AcOverview>({
    queryKey: ["/api/asian-cup/overview"],
    refetchInterval: (query) => (query.state.data?.started ? 30_000 : 5 * 60_000),
    refetchIntervalInBackground: false,
  });

  const { data: fixturesData, isLoading: fixturesLoading } = useQuery<{ fixtures: AcFixture[] }>({
    queryKey: ["/api/asian-cup/fixtures"],
    refetchInterval: (query) =>
      (query.state.data?.fixtures ?? []).some((f) => f.status.live) ? 30_000 : 5 * 60_000,
    refetchIntervalInBackground: false,
  });

  const { data: teamsData, isLoading: teamsLoading } = useQuery<{ teams: AcTeam[] }>({
    queryKey: ["/api/asian-cup/teams"],
    staleTime: 30 * 60_000,
  });

  const { data: standingsData } = useQuery<{ groups: AcGroup[] }>({
    queryKey: ["/api/asian-cup/standings"],
    staleTime: 5 * 60_000,
    refetchInterval: (query) =>
      (query.state.data?.groups ?? []).some((g) => g.rows.some((r) => r.live)) ? 8_000 : false,
  });

  const fixtures = Array.isArray(fixturesData?.fixtures) ? fixturesData.fixtures : [];
  const teams = Array.isArray(teamsData?.teams) ? teamsData.teams : [];
  const groups = Array.isArray(standingsData?.groups) ? standingsData.groups : [];

  const handleJump = (id: "schedule" | "teams") => {
    document.getElementById(id === "schedule" ? "ac-schedule" : "ac-teams")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />
      <NavigationBar />

      <main className="flex-1">
        <AcHero overview={overview} onJump={handleJump} />
        <AcFacts />
        <AcSaudiSpotlight saudi={overview?.saudi} onOpenMatch={setOpenFixtureId} />
        <AcGroups groups={groups} />
        <AcSchedule fixtures={fixtures} isLoading={fixturesLoading} onOpenMatch={setOpenFixtureId} />
        <AcKnockoutSection onOpenMatch={setOpenFixtureId} />
        <AcTournamentRaces
          tournamentStarted={fixtures.some((fixture) => fixture.status.live || fixture.status.finished)}
          onOpenPlayer={setOpenPlayerId}
        />
        <AcTeams teams={teams} isLoading={teamsLoading} />
        <AcHostShowcase overview={overview} />
      </main>

      <AcMatchCenterDialog
        fixtureId={openFixtureId}
        onClose={() => setOpenFixtureId(null)}
        onOpenPlayer={setOpenPlayerId}
      />
      <AcPlayerCardDialog playerId={openPlayerId} onClose={() => setOpenPlayerId(null)} />
      <Footer />
    </div>
  );
}
