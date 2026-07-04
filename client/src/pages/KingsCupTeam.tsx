/**
 * صفحة النادي في كأس خادم الحرمين الشريفين — بالترتيب المعتمد:
 * هيرو داكن بهوية الكأس (شعار + تأسيس + مدينة + ألقاب الكأس من سجلّنا الحقيقي
 * + مركز النادي في دوريه) ← بطاقة المدرب بمسيرته ← مباراة النادي القادمة في
 * الكأس بعدّادها وشريط احتمالاتها ← أرقام الموسم (مشوار الكأس ثم الدوري) ←
 * بطاقة الملعب بصورته ← التشكيلة مقسّمة بالمراكز ← هدّافو النادي ← حركة
 * الانتقالات ← خزينة ألقاب الكأس ← مباريات النادي.
 *
 * البطاقات الغنية (نبض الأرقام/المدرب/الهدّافون/الانتقالات) معاد استخدامها
 * من صفحة نادي البوابة SportsTeam — نفس الشكل الحقيقي الذي يعرفه مستخدم VARA.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { ChevronRight, Landmark, MapPin, Trophy, Users } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { KcMatchCard } from "@/components/kingscup/KcMatchCard";
import { KcMatchDialog } from "@/components/kingscup/KcMatchDialog";
import { KcPlayerDialog } from "@/components/kingscup/KcPlayerDialog";
import { KcProbabilityBar } from "@/components/kingscup/KcProbabilityBar";
import { CountdownChips } from "@/components/kingscup/KcHero";
import {
  kcSeasonLabel,
  type KcFixture,
  type KcPrediction,
  type KcRecord,
  type KcSquadPlayer,
  type KcTeamProfile,
} from "@/components/kingscup/kcTypes";
import {
  CoachCard,
  POSITION_SECTIONS,
  TeamScorersCard,
  TeamStatsCard,
  TeamTransfersCard,
  type SpCoach,
  type SpTeamScorer,
  type SpTeamStats,
  type SpTeamTransfers,
} from "./SportsTeam";

/** حمولة الصفحة — ملف النادي الأساسي مُثرًى بإحصائيات الكأس والانتقالات */
type KcTeamPageData = Omit<KcTeamProfile, "coach" | "topScorers" | "standing"> & {
  coach: SpCoach | null;
  topScorers: SpTeamScorer[];
  standing: { rank: number; points: number } | null;
  stats: SpTeamStats | null;
  kcStats: { season: number; stats: SpTeamStats } | null;
  transfers: SpTeamTransfers;
};

