import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight, CalendarRange, ListOrdered, Users, UserCog } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MatchCard } from "@/components/worldcup/MatchCard";
import { MatchCenterDialog } from "@/components/worldcup/MatchCenterDialog";
import { PlayerCardDialog } from "@/components/worldcup/PlayerCardDialog";
import type {
  WcFixture,
  WcSquadPlayer,
  WcStandingRow,
  WcTeamProfile,
} from "@/components/worldcup/wcTypes";

const POSITION_SECTIONS = [
  { en: "Goalkeeper", label: "حراسة المرمى" },
  { en: "Defender", label: "الدفاع" },
  { en: "Midfielder", label: "الوسط" },
  { en: "Attacker", label: "الهجوم" },
];

/** صف ترتيب داخل مجموعة المنتخب — صفّه مُظلّل، والبقية روابط لصفحاتهم */
function GroupRow({ row, currentTeamId }: { row: WcStandingRow; currentTeamId: number }) {
  const isCurrent = row.team.id === currentTeamId;
  const qualifying =
    row.rank <= 2
      ? "border-r-2 border-emerald-500"
      : row.rank === 3
        ? "border-r-2 border-amber-500"
        : "border-r-2 border-transparent";
  const inner = (
    <>
      <span className="text-center text-xs text-muted-foreground tabular-nums">{row.rank}</span>
      <div className="flex items-center gap-2 min-w-0">
        <img src={row.team.logo} alt={row.team.name} className="h-[18px] w-[18px] object-contain shrink-0" loading="lazy" />
        <span className={`truncate ${isCurrent ? "font-black" : "font-semibold"}`}>{row.team.name}</span>
      </div>
      <span className="text-center text-xs text-muted-foreground tabular-nums">{row.played}</span>
      <span className="text-center text-xs text-muted-foreground tabular-nums" dir="ltr">
        {row.goalsDiff > 0 ? `+${row.goalsDiff}` : row.goalsDiff}
      </span>
      <span className="text-center font-black tabular-nums">{row.points}</span>
    </>
  );
  const className = `grid grid-cols-[1.25rem_1fr_2rem_2.5rem_2rem] items-center gap-1 rounded-md px-2 py-2 text-sm ${qualifying} ${
    isCurrent ? "bg-emerald-500/[0.12]" : ""
  }`;
  if (isCurrent) {
    return <div className={className}>{inner}</div>;
  }
  return (
    <Link href={`/world-cup/team/${row.team.id}`} className={`${className} hover-elevate active-elevate-2 transition-all`}>
      {inner}
    </Link>
  );
}

