import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { GcHero } from "@/components/gulfcup/GcHero";
import { GcSectionNav } from "@/components/gulfcup/GcSectionNav";
import { GcSaudiSpotlight } from "@/components/gulfcup/GcSaudiSpotlight";
import { GcGroups } from "@/components/gulfcup/GcGroups";
import { GcSchedule } from "@/components/gulfcup/GcSchedule";
import { GcKnockoutSection } from "@/components/gulfcup/GcKnockoutSection";
import { GcScorersSection } from "@/components/gulfcup/GcScorersSection";
import { GcHistorySection } from "@/components/gulfcup/GcHistorySection";
import { GcTeams } from "@/components/gulfcup/GcTeams";
import { GcHostShowcase } from "@/components/gulfcup/GcHostShowcase";
import { GcPredictionsCTA } from "@/components/gulfcup/GcPredictionsCTA";
import { GcMatchCenterDialog } from "@/components/gulfcup/GcMatchCenterDialog";
import type {
  GcFixture,
  GcGroup,
  GcHistory,
  GcOverview,
  GcTeam,
} from "@/components/gulfcup/gcTypes";

export default function GulfCup() {
  const { user } = useAuth();

  useEffect(() => {
    document.title = "خليجي 27 — كأس الخليج العربي في السعودية | سبق";
  }, []);

  // مركز المباراة: تُفتح النافذة من أي بطاقة مباراة عبر الصفحة كلها
  const [openFixtureId, setOpenFixtureId] = useState<number | null>(null);

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
    refetchInterval: (query) =>
      (query.state.data?.groups ?? []).some((g) => g.rows.some((r) => r.live)) ? 8_000 : false,
  });

  // سجلّ البطولة (ثابت) — يغذّي بادج «حامل اللقب» في الهيرو وقسم السجلّ
  const { data: history } = useQuery<GcHistory>({
    queryKey: ["/api/gulf-cup/history"],
    staleTime: 60 * 60_000,
  });

  const fixtures = Array.isArray(fixturesData?.fixtures) ? fixturesData.fixtures : [];
  const teams = Array.isArray(teamsData?.teams) ? teamsData.teams : [];
  const groups = Array.isArray(standingsData?.groups) ? standingsData.groups : [];
  const titleHolder =
    history?.editions?.find((e) => !e.upcoming && e.champion)?.champion ?? null;

  const handleJump = (id: "schedule" | "teams") => {
    document.getElementById(id === "schedule" ? "gc-schedule" : "gc-teams")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/70 via-background to-background dark:from-emerald-950/20 dark:via-background dark:to-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />
      <NavigationBar />

      <main className="flex-1">
        <GcHero overview={overview} onJump={handleJump} titleHolder={titleHolder} />
        <GcSectionNav />
        <GcPredictionsCTA />
        <GcSaudiSpotlight saudi={overview?.saudi} onOpenMatch={setOpenFixtureId} />
        <GcSchedule
          fixtures={fixtures}
          isLoading={fixturesLoading}
          onOpenMatch={setOpenFixtureId}
        />
        <GcGroups groups={groups} />
        <GcKnockoutSection fixtures={fixtures} onOpenMatch={setOpenFixtureId} />
        <GcScorersSection />
        <GcHistorySection />
        <GcTeams teams={teams} isLoading={teamsLoading} />
        <GcHostShowcase overview={overview} />
      </main>

      <GcMatchCenterDialog fixtureId={openFixtureId} onClose={() => setOpenFixtureId(null)} />

      <Footer />
    </div>
  );
}
