/**
 * الأدوار الإقصائية لكأس الملك — نفس لغة شجرة المونديال (KnockoutBracket):
 * ترويسة بأيقونة، تبويبات حسب الدور على الجوال، وأعمدة أدوار قابلة للسحب على
 * سطح المكتب ببطاقات مدمجة (صفّا فريقين + ترجيح + دقيقة حية) — الدور النشط
 * افتراضيًّا حيث «الحدث» الآن.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { CheckCircle2, Trophy } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LiveMinute } from "../worldcup/LiveMinute";
import { PenaltyResult } from "../worldcup/PenaltyResult";
import { kcWinnerSide } from "./KcMatchCard";
import {
  formatKickoffDay,
  formatKickoffTime,
  type KcBracket as KcBracketData,
  type KcBracketRound,
  type KcFixture,
  type KcTeam,
} from "./kcTypes";

function TeamLine({ team, goals, winner }: { team: KcTeam; goals: number | null; winner: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <Link
        href={`/kings-cup/team/${team.id}`}
        onClick={(e) => e.stopPropagation()}
        className="flex items-center gap-2 min-w-0 rounded transition-colors hover:text-emerald-600 dark:hover:text-emerald-400"
      >
        <span className="h-[18px] w-[18px] shrink-0 rounded-full bg-white ring-1 ring-border p-px">
          <img src={team.logo} alt={team.name} className="h-full w-full object-contain" loading="lazy" />
        </span>
        <span className={`truncate text-xs ${winner ? "font-extrabold" : "font-semibold"}`}>{team.name}</span>
      </Link>
      {goals != null && (
        <span
          className={`text-sm tabular-nums ${winner ? "font-black text-emerald-600 dark:text-emerald-400" : "font-bold text-muted-foreground"}`}
        >
          {goals}
        </span>
      )}
    </div>
  );
}

function BracketMatch({ fixture, onOpen }: { fixture: KcFixture; onOpen: (id: number) => void }) {
  const started = fixture.status.live || fixture.status.finished;
  const winSide = kcWinnerSide(fixture);
  return (
    <div
      onClick={() => onOpen(fixture.id)}
      className="cursor-pointer rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-sm transition-colors hover:border-emerald-500/60"
      data-testid={`kc-bracket-match-${fixture.id}`}
    >
      <div className="divide-y divide-border/50">
        <TeamLine team={fixture.home} goals={started ? fixture.goals.home ?? 0 : null} winner={winSide === "home"} />
        <TeamLine team={fixture.away} goals={started ? fixture.goals.away ?? 0 : null} winner={winSide === "away"} />
      </div>
      <PenaltyResult fixture={fixture} className="pt-1 text-center text-[9.5px] text-muted-foreground" />
      {fixture.status.live ? (
        <p className="pt-1 text-center text-[10px] font-bold text-red-600 dark:text-red-400">
          ● <LiveMinute status={fixture.status} /> مباشر
        </p>
      ) : !started && fixture.timestamp > 0 ? (
        <p className="pt-1 text-center text-[10px] text-muted-foreground">
          {formatKickoffDay(fixture.date)} · {formatKickoffTime(fixture.date)}
        </p>
      ) : null}
    </div>
  );
}

/** اسم الدور التالي بالاصطلاح المعرّب (دور الـ32 → دور الـ16 → ربع النهائي…) */
function nextRoundLabel(round: string): string {
  const m = round.match(/دور الـ(\d+)/);
  if (m) {
    const half = Number(m[1]) / 2;
    if (half === 8) return "ربع النهائي";
    if (half === 4) return "نصف النهائي";
    if (half <= 2) return "النهائي";
    return `دور الـ${half}`;
  }
  if (round.includes("ربع")) return "نصف النهائي";
  if (round.includes("نصف")) return "النهائي";
  return "الدور التالي";
}

/**
 * «المتأهّلون للدور التالي» — يظهر بين اكتمال أول مباريات الدور الوحيد المتاح
 * واعتماد المزوّد لمواجهات الدور اللاحق (حينها تتحوّل الشجرة لأعمدة الأدوار).
 * نفس نمط «المتأهّلون حتى الآن» في شجرة المونديال.
 */
function QualifiedSoFar({
  round,
  onOpenMatch,
}: {
  round: KcBracketRound;
  onOpenMatch: (id: number) => void;
}) {
  // النتيجة بترتيب «الفائز أولًا» (W-L) — الاتفاقية الموحّدة فلا تنقلب في RTL
  const decided = round.matches
    .filter((m) => m.status.finished)
    .map((m) => {
      const side = kcWinnerSide(m);
      if (!side) return null;
      const team = side === "home" ? m.home : m.away;
      const win = side === "home" ? m.goals.home ?? 0 : m.goals.away ?? 0;
      const lose = side === "home" ? m.goals.away ?? 0 : m.goals.home ?? 0;
      const pen = m.penalties;
      const byPenalties = pen != null && pen.home != null && pen.away != null && pen.home !== pen.away;
      return { match: m, team, score: `${win}-${lose}`, byPenalties };
    })
    .filter(
      (x): x is { match: KcFixture; team: KcTeam; score: string; byPenalties: boolean } => x != null,
    );

  if (decided.length === 0) return null;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3.5 py-1.5 text-sm font-bold text-emerald-700 dark:text-emerald-300">
          <Trophy className="h-4 w-4" />
          المتأهّلون إلى {nextRoundLabel(round.round)}
          <span className="grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-emerald-600 px-1.5 text-[11px] font-black text-white tabular-nums">
            {decided.length}
          </span>
        </span>
        <span className="text-[11px] font-semibold text-muted-foreground">
          من {round.round} ({round.matches.length} {round.matches.length === 2 ? "مباراتين" : "مباراة"})
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {decided.map(({ match, team, score, byPenalties }) => (
          <button
            key={match.id}
            type="button"
            onClick={() => onOpenMatch(match.id)}
            className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-right transition-all hover-elevate active-elevate-2"
            data-testid={`kc-qualified-${team.id}`}
          >
            <span className="h-8 w-8 shrink-0 rounded-full bg-white p-0.5 ring-1 ring-border">
              <img src={team.logo} alt={team.name} className="h-full w-full object-contain" loading="lazy" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold">{team.name}</span>
              <span className="block text-[10px] text-muted-foreground">
                فاز <span dir="ltr" className="tabular-nums">{score}</span>
                {byPenalties && " بركلات الترجيح"}
              </span>
            </span>
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          </button>
        ))}
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        تُستكمل شجرة الأدوار هنا تلقائيًّا فور اعتماد مواجهات {nextRoundLabel(round.round)}.
      </p>
    </div>
  );
}

