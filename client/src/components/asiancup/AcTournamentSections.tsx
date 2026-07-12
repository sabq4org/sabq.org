import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Award, Goal, Handshake, Square, Timer, Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatKickoffDay, formatKickoffTime, type AcFixture, type AcTeam } from "./acTypes";

interface AcBracketRound {
  round: string;
  roundEn: string;
  matches: AcFixture[];
}

interface AcBracketResponse {
  source: string;
  rounds: AcBracketRound[];
}

interface AcScorer {
  rank: number;
  id: number;
  name: string;
  photo: string;
  team: AcTeam;
  goals: number;
  assists: number;
  minutes: number;
  matches: number;
}

// لوحة قادة موحّدة (صنّاع الأهداف / البطاقات) — نظير WcLeader على الويب.
interface AcLeader {
  rank: number;
  id: number;
  name: string;
  nameEn: string;
  photo: string;
  team: AcTeam;
  goals: number;
  assists: number;
  yellow: number;
  red: number;
  minutes: number;
  matches: number;
}

const ROUND_HINTS = ["دور الـ16", "ربع النهائي", "نصف النهائي", "النهائي"];

function winnerId(fixture: AcFixture): number | null {
  if (!fixture.status.finished || fixture.goals.home == null || fixture.goals.away == null) return null;
  if (fixture.goals.home > fixture.goals.away) return fixture.home.id;
  if (fixture.goals.away > fixture.goals.home) return fixture.away.id;
  return null;
}

function BracketTeam({ team, score, winner }: { team: AcTeam; score: number | null; winner: boolean }) {
  const resolved = team.id > 0 && Boolean(team.name);
  return (
    <div className={`flex items-center gap-2 py-1 ${winner ? "font-black text-emerald-700 dark:text-emerald-300" : ""}`}>
      {resolved ? (
        <img src={team.logo} alt="" className="h-5 w-5 shrink-0 rounded-full bg-white object-contain p-0.5 ring-1 ring-border" loading="lazy" />
      ) : (
        <span className="h-5 w-5 shrink-0 rounded-full bg-muted" />
      )}
      <span className="min-w-0 flex-1 truncate text-xs">{resolved ? team.name : "يُحدَّد لاحقًا"}</span>
      {score != null && <span className="tabular-nums text-sm font-black">{score}</span>}
    </div>
  );
}

function BracketMatch({
  fixture,
  onOpenMatch,
}: {
  fixture: AcFixture;
  onOpenMatch: (id: number) => void;
}) {
  const started = fixture.status.live || fixture.status.finished;
  const winner = winnerId(fixture);
  return (
    <button
      type="button"
      onClick={() => onOpenMatch(fixture.id)}
      className="relative block w-full rounded-xl border border-border bg-card px-3 py-2 text-right shadow-sm transition-colors hover:border-emerald-500/60"
      data-testid={`ac-tree-match-${fixture.id}`}
    >
      <div className="divide-y divide-border/60">
        <BracketTeam team={fixture.home} score={started ? fixture.goals.home ?? 0 : null} winner={winner === fixture.home.id} />
        <BracketTeam team={fixture.away} score={started ? fixture.goals.away ?? 0 : null} winner={winner === fixture.away.id} />
      </div>
      <p className={`pt-1 text-center text-[10px] ${fixture.status.live ? "font-bold text-red-600" : "text-muted-foreground"}`}>
        {fixture.status.live
          ? `● ${fixture.status.elapsed ?? ""}' مباشر`
          : fixture.status.finished
            ? fixture.status.label
            : `${formatKickoffDay(fixture.date)} · ${formatKickoffTime(fixture.date)}`}
      </p>
    </button>
  );
}

function MobileBracket({
  rounds,
  onOpenMatch,
}: {
  rounds: AcBracketRound[];
  onOpenMatch: (id: number) => void;
}) {
  const liveRound = rounds.find((round) => round.matches.some((fixture) => fixture.status.live));
  const pendingRound = rounds.find((round) => round.matches.some((fixture) => !fixture.status.finished));
  const defaultRound = (liveRound ?? pendingRound ?? rounds[rounds.length - 1])?.roundEn;
  const [selected, setSelected] = useState(defaultRound);

  return (
    <Tabs value={selected} onValueChange={setSelected} dir="rtl" className="md:hidden">
      <TabsList className="mb-4 h-auto w-full justify-start overflow-x-auto">
        {rounds.map((round) => (
          <TabsTrigger key={round.roundEn} value={round.roundEn} className="shrink-0 gap-1.5">
            {round.matches.some((fixture) => fixture.status.live) && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />}
            {round.round}
          </TabsTrigger>
        ))}
      </TabsList>
      {rounds.map((round) => (
        <TabsContent key={round.roundEn} value={round.roundEn} className="mt-0 space-y-2">
          {round.matches.map((fixture) => (
            <BracketMatch key={fixture.id} fixture={fixture} onOpenMatch={onOpenMatch} />
          ))}
        </TabsContent>
      ))}
    </Tabs>
  );
}

