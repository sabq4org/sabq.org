/**
 * صفحة النادي — /sports2/team/:id
 *
 * تستهلك /api/sports/team/:id (هوية النادي + صفّه في الترتيب + مبارياته + تشكيلته).
 * تتدهور بسلاسة: 404 → حالة «غير متاح» مع رجوع للبوابة. كل البيانات معرَّبة من الخدمة.
 */
import { useEffect } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  ListOrdered,
  MapPin,
  Shield,
  Users,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface SpTeam { id: number; name: string; logo: string; winner: boolean | null; }
interface SpFixture {
  id: number; date: string; timestamp: number;
  status: { code: string; label: string; elapsed: number | null; live: boolean; finished: boolean };
  round: string; venue: { name: string; city: string };
  home: SpTeam; away: SpTeam; goals: { home: number | null; away: number | null };
}
interface SpStandingRow {
  rank: number; team: SpTeam; played: number; win: number; draw: number; lose: number;
  goalsFor: number; goalsAgainst: number; goalsDiff: number; points: number; form: string | null;
}
interface SpSquadPlayer {
  id: number; name: string; number: number | null; position: string; positionEn: string; age: number | null; photo: string;
}
interface SpTeamInfo {
  id: number; name: string; logo: string; country: string | null; founded: number | null;
  venue: { name: string; city: string; capacity: number | null; image: string } | null;
}
interface SpTeamProfile {
  team: SpTeamInfo;
  standing: SpStandingRow | null;
  competitionSlug: string | null;
  competitionName: string | null;
  fixtures: SpFixture[];
  squad: SpSquadPlayer[];
}

const dayFmt = new Intl.DateTimeFormat("ar-SA", { weekday: "short", day: "numeric", month: "short" });
const fmtDay = (ts: number) => dayFmt.format(new Date(ts * 1000));

const POSITION_SECTIONS: { en: string; label: string }[] = [
  { en: "Goalkeeper", label: "حراسة المرمى" },
  { en: "Defender", label: "الدفاع" },
  { en: "Midfielder", label: "الوسط" },
  { en: "Attacker", label: "الهجوم" },
];

function FixtureRow({ fx, teamId }: { fx: SpFixture; teamId: number }) {
  const isHome = fx.home.id === teamId;
  const me = isHome ? fx.home : fx.away;
  const opp = isHome ? fx.away : fx.home;
  const myGoals = isHome ? fx.goals.home : fx.goals.away;
  const oppGoals = isHome ? fx.goals.away : fx.goals.home;
  const result =
    fx.status.finished && myGoals != null && oppGoals != null
      ? myGoals > oppGoals ? "win" : myGoals < oppGoals ? "lose" : "draw"
      : null;
  const dot =
    result === "win" ? "bg-emerald-500" : result === "lose" ? "bg-red-500" : result === "draw" ? "bg-amber-500" : "bg-muted-foreground/40";

  return (
    <div className="flex items-center gap-3 py-2.5 px-3">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      <span className="text-[11px] text-muted-foreground w-16 shrink-0">{fmtDay(fx.timestamp)}</span>
      <span className="text-xs text-muted-foreground shrink-0">{isHome ? "ضد" : "على"}</span>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {opp.logo && <img src={opp.logo} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />}
        <span className="text-sm font-semibold truncate">{opp.name}</span>
      </div>
      {fx.status.finished && myGoals != null && oppGoals != null ? (
        <span className="text-sm font-black tabular-nums" dir="ltr">{myGoals} - {oppGoals}</span>
      ) : fx.status.live ? (
        <Badge className="bg-red-500 text-white text-[10px]">مباشر</Badge>
      ) : (
        <span className="text-[11px] text-muted-foreground tabular-nums">قادمة</span>
      )}
    </div>
  );
}