/** مجموعة من المباريات تحت عنوان (مباشر / قادمة / منتهية) */
function MatchGroup({
  label,
  fixtures,
  onOpenMatch,
}: {
  label: string;
  fixtures: WcFixture[];
  onOpenMatch: (id: number) => void;
}) {
  if (fixtures.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <h3 className="text-sm font-bold">{label}</h3>
        <span className="text-xs text-muted-foreground">({fixtures.length})</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {fixtures.map((fixture, index) => (
          <motion.div
            key={fixture.id}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ delay: Math.min(index * 0.05, 0.3), duration: 0.3 }}
          >
            <MatchCard fixture={fixture} onOpen={onOpenMatch} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function SquadPlayerButton({
  player,
  onOpenPlayer,
}: {
  player: WcSquadPlayer;
  onOpenPlayer: (id: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => player.id > 0 && onOpenPlayer(player.id)}
      disabled={player.id <= 0}
      className="flex items-center gap-2.5 rounded-lg bg-muted/40 px-2.5 py-1.5 text-right hover-elevate active-elevate-2 transition-all disabled:cursor-default"
      data-testid={`wc-player-${player.id}`}
    >
      <div className="h-9 w-9 rounded-full overflow-hidden bg-muted shrink-0">
        {player.photo && (
          <img src={player.photo} alt={player.name} className="h-full w-full object-cover" loading="lazy" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold truncate">{player.name}</p>
        {player.age != null && <p className="text-[10px] text-muted-foreground">{player.age} سنة</p>}
      </div>
      <span className="text-sm font-black text-muted-foreground tabular-nums shrink-0">
        {player.number ?? "—"}
      </span>
    </button>
  );
}

export default function WorldCupTeam() {
  const { user } = useAuth();
  const params = useParams<{ teamId: string }>();
  const teamId = parseInt(params.teamId ?? "", 10);
  const validId = Number.isFinite(teamId) && teamId > 0;

  const [openFixtureId, setOpenFixtureId] = useState<number | null>(null);
  const [openPlayerId, setOpenPlayerId] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery<WcTeamProfile>({
    queryKey: [`/api/world-cup/team/${teamId}`],
    enabled: validId,
    staleTime: 60 * 1000,
    refetchInterval: (query) =>
      (query.state.data?.fixtures ?? []).some((f) => f.status.live) ? 30_000 : false,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    document.title = data?.team
      ? `${data.team.name} — مونديال 2026 | سبق`
      : "المنتخب — مونديال 2026 | سبق";
  }, [data?.team]);

  const fixtures = Array.isArray(data?.fixtures) ? data.fixtures : [];
  const live = fixtures.filter((f) => f.status.live);
  const upcoming = fixtures.filter((f) => !f.status.live && !f.status.finished);
  const finished = fixtures.filter((f) => f.status.finished).slice().reverse();
  const squad = Array.isArray(data?.squad) ? data.squad : [];

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />
      <NavigationBar />

      <main className="flex-1">
        {/* الترويسة */}
        <section className="relative overflow-hidden bg-gradient-to-b from-emerald-600 to-emerald-700 text-white">
          <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Link
              href="/world-cup"
              className="inline-flex items-center gap-1.5 text-sm text-emerald-50/90 hover:text-white transition-colors mb-6"
            >
              <ArrowRight className="h-4 w-4" />
              مونديال 2026
            </Link>

            {isLoading ? (
              <div className="flex items-center gap-5">
                <Skeleton className="h-24 w-24 rounded-full bg-white/20" />
                <div className="space-y-3">
                  <Skeleton className="h-8 w-48 bg-white/20" />
                  <Skeleton className="h-5 w-32 bg-white/20" />
                </div>
              </div>
            ) : data?.team ? (
              <div className="flex items-center gap-5">
                <div className="h-24 w-24 shrink-0 rounded-full bg-white ring-4 ring-white/30 p-2">
                  <img src={data.team.logo} alt={data.team.name} className="h-full w-full object-contain" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-3xl sm:text-4xl font-black leading-tight">{data.team.name}</h1>
                    {data.isSaudi && (
                      <Badge className="bg-white text-emerald-700 border-0 font-bold">الأخضر</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap mt-2 text-sm text-emerald-50/90">
                    {data.group && (
                      <span className="inline-flex items-center gap-1.5">
                        <ListOrdered className="h-4 w-4" />
                        {data.group.group}
                      </span>
                    )}
                    {data.coach && (
                      <span className="inline-flex items-center gap-1.5">
                        <UserCog className="h-4 w-4" />
                        المدرّب: {data.coach}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-6">
                <h1 className="text-2xl font-black mb-1">المنتخب غير موجود</h1>
                <p className="text-emerald-50/90 text-sm">
                  {validId
                    ? "تعذّر العثور على بيانات هذا المنتخب — قد تكون التغطية غير مفعّلة بعد."
                    : "معرّف منتخب غير صالح."}
                </p>
              </div>
            )}
          </div>
        </section>

        {!isLoading && !isError && data?.team && (
          <>
            {/* ترتيب المجموعة */}
            {data.group && data.group.rows.length > 0 && (
              <section className="py-8 border-b border-border/60">
                <div className="container max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-emerald-500/10">
                      <ListOrdered className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <h2 className="text-xl font-bold">{data.group.group}</h2>
                  </div>
                  <Card className="border-0 dark:border dark:border-card-border">
                    <CardContent className="p-4">
                      <div className="grid grid-cols-[1.25rem_1fr_2rem_2.5rem_2rem] gap-1 mb-2 px-2 text-[10px] text-muted-foreground">
                        <span className="text-center">#</span>
                        <span>المنتخب</span>
                        <span className="text-center">لعب</span>
                        <span className="text-center">فارق</span>
                        <span className="text-center">نقاط</span>
                      </div>
                      <div className="space-y-1">
                        {data.group.rows.map((row) => (
                          <GroupRow key={row.team.id} row={row} currentTeamId={data.team.id} />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </section>
            )}

            {/* المباريات */}
            <section className="py-10">
              <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg bg-emerald-500/10">
                    <CalendarRange className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">مباريات {data.team.name}</h2>
                    <p className="text-sm text-muted-foreground">بتوقيت الرياض — اضغط أي مباراة لمركزها</p>
                  </div>
                </div>

                {fixtures.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-10">
                    لا توجد مباريات معلنة لهذا المنتخب بعد
                  </p>
                ) : (
                  <div className="space-y-8">
                    <MatchGroup label="مباشر الآن" fixtures={live} onOpenMatch={setOpenFixtureId} />
                    <MatchGroup label="المباريات القادمة" fixtures={upcoming} onOpenMatch={setOpenFixtureId} />
                    <MatchGroup label="النتائج" fixtures={finished} onOpenMatch={setOpenFixtureId} />
                  </div>
                )}
              </div>
            </section>

            {/* القائمة */}
            <section className="py-10 bg-muted/30">
              <div className="container max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg bg-emerald-500/10">
                    <Users className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">القائمة</h2>
                    <p className="text-sm text-muted-foreground">اضغط على أي لاعب لعرض بطاقته الكاملة</p>
                  </div>
                </div>

                {squad.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-10">
                    القائمة الرسمية لم تُعلن بعد
                  </p>
                ) : (
                  <div className="space-y-6">
                    {POSITION_SECTIONS.map((section) => {
                      const players = squad.filter((p) => p.positionEn === section.en);
                      if (players.length === 0) return null;
                      return (
                        <div key={section.en}>
                          <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mb-2">
                            {section.label}
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                            {players.map((player) => (
                              <SquadPlayerButton
                                key={player.id || `${player.name}-${player.number}`}
                                player={player}
                                onOpenPlayer={setOpenPlayerId}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
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