function DesktopBracket({
  rounds,
  onOpenMatch,
}: {
  rounds: AcBracketRound[];
  onOpenMatch: (id: number) => void;
}) {
  const maxMatches = Math.max(...rounds.map((round) => round.matches.length), 1);
  return (
    <div className="hidden overflow-x-auto pb-4 md:block" dir="rtl">
      <div className="grid min-w-max grid-flow-col auto-cols-[238px] gap-12 px-2">
        {rounds.map((round, roundIndex) => (
          <section key={round.roundEn} className="relative flex flex-col">
            <h3 className="mb-4 text-center text-sm font-black text-emerald-700 dark:text-emerald-300">
              {round.round}{roundIndex === rounds.length - 1 ? " 🏆" : ""}
            </h3>
            <div
              className="relative flex flex-1 flex-col justify-around gap-3"
              style={{ minHeight: `${Math.max(190, maxMatches * 92)}px` }}
            >
              {round.matches.map((fixture) => (
                <div key={fixture.id} className="relative">
                  <BracketMatch fixture={fixture} onOpenMatch={onOpenMatch} />
                  {roundIndex < rounds.length - 1 && (
                    <span className="pointer-events-none absolute left-[-3rem] top-1/2 h-px w-12 bg-emerald-500/35" aria-hidden="true" />
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function AcKnockoutSection({ onOpenMatch }: { onOpenMatch: (id: number) => void }) {
  const { data, isLoading } = useQuery<AcBracketResponse>({
    queryKey: ["/api/asian-cup/bracket"],
    refetchInterval: (query) =>
      (query.state.data?.rounds ?? []).some((round) => round.matches.some((fixture) => fixture.status.live))
        ? 8_000
        : 5 * 60_000,
  });
  const rounds = Array.isArray(data?.rounds) ? data.rounds.filter((round) => Array.isArray(round.matches)) : [];

  return (
    <section id="ac-knockout" className="scroll-mt-20 py-10" dir="rtl">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-emerald-500/10 p-2"><Trophy className="h-6 w-6 text-emerald-600" /></div>
          <div>
            <h2 className="text-2xl font-bold">الأدوار الإقصائية</h2>
            <p className="text-sm text-muted-foreground">شجرة البطولة من دور الـ16 حتى النهائي — تتحدث لحظة بلحظة</p>
          </div>
        </div>
        {isLoading ? (
          <Skeleton className="h-[360px] rounded-2xl" />
        ) : rounds.length === 0 || rounds.every((round) => round.matches.length === 0) ? (
          <div className="rounded-2xl border border-dashed bg-muted/30 p-7 text-center">
            <div className="mb-4 flex flex-wrap justify-center gap-2">
              {ROUND_HINTS.map((round) => <span key={round} className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700">{round}</span>)}
            </div>
            <p className="text-sm text-muted-foreground">تظهر المواجهات داخل الشجرة فور اكتمال دور المجموعات واعتماد المتأهلين.</p>
          </div>
        ) : (
          <>
            <MobileBracket rounds={rounds} onOpenMatch={onOpenMatch} />
            <DesktopBracket rounds={rounds} onOpenMatch={onOpenMatch} />
          </>
        )}
      </div>
    </section>
  );
}

type RaceMode = "goals" | "assists";

function sortedLeaders(scorers: AcScorer[], mode: RaceMode): AcScorer[] {
  return [...scorers].sort((a, b) =>
    (mode === "goals" ? b.goals - a.goals : b.assists - a.assists) ||
    (mode === "goals" ? b.assists - a.assists : b.goals - a.goals) ||
    a.minutes - b.minutes,
  );
}

function Podium({
  leaders,
  mode,
  onOpenPlayer,
}: {
  leaders: AcScorer[];
  mode: RaceMode;
  onOpenPlayer?: (id: number) => void;
}) {
  const ordered = [leaders[1], leaders[0], leaders[2]].filter(Boolean);
  return (
    <div className="mx-auto mb-7 grid max-w-xl grid-cols-3 items-start gap-2 sm:gap-4">
      {ordered.map((player) => {
        const rank = leaders.indexOf(player) + 1;
        const first = rank === 1;
        const value = mode === "goals" ? player.goals : player.assists;
        const body = (
          <>
            <div className={`relative overflow-hidden rounded-full bg-muted ring-4 ${rank === 1 ? "h-24 w-24 ring-amber-400" : rank === 2 ? "h-[72px] w-[72px] ring-zinc-300" : "h-[72px] w-[72px] ring-orange-700/70"}`}>
              {player.photo ? <img src={player.photo} alt={player.name} className="h-full w-full object-cover" loading="lazy" /> : <span className="grid h-full place-items-center font-black">{player.name.slice(0, 2)}</span>}
            </div>
            <b className="line-clamp-1 text-sm sm:text-base">{player.name}</b>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><img src={player.team.logo} alt="" className="h-4 w-4 object-contain" />{player.team.name}</span>
            <span className={`font-black tabular-nums ${first ? "text-3xl text-amber-500" : "text-2xl"}`}>{value}</span>
          </>
        );
        const className = `flex flex-col items-center gap-2 rounded-2xl p-2 text-center hover-elevate ${first ? "" : "mt-7"}`;
        if (onOpenPlayer && player.id > 0) {
          return (
            <button key={`${mode}-${player.id}`} type="button" onClick={() => onOpenPlayer(player.id)} className={className}>
              {body}
            </button>
          );
        }
        return (
          <Link key={`${mode}-${player.id}`} href={`/asian-cup/player/${player.id}`} className={className}>
            {body}
          </Link>
        );
      })}
    </div>
  );
}

function RaceList({
  leaders,
  mode,
  onOpenPlayer,
}: {
  leaders: AcScorer[];
  mode: RaceMode;
  onOpenPlayer?: (id: number) => void;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-1.5">
      {leaders.map((player, index) => {
        const inner = (
          <>
            <span className="w-5 text-center text-sm tabular-nums text-muted-foreground">{index + 1}</span>
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">{player.photo && <img src={player.photo} alt="" className="h-full w-full object-cover" loading="lazy" />}</div>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{player.name}</p><p className="flex items-center gap-1 text-[11px] text-muted-foreground"><img src={player.team.logo} alt="" className="h-3.5 w-3.5 object-contain" />{player.team.name}</p></div>
            <div className="text-left"><b className="text-xl tabular-nums text-emerald-700">{mode === "goals" ? player.goals : player.assists}</b><p className="text-[10px] text-muted-foreground">{mode === "goals" ? `${player.assists} صناعة` : `${player.goals} أهداف`}</p></div>
          </>
        );
        const className = "flex w-full items-center gap-3 rounded-xl bg-card px-3.5 py-2.5 hover-elevate text-right";
        if (onOpenPlayer && player.id > 0) {
          return (
            <button key={`${mode}-${player.id}-${index}`} type="button" onClick={() => onOpenPlayer(player.id)} className={className}>
              {inner}
            </button>
          );
        }
        return (
          <Link key={`${mode}-${player.id}-${index}`} href={`/asian-cup/player/${player.id}`} className={className}>
            {inner}
          </Link>
        );
      })}
    </div>
  );
}

function LeaderRow({
  leader,
  end,
  onOpenPlayer,
}: {
  leader: AcLeader;
  end: React.ReactNode;
  onOpenPlayer?: (id: number) => void;
}) {
  const clickable = leader.id > 0;
  const inner = (
    <>
      <span className="w-5 text-center text-sm tabular-nums text-muted-foreground">{leader.rank}</span>
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">{leader.photo && <img src={leader.photo} alt="" className="h-full w-full object-cover" loading="lazy" />}</div>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{leader.name}</p><p className="flex items-center gap-1 text-[11px] text-muted-foreground"><img src={leader.team.logo} alt="" className="h-3.5 w-3.5 object-contain" />{leader.team.name}</p></div>
      <div className="flex items-center gap-4 shrink-0 text-xs text-muted-foreground">
        {leader.minutes > 0 && <span className="hidden items-center gap-1 sm:flex"><Timer className="h-3 w-3" />{leader.minutes} د</span>}
        {end}
      </div>
    </>
  );
  if (!clickable) {
    return <div className="flex items-center gap-3 rounded-xl bg-card px-3.5 py-2.5">{inner}</div>;
  }
  if (onOpenPlayer) {
    return (
      <button type="button" onClick={() => onOpenPlayer(leader.id)} className="flex w-full items-center gap-3 rounded-xl bg-card px-3.5 py-2.5 hover-elevate text-right">
        {inner}
      </button>
    );
  }
  return (
    <Link href={`/asian-cup/player/${leader.id}`} className="flex items-center gap-3 rounded-xl bg-card px-3.5 py-2.5 hover-elevate">
      {inner}
    </Link>
  );
}

function LeadersList({
  endpoint,
  emptyMessage,
  render,
  onOpenPlayer,
}: {
  endpoint: string;
  emptyMessage: string;
  render: (leader: AcLeader) => React.ReactNode;
  onOpenPlayer?: (id: number) => void;
}) {
  const { data, isLoading } = useQuery<{ leaders: AcLeader[] }>({ queryKey: [endpoint], staleTime: 10 * 60_000 });
  const leaders = Array.isArray(data?.leaders) ? data.leaders : [];
  if (isLoading) return <div className="mx-auto max-w-2xl space-y-1.5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>;
  if (leaders.length === 0) return <div className="rounded-2xl border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">{emptyMessage}</div>;
  return <div className="mx-auto max-w-2xl space-y-1.5">{leaders.map((leader) => <LeaderRow key={`${leader.rank}-${leader.name}`} leader={leader} end={render(leader)} onOpenPlayer={onOpenPlayer} />)}</div>;
}

export function AcTournamentRaces({
  tournamentStarted,
  onOpenPlayer,
}: {
  tournamentStarted: boolean;
  onOpenPlayer?: (id: number) => void;
}) {
  const { data, isLoading } = useQuery<{ scorers: AcScorer[] }>({ queryKey: ["/api/asian-cup/scorers"], staleTime: 10 * 60_000 });
  const scorers = Array.isArray(data?.scorers) ? data.scorers : [];
  const goals = useMemo(() => sortedLeaders(scorers, "goals"), [scorers]);

  const goalsContent = () => {
    if (isLoading) return <div className="mx-auto grid max-w-xl grid-cols-3 gap-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}</div>;
    if (goals.length === 0) return <div className="rounded-2xl border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">{tournamentStarted ? "يظهر الترتيب فور اعتماد المزود لإحصاءات المباريات." : "سباق الهدافين ينطلق مع أول صافرة."}</div>;
    return (
      <>
        {goals.length >= 3 && <Podium leaders={goals.slice(0, 3)} mode="goals" onOpenPlayer={onOpenPlayer} />}
        <RaceList leaders={goals.length >= 3 ? goals.slice(3) : goals} mode="goals" onOpenPlayer={onOpenPlayer} />
      </>
    );
  };

  const pending = "انطلقت البطولة — الترتيب يظهر فور اعتماد المزود لإحصاءات المباريات";

  return (
    <section id="ac-races" className="scroll-mt-20 py-10" dir="rtl">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3"><div className="rounded-lg bg-amber-500/10 p-2"><Award className="h-6 w-6 text-amber-500" /></div><div><h2 className="text-2xl font-bold">سباقات البطولة</h2><p className="text-sm text-muted-foreground">الهدافون، صنّاع الأهداف، والبطاقات في مركز واحد</p></div></div>
        <Tabs defaultValue="goals" dir="rtl">
          <TabsList className="mb-5">
            <TabsTrigger value="goals" className="gap-1.5"><Goal className="h-4 w-4" />الهدافون</TabsTrigger>
            <TabsTrigger value="assists" className="gap-1.5"><Handshake className="h-4 w-4" />صنّاع الأهداف</TabsTrigger>
            <TabsTrigger value="cards" className="gap-1.5"><Square className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />البطاقات</TabsTrigger>
          </TabsList>
          <TabsContent value="goals">{goalsContent()}</TabsContent>
          <TabsContent value="assists">
            <LeadersList
              endpoint="/api/asian-cup/assists"
              emptyMessage={tournamentStarted ? pending : "سباق صنّاع الأهداف ينطلق مع أول صناعة"}
              onOpenPlayer={onOpenPlayer}
              render={(leader) => (
                <>
                  <span className="hidden sm:inline">{leader.goals} أهداف</span>
                  <span className="text-lg font-black tabular-nums text-foreground">{leader.assists}</span>
                </>
              )}
            />
          </TabsContent>
          <TabsContent value="cards">
            <LeadersList
              endpoint="/api/asian-cup/cards"
              emptyMessage={tournamentStarted ? "البطاقات تُعتمد بعد المباريات بقليل — وعسى ألا تكثر" : "لا بطاقات بعد — وعسى ألا تكثر"}
              onOpenPlayer={onOpenPlayer}
              render={(leader) => (
                <span className="flex items-center gap-2">
                  <span className="flex items-center gap-1 font-black tabular-nums"><Square className="h-3 w-3 fill-yellow-400 text-yellow-400" />{leader.yellow}</span>
                  <span className="flex items-center gap-1 font-black tabular-nums"><Square className="h-3 w-3 fill-red-500 text-red-500" />{leader.red}</span>
                </span>
              )}
            />
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