export default function SportsTeam() {
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const { data, isLoading, isError } = useQuery<SpTeamProfile>({
    queryKey: [`/api/sports/team/${id}`],
    enabled: Number.isFinite(id) && id > 0,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    document.title = data?.team?.name ? `${data.team.name} | الرياضة - سبق` : "النادي | الرياضة - سبق";
  }, [data?.team?.name]);
  useCanonical(`https://sabq.org/sports2/team/${id}`);

  const notFound = isError || (!isLoading && !data);

  const finished = (data?.fixtures ?? []).filter((f) => f.status.finished);
  const results = finished.slice(-6).reverse();
  const upcoming = (data?.fixtures ?? []).filter((f) => !f.status.finished).slice(0, 6);

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        <Link href="/sports2" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5">
          <ArrowRight className="w-4 h-4" /> البوابة الرياضية
        </Link>

        {isLoading ? (
          <div className="space-y-5">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
        ) : notFound ? (
          <Card className="p-10 text-center">
            <Shield className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-bold text-foreground">صفحة النادي غير متاحة حاليًا</p>
            <p className="text-sm text-muted-foreground mt-1">قد لا يكون النادي ضمن البطولات المتاحة، أو تعذّر جلب بياناته.</p>
            <Link href="/sports2" className="inline-block mt-4 text-sm text-primary font-semibold">العودة للبوابة الرياضية</Link>
          </Card>
        ) : data ? (
          <div className="space-y-6">
            {/* هوية النادي */}
            <Card className="p-6">
              <div className="flex items-center gap-5 flex-wrap">
                {data.team.logo && <img src={data.team.logo} alt={data.team.name} className="w-20 h-20 object-contain" />}
                <div className="min-w-0">
                  <h1 className="text-2xl sm:text-3xl font-black text-foreground">{data.team.name}</h1>
                  <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                    {data.competitionName && <span>{data.competitionName}</span>}
                    {data.team.founded && <span>تأسّس {data.team.founded}</span>}
                    {data.team.venue?.name && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" /> {data.team.venue.name}
                        {data.team.venue.city ? ` — ${data.team.venue.city}` : ""}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {data.standing && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5 pt-5 border-t border-border">
                  <div className="text-center">
                    <div className="text-2xl font-black text-primary tabular-nums">{data.standing.rank}</div>
                    <div className="text-[11px] text-muted-foreground">المركز</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-black tabular-nums">{data.standing.points}</div>
                    <div className="text-[11px] text-muted-foreground">نقطة</div>
                  </div>
                  <div className="text-center">
                    <div className="text-base font-bold tabular-nums" dir="ltr">{data.standing.win}-{data.standing.draw}-{data.standing.lose}</div>
                    <div className="text-[11px] text-muted-foreground">فوز-تعادل-خسارة</div>
                  </div>
                  <div className="text-center">
                    <div className="text-base font-bold tabular-nums">{data.standing.goalsFor}:{data.standing.goalsAgainst}</div>
                    <div className="text-[11px] text-muted-foreground">له : عليه</div>
                  </div>
                  <div className="text-center">
                    <div className="text-base font-bold tabular-nums" dir="ltr">
                      {data.standing.goalsDiff > 0 ? `+${data.standing.goalsDiff}` : data.standing.goalsDiff}
                    </div>
                    <div className="text-[11px] text-muted-foreground">الفارق</div>
                  </div>
                </div>
              )}
            </Card>

            {/* المباريات */}
            {(results.length > 0 || upcoming.length > 0) && (
              <div className="grid lg:grid-cols-2 gap-5">
                {results.length > 0 && (
                  <Card className="overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                      <CalendarDays className="w-4 h-4 text-primary" />
                      <h2 className="font-bold text-sm">أحدث النتائج</h2>
                    </div>
                    <div className="divide-y divide-border">
                      {results.map((fx) => <FixtureRow key={fx.id} fx={fx} teamId={data.team.id} />)}
                    </div>
                  </Card>
                )}
                {upcoming.length > 0 && (
                  <Card className="overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                      <CalendarDays className="w-4 h-4 text-primary" />
                      <h2 className="font-bold text-sm">المباريات القادمة</h2>
                    </div>
                    <div className="divide-y divide-border">
                      {upcoming.map((fx) => <FixtureRow key={fx.id} fx={fx} teamId={data.team.id} />)}
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* التشكيلة */}
            {data.squad.length > 0 && (
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-5">
                  <Users className="w-5 h-5 text-primary" />
                  <h2 className="font-bold text-lg">التشكيلة</h2>
                  <Badge variant="secondary" className="tabular-nums">{data.squad.length}</Badge>
                </div>
                <div className="space-y-6">
                  {POSITION_SECTIONS.map((sec) => {
                    const players = data.squad.filter((p) => p.positionEn === sec.en);
                    if (players.length === 0) return null;
                    return (
                      <div key={sec.en}>
                        <h3 className="text-sm font-bold text-muted-foreground mb-3 flex items-center gap-2">
                          <ListOrdered className="w-3.5 h-3.5" /> {sec.label}
                          <span className="text-[11px] font-normal">({players.length})</span>
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                          {players.map((pl) => (
                            <Link
                              key={pl.id}
                              href={`/sports2/player/${pl.id}`}
                              className="flex items-center gap-3 p-2.5 rounded-xl border border-border hover:bg-muted/50 transition-colors"
                            >
                              {pl.photo ? (
                                <img src={pl.photo} alt="" className="w-11 h-11 rounded-full object-cover bg-muted shrink-0" loading="lazy" />
                              ) : (
                                <span className="w-11 h-11 rounded-full bg-muted shrink-0" />
                              )}
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-foreground truncate">{pl.name}</div>
                                <div className="text-[11px] text-muted-foreground">
                                  {pl.number != null ? `#${pl.number}` : ""}{pl.age != null ? ` • ${pl.age} سنة` : ""}
                                </div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        ) : null}
      </main>
      <Footer />
    </div>
  );
}