/** الدور النشط افتراضيًّا: مباراة جارية، وإلا أبكر دور لم يكتمل، وإلا آخر دور. */
function defaultRound(rounds: KcBracketRound[]): string | undefined {
  const live = rounds.find((r) => r.matches.some((m) => m.status.live));
  if (live) return live.round;
  const upcoming = rounds.find((r) => r.matches.some((m) => !m.status.finished));
  if (upcoming) return upcoming.round;
  return rounds[rounds.length - 1]?.round ?? rounds[0]?.round;
}

export function KcBracket({ onOpenMatch }: { onOpenMatch: (id: number) => void }) {
  const { data, isLoading } = useQuery<KcBracketData>({
    queryKey: ["/api/kings-cup/bracket"],
    refetchInterval: (query) =>
      (query.state.data?.rounds ?? []).some((r) => r.matches.some((m) => m.status.live))
        ? 15_000
        : 5 * 60_000,
    refetchIntervalInBackground: false,
  });

  const rounds = Array.isArray(data?.rounds) ? data.rounds : [];
  const [tab, setTab] = useState<string | null>(null);
  const activeRound = tab && rounds.some((r) => r.round === tab) ? tab : defaultRound(rounds);

  // دور واحد فقط وقائمة مبارياته كلها قادمة = نسخة مطابقة لقسم «المباريات»
  // فنخفي القسم تفاديًا للتكرار. فور حسم أول مباراة يظهر «المتأهّلون للدور
  // التالي»، وعند اعتماد الدور اللاحق تتحوّل الشجرة لأعمدة الأدوار الكاملة.
  const singleRound = rounds.length === 1 ? rounds[0] : null;
  const singleRoundDecided = singleRound
    ? singleRound.matches.some((m) => m.status.finished && kcWinnerSide(m) != null)
    : false;
  // أثناء التحميل لا نعرض هيكلًا قد يختفي (القسم مخفي غالبًا قبل انطلاق البطولة)
  if (isLoading) return null;
  if (rounds.length === 0) return null;
  if (singleRound && !singleRoundDecided) return null;

  return (
    <section dir="rtl" className="py-10" id="knockout">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <Trophy className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">الأدوار الإقصائية</h2>
            <p className="text-sm text-muted-foreground">
              مسار البطولة حتى النهائي — تتحدّث النتائج لحظة بلحظة
            </p>
          </div>
        </div>

        {/* دور وحيد بدأت تُحسم مبارياته — المتأهّلون بدل تكرار قائمة الجدول */}
        {singleRound && singleRoundDecided && (
          <QualifiedSoFar round={singleRound} onOpenMatch={onOpenMatch} />
        )}

        {!singleRound && (
          <>
            {/* الجوال فقط: تبويبات حسب الدور */}
            <div className="md:hidden">
              <Tabs value={activeRound} onValueChange={setTab} dir="rtl">
                <TabsList className="mb-4 flex-wrap h-auto w-full justify-start">
                  {rounds.map((round) => (
                    <TabsTrigger key={round.round} value={round.round} className="gap-1.5" data-testid={`kc-bracket-tab-${round.round}`}>
                      {round.matches.some((m) => m.status.live) && (
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                      )}
                      {round.round}
                      {round.round === "النهائي" && " 🏆"}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {rounds.map((round) => (
                  <TabsContent key={round.round} value={round.round} className="space-y-2 mt-0">
                    {round.matches.map((m) => (
                      <BracketMatch key={m.id} fixture={m} onOpen={onOpenMatch} />
                    ))}
                  </TabsContent>
                ))}
              </Tabs>
            </div>

            {/* سطح المكتب/التابلت: أعمدة الأدوار جنبًا إلى جنب — اسحب أفقيًا لتتبع المسار */}
            <div className="hidden md:block">
              <div className="flex gap-4 overflow-x-auto pb-3 snap-x">
                {rounds.map((round) => (
                  <div key={round.round} className="min-w-[260px] w-[260px] shrink-0 snap-start space-y-2">
                    <div className="text-center sticky top-0">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-bold px-3.5 py-1.5">
                        {round.matches.some((m) => m.status.live) && (
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                        )}
                        {round.round}
                        {round.round === "النهائي" && " 🏆"}
                        <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">
                          ({round.matches.length})
                        </span>
                      </span>
                    </div>
                    {round.matches.map((m) => (
                      <BracketMatch key={m.id} fixture={m} onOpen={onOpenMatch} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
