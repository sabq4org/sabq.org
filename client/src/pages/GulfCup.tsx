import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { GcHero } from "@/components/gulfcup/GcHero";
import { GcSaudiSpotlight } from "@/components/gulfcup/GcSaudiSpotlight";
import { GcGroups } from "@/components/gulfcup/GcGroups";
import { GcSchedule } from "@/components/gulfcup/GcSchedule";
import { GcTeams } from "@/components/gulfcup/GcTeams";
import { GcHostShowcase } from "@/components/gulfcup/GcHostShowcase";
import type { GcFixture, GcGroup, GcOverview, GcTeam } from "@/components/gulfcup/gcTypes";

export default function GulfCup() {
  const { user } = useAuth();

  useEffect(() => {
    document.title = "خليجي 27 — كأس الخليج العربي في السعودية | سبق";
  }, []);

  const { data: overview } = useQuery<GcOverview>({
    queryKey: ["/api/gulf-cup/overview"],
    refetchInterval: (query) => (query.state.data?.started ? 30_000 : 5 * 60_000),
    refetchIntervalInBackground: false,
  });

  const { data: fixturesData, isLoading: fixturesLoading } = useQuery<{ fixtures: GcFixture[] }>({
    queryKey: ["/api/gulf-cup/fixtures"],
    refetchInterval: (query) =>
      (query.state.data?.fixtures ?? []).some((f) => f.status.live) ? 30_000 : 5 * 60_000,
    refetchIntervalInBackground: false,
  });

  const { data: teamsData, isLoading: teamsLoading } = useQuery<{ teams: GcTeam[] }>({
    queryKey: ["/api/gulf-cup/teams"],
    staleTime: 30 * 60_000,
  });

  const { data: standingsData } = useQuery<{ groups: GcGroup[] }>({
    queryKey: ["/api/gulf-cup/standings"],
    staleTime: 5 * 60_000,
  });

  const fixtures = Array.isArray(fixturesData?.fixtures) ? fixturesData.fixtures : [];
  const teams = Array.isArray(teamsData?.teams) ? teamsData.teams : [];
  const groups = Array.isArray(standingsData?.groups) ? standingsData.groups : [];

  const handleJump = (id: "schedule" | "teams") => {
    document.getElementById(id === "schedule" ? "gc-schedule" : "gc-teams")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />
      <NavigationBar />

      <main className="flex-1">
        <GcHero overview={overview} onJump={handleJump} />
        <GcSaudiSpotlight saudi={overview?.saudi} />
        <GcGroups groups={groups} />
        <GcSchedule fixtures={fixtures} isLoading={fixturesLoading} />
        <GcTeams teams={teams} isLoading={teamsLoading} />
        <GcHostShowcase overview={overview} />
      </main>

      <Footer />
    </div>
  );
}