function SquadSection({
  squad,
  onOpenPlayer,
}: {
  squad: KcSquadPlayer[];
  onOpenPlayer: (id: number) => void;
}) {
  const groups = POSITION_SECTIONS.map((sec) => ({
    ...sec,
    players: squad.filter((p) => p.positionEn === sec.en),
  })).filter((g) => g.players.length > 0);
  const ungrouped = squad.filter((p) => !POSITION_SECTIONS.some((s) => s.en === p.positionEn));

  return (
    <section className="mb-8">
      <h2 className="text-lg font-black mb-4 flex items-center gap-2">
        <Users className="h-5 w-5 text-emerald-600" />
        التشكيلة
        <span className="text-xs font-normal text-muted-foreground">({squad.length} لاعبًا)</span>
      </h2>
      <div className="space-y-5">
        {[...groups, ...(ungrouped.length > 0 ? [{ en: "", label: "أخرى", players: ungrouped }] : [])].map(
          (g) => (
            <div key={g.label}>
              <p className="mb-2 text-xs font-bold text-muted-foreground">{g.label}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {g.players.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => p.id > 0 && onOpenPlayer(p.id)}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-right hover-elevate active-elevate-2"
                  >
                    {p.photo ? (
                      <img src={p.photo} alt={p.name} className="h-10 w-10 rounded-full object-cover bg-muted shrink-0" loading="lazy" />
                    ) : (
                      <span className="h-10 w-10 rounded-full bg-muted shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {p.position}
                        {p.number != null ? ` · ${p.number}` : ""}
                        {p.age != null ? ` · ${p.age} سنة` : ""}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ),
        )}
      </div>
    </section>
  );
}

export default function KingsCupTeam() {
  const { user } = useAuth();
  const [, params] = useRoute("/kings-cup/team/:teamId");
  const teamId = Number(params?.teamId);
  const [openFixtureId, setOpenFixtureId] = useState<number | null>(null);
  const [openPlayerId, setOpenPlayerId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<KcTeamPageData>({
    queryKey: [`/api/kings-cup/team/${teamId}`],
    enabled: Number.isFinite(teamId) && teamId > 0,
  });

  // سجل الأبطال — منه ألقاب النادي في الكأس (بيانات مزوّد حقيقية، كاش طويل)
  const { data: record } = useQuery<KcRecord>({
    queryKey: ["/api/kings-cup/record"],
    staleTime: 60 * 60_000,
  });

  // مباريات النادي في الكأس (جدول البطولة كاملًا ثم نصفّي على النادي)
  const { data: kcFixturesData } = useQuery<{ fixtures: KcFixture[] }>({
    queryKey: ["/api/kings-cup/fixtures"],
    staleTime: 60_000,
  });

  useEffect(() => {
    document.title = data?.team?.name
      ? `${data.team.name} — كأس خادم الحرمين الشريفين | سبق`
      : "نادٍ — كأس خادم الحرمين الشريفين | سبق";
  }, [data?.team?.name]);

  const leagueFixtures = Array.isArray(data?.fixtures) ? data.fixtures : [];
  const squad = Array.isArray(data?.squad) ? data.squad : [];
  const allKcFixtures = Array.isArray(kcFixturesData?.fixtures) ? kcFixturesData.fixtures : [];
  const clubKcFixtures = allKcFixtures.filter((f) => f.home.id === teamId || f.away.id === teamId);
  const nextKcFixture = clubKcFixtures.find((f) => !f.status.finished) ?? null;

  const { data: predictionData } = useQuery<{ prediction: KcPrediction | null }>({
    queryKey: [`/api/kings-cup/match/${nextKcFixture?.id}/prediction`],
    enabled: nextKcFixture != null,
    staleTime: 5 * 60_000,
  });
  const nextPrediction = predictionData?.prediction ?? null;

  // ألقاب النادي في الكأس من سجلّنا (id النادي نفسه عبر API-Football)
  const titlesRow = (record?.titles ?? []).find((t) => t.id === teamId) ?? null;
  const titleEditions = (record?.editions ?? []).filter((e) => e.champion?.id === teamId);

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />
      <NavigationBar />

      <main className="flex-1">
        {isLoading ? (
          <div className="container max-w-5xl mx-auto px-4 py-10">
            <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
          </div>
        ) : !data ? (
          <div className="container max-w-5xl mx-auto px-4 py-10">
            <p className="text-sm text-muted-foreground">تعذّر العثور على النادي.</p>
          </div>
        ) : (
          <>
            {/* 1) هيرو النادي — أرضية الكأس الليلية بتوهجها الذهبي */}
            <section className="relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-bl from-emerald-950 via-[#04261b] to-[#063828]" />
              <div className="absolute -top-24 -right-16 h-72 w-72 rounded-full bg-amber-300/15 blur-3xl" />
              <div className="relative container max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
                <Link href="/kings-cup">
                  <a className="inline-flex items-center gap-1 text-xs text-emerald-100/70 hover:text-white mb-5">
                    <ChevronRight className="h-4 w-4" />
                    العودة لمركز كأس الملك
                  </a>
                </Link>
                <div className="flex flex-col sm:flex-row items-center gap-5">
                  <span className="h-24 w-24 rounded-full bg-white p-2.5 ring-4 ring-amber-300/30 shadow-2xl shrink-0">
                    <img src={data.team.logo} alt={data.team.name} className="h-full w-full object-contain" />
                  </span>
                  <div className="min-w-0 text-center sm:text-right">
                    <h1 className="text-3xl font-black text-white truncate">{data.team.name}</h1>
                    <div className="mt-2.5 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      {data.team.founded && (
                        <Badge className="bg-white/10 text-emerald-100 border-0">تأسس {data.team.founded}</Badge>
                      )}
                      {data.team.venue?.city && (
                        <Badge className="bg-white/10 text-emerald-100 border-0 gap-1">
                          <MapPin className="h-3 w-3" />
                          {data.team.venue.city}
                        </Badge>
                      )}
                      {data.standing && data.competitionName && (
                        <Badge className="bg-white/10 text-emerald-100 border-0">
                          المركز {data.standing.rank} في {data.competitionName}
                        </Badge>
                      )}
                      {titlesRow && (
                        <Badge className="bg-amber-400/15 text-amber-200 border border-amber-300/30 gap-1">
                          <Trophy className="h-3 w-3" />
                          {titlesRow.titles === 1
                            ? "لقب كأس ملك"
                            : titlesRow.titles === 2
                              ? "لقبا كأس ملك"
                              : `${titlesRow.titles} ألقاب كأس ملك`}
                          {` · آخرها ${kcSeasonLabel(titlesRow.lastSeason)}`}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <div className="container max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              {/* 2) الجهاز الفني + 5) الملعب — جنبًا لجنب على الشاشات الواسعة */}
              <div className="grid md:grid-cols-2 gap-4 mb-8">
                {data.coach && <CoachCard coach={data.coach} />}
                {data.team.venue?.name && (
                  <Card className="overflow-hidden">
                    {data.team.venue.image && (
                      <img
                        src={data.team.venue.image}
                        alt={data.team.venue.name}
                        className="h-40 w-full object-cover"
                        loading="lazy"
                      />
                    )}
                    <div className="p-5">
                      <div className="flex items-center gap-2 mb-1.5">
                        <MapPin className="w-5 h-5 text-primary" />
                        <h2 className="font-bold text-lg">{data.team.venue.name}</h2>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {data.team.venue.city}
                        {data.team.venue.capacity
                          ? ` · يتسع لـ${data.team.venue.capacity.toLocaleString("en-US")} متفرّج`
                          : ""}
                      </p>
                    </div>
                  </Card>
                )}
              </div>

              {/* 3) مباراة النادي القادمة في الكأس */}
              {nextKcFixture && (
                <section className="mb-8">
                  <h2 className="text-lg font-black mb-4">مباراة النادي القادمة في الكأس</h2>
                  <div className="rounded-2xl border border-amber-300/30 bg-gradient-to-bl from-emerald-950 via-[#04261b] to-[#063828] p-4 sm:p-5 space-y-4">
                    {!nextKcFixture.status.live && (
                      <CountdownChips timestamp={nextKcFixture.timestamp} />
                    )}
                    <div className="rounded-xl bg-background">
                      <KcMatchCard fixture={nextKcFixture} onOpen={setOpenFixtureId} />
                    </div>
                    {nextPrediction && (
                      <KcProbabilityBar fixture={nextKcFixture} prediction={nextPrediction} tone="dark" />
                    )}
                  </div>
                </section>
              )}

              {/* 4) أرقام الموسم — مشوار الكأس أولًا ثم الدوري */}
              {data.kcStats && (
                <section className="mb-8">
                  <h2 className="text-lg font-black mb-4">
                    مشوار النادي في كأس الملك
                    <span className="mr-2 text-xs font-normal text-muted-foreground">
                      نسخة {kcSeasonLabel(data.kcStats.season)}
                    </span>
                  </h2>
                  <TeamStatsCard stats={data.kcStats.stats} />
                </section>
              )}
              {data.stats && (
                <section className="mb-8">
                  <h2 className="text-lg font-black mb-4">
                    أرقام النادي في {data.competitionName ?? "دوريه"}
                  </h2>
                  <TeamStatsCard stats={data.stats} />
                </section>
              )}

              {/* 6) التشكيلة مقسّمة بالمراكز */}
              {squad.length > 0 && <SquadSection squad={squad} onOpenPlayer={setOpenPlayerId} />}

              {/* 7) هدّافو النادي + 8) حركة الانتقالات */}
              {Array.isArray(data.topScorers) && data.topScorers.length > 0 && (
                <div className="mb-8">
                  <TeamScorersCard scorers={data.topScorers} />
                </div>
              )}
              {data.transfers && (
                <div className="mb-8">
                  <TeamTransfersCard transfers={data.transfers} />
                </div>
              )}

              {/* 9) خزينة ألقاب الكأس — من سجلّنا الحقيقي */}
              {titleEditions.length > 0 && (
                <section className="mb-8">
                  <h2 className="text-lg font-black mb-4 flex items-center gap-2">
                    <Landmark className="h-5 w-5 text-amber-500" />
                    ألقاب النادي في كأس الملك
                    {record?.sinceSeason != null && (
                      <span className="text-xs font-normal text-muted-foreground">
                        ضمن المدى المتاح منذ {kcSeasonLabel(record.sinceSeason)}
                      </span>
                    )}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {titleEditions.map((e) => (
                      <div
                        key={e.season}
                        className="flex items-center gap-3 rounded-2xl border border-amber-300/30 bg-amber-400/5 p-3"
                      >
                        <Trophy className="h-6 w-6 text-amber-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-black">نسخة {kcSeasonLabel(e.season)}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {e.runnerUp ? `على حساب ${e.runnerUp.name}` : ""}
                            {e.score && (
                              <>
                                {" "}
                                <span dir="ltr" className="tabular-nums font-bold">{e.score}</span>
                              </>
                            )}
                            {e.penalties && (
                              <>
                                {" "}(<span dir="ltr" className="tabular-nums">{e.penalties}</span> ر.ت)
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 10) مباريات النادي — الكأس أولًا ثم بطولته */}
              {clubKcFixtures.length > 0 && (
                <section className="mb-8">
                  <h2 className="text-lg font-black mb-4">مباريات النادي في كأس الملك</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {clubKcFixtures.map((fx) => (
                      <KcMatchCard key={fx.id} fixture={fx} onOpen={setOpenFixtureId} />
                    ))}
                  </div>
                </section>
              )}
              {leagueFixtures.length > 0 && (
                <section className="mb-8">
                  <h2 className="text-lg font-black mb-4">
                    مباريات النادي{data.competitionName ? ` في ${data.competitionName}` : ""}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {leagueFixtures.map((fx) => (
                      <KcMatchCard key={fx.id} fixture={fx} onOpen={setOpenFixtureId} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          </>
        )}
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
