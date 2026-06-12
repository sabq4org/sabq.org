import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Award, Goal, Handshake, Square, Timer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WcLeader, WcScorer } from "./wcTypes";

interface ScorersSectionProps {
  scorers: WcScorer[] | undefined;
  isLoading: boolean;
  /** انطلقت البطولة (مباراة حية أو منتهية) — المزود يعتمد إحصاءات اللاعبين بعد المباريات بفاصل */
  tournamentStarted: boolean;
  onOpenPlayer: (playerId: number) => void;
}

const PODIUM_RING = [
  "ring-amber-400", // الذهب
  "ring-zinc-300", // الفضة
  "ring-orange-700/70", // البرونز
];

function PodiumCard({
  scorer,
  place,
  onOpenPlayer,
}: {
  scorer: WcScorer;
  place: number;
  onOpenPlayer: (playerId: number) => void;
}) {
  const isFirst = place === 0;
  return (
    <button
      type="button"
      onClick={() => scorer.id > 0 && onOpenPlayer(scorer.id)}
      disabled={scorer.id <= 0}
      className={`flex flex-col items-center gap-2 rounded-xl p-2 hover-elevate active-elevate-2 transition-all disabled:cursor-default ${isFirst ? "" : "mt-8"}`}
      data-testid={`wc-podium-${scorer.id}`}
    >
      <div className="relative">
        <div className={`${isFirst ? "h-24 w-24" : "h-[72px] w-[72px]"} rounded-full overflow-hidden ring-4 ${PODIUM_RING[place]} bg-muted`}>
          {scorer.photo ? (
            <img src={scorer.photo} alt={scorer.name} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-muted-foreground font-black text-xl">
              {scorer.name.slice(0, 2)}
            </div>
          )}
        </div>
        <span className={`absolute -bottom-1.5 right-1/2 translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] font-black text-white ${
          place === 0 ? "bg-amber-500" : place === 1 ? "bg-zinc-400" : "bg-orange-700"
        }`}>
          {place + 1}
        </span>
      </div>
      <div className="text-center">
        <p className={`font-extrabold ${isFirst ? "text-base" : "text-sm"}`}>{scorer.name}</p>
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
          <img src={scorer.team.logo} alt={scorer.team.name} className="h-3.5 w-3.5 object-contain" loading="lazy" />
          {scorer.team.name}
        </p>
      </div>
      <div className={`flex items-baseline gap-1 ${isFirst ? "text-amber-500" : "text-foreground"}`}>
        <span className={`font-black tabular-nums ${isFirst ? "text-3xl" : "text-2xl"}`}>{scorer.goals}</span>
        <span className="text-xs text-muted-foreground">{scorer.goals === 1 ? "هدف" : "أهداف"}</span>
      </div>
    </button>
  );
}

function LeaderRow({
  rank,
  playerId,
  name,
  photo,
  team,
  minutes,
  end,
  onOpenPlayer,
}: {
  rank: number;
  playerId: number;
  name: string;
  photo: string;
  team: { name: string; logo: string };
  minutes: number;
  end: React.ReactNode;
  onOpenPlayer: (playerId: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => playerId > 0 && onOpenPlayer(playerId)}
      disabled={playerId <= 0}
      className="w-full flex items-center justify-between gap-3 rounded-xl bg-card px-3.5 py-2.5 dark:border dark:border-card-border text-right hover-elevate active-elevate-2 transition-all disabled:cursor-default"
      data-testid={`wc-leader-${playerId}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-5 text-center text-sm text-muted-foreground tabular-nums">{rank}</span>
        <div className="h-9 w-9 rounded-full overflow-hidden bg-muted shrink-0">
          {photo && <img src={photo} alt={name} className="h-full w-full object-cover" loading="lazy" />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold truncate">{name}</p>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <img src={team.logo} alt={team.name} className="h-3 w-3 object-contain" loading="lazy" />
            {team.name}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0 text-xs text-muted-foreground">
        {minutes > 0 && (
          <span className="hidden sm:flex items-center gap-1">
            <Timer className="h-3 w-3" />
            {minutes} د
          </span>
        )}
        {end}
      </div>
    </button>
  );
}

function EmptyRace({ message }: { message: string }) {
  return (
    <Card className="border-0 dark:border dark:border-card-border max-w-xl mx-auto">
      <CardContent className="py-10 flex flex-col items-center gap-2 text-center">
        <Goal className="h-8 w-8 text-amber-500" />
        <p className="font-bold">{message}</p>
        <p className="text-sm text-muted-foreground">تابع هنا الترتيب أولًا بأول طوال البطولة</p>
      </CardContent>
    </Card>
  );
}

function LeadersList({ endpoint, render, emptyMessage, onOpenPlayer }: {
  endpoint: string;
  render: (leader: WcLeader) => React.ReactNode;
  emptyMessage: string;
  onOpenPlayer: (playerId: number) => void;
}) {
  const { data, isLoading } = useQuery<{ leaders: WcLeader[] }>({
    queryKey: [endpoint],
    staleTime: 10 * 60_000,
  });
  const leaders = Array.isArray(data?.leaders) ? data.leaders : [];

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    );
  }
  if (leaders.length === 0) return <EmptyRace message={emptyMessage} />;
  return (
    <div className="max-w-2xl mx-auto space-y-1.5">
      {leaders.map((leader) => (
        <LeaderRow
          key={`${leader.rank}-${leader.name}`}
          rank={leader.rank}
          playerId={leader.id}
          name={leader.name}
          photo={leader.photo}
          team={leader.team}
          minutes={leader.minutes}
          end={render(leader)}
          onOpenPlayer={onOpenPlayer}
        />
      ))}
    </div>
  );
}

export function ScorersSection({ scorers, isLoading, tournamentStarted, onOpenPlayer }: ScorersSectionProps) {
  const all = scorers ?? [];
  // المنصة تحتاج ثلاثة هدافين مكتملين — أقل من ذلك يعرض قائمة صفوف عادية
  const showPodium = all.length >= 3;
  const podium = showPodium ? all.slice(0, 3) : [];
  const rest = showPodium ? all.slice(3) : all;
  // «ينطلق مع أول صافرة» تصبح خاطئة لحظة انطلاق البطولة — العبارات تتبع الحالة
  const pendingStats = "انطلقت البطولة — الترتيب يظهر فور اعتماد المزود لإحصاءات المباريات";

  return (
    <section dir="rtl" className="py-10" id="scorers">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Award className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">سباقات البطولة</h2>
            <p className="text-sm text-muted-foreground">الحذاء الذهبي، صنّاع الأهداف، والبطاقات</p>
          </div>
        </div>

        <Tabs defaultValue="goals" dir="rtl">
          <TabsList className="mb-5">
            <TabsTrigger value="goals" className="gap-1.5">
              <Goal className="h-3.5 w-3.5" />
              الهدافون
            </TabsTrigger>
            <TabsTrigger value="assists" className="gap-1.5">
              <Handshake className="h-3.5 w-3.5" />
              صنّاع الأهداف
            </TabsTrigger>
            <TabsTrigger value="cards" className="gap-1.5">
              <Square className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
              البطاقات
            </TabsTrigger>
          </TabsList>

          <TabsContent value="goals">
            {isLoading && (
              <div className="grid grid-cols-3 gap-4 max-w-xl mx-auto">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-44 rounded-xl" />
                ))}
              </div>
            )}
            {!isLoading && all.length === 0 && (
              <EmptyRace message={tournamentStarted ? pendingStats : "سباق الحذاء الذهبي ينطلق مع أول صافرة"} />
            )}
            {!isLoading && all.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4 }}
              >
                {/* منصة التتويج: الثاني — الأول — الثالث */}
                {showPodium && (
                  <div className="grid grid-cols-3 items-start gap-3 max-w-xl mx-auto mb-8">
                    <PodiumCard scorer={podium[1]} place={1} onOpenPlayer={onOpenPlayer} />
                    <PodiumCard scorer={podium[0]} place={0} onOpenPlayer={onOpenPlayer} />
                    <PodiumCard scorer={podium[2]} place={2} onOpenPlayer={onOpenPlayer} />
                  </div>
                )}
                {rest.length > 0 && (
                  <div className="max-w-2xl mx-auto space-y-1.5">
                    {rest.map((scorer) => (
                      <LeaderRow
                        key={`${scorer.rank}-${scorer.name}`}
                        rank={scorer.rank}
                        playerId={scorer.id}
                        name={scorer.name}
                        photo={scorer.photo}
                        team={scorer.team}
                        minutes={scorer.minutes}
                        onOpenPlayer={onOpenPlayer}
                        end={
                          <>
                            <span className="hidden sm:inline">{scorer.assists} صناعة</span>
                            <span className="text-lg font-black text-foreground tabular-nums">{scorer.goals}</span>
                          </>
                        }
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </TabsContent>

          <TabsContent value="assists">
            <LeadersList
              endpoint="/api/world-cup/assists"
              onOpenPlayer={onOpenPlayer}
              emptyMessage={tournamentStarted ? pendingStats : "سباق صنّاع الأهداف ينطلق مع أول صافرة"}
              render={(leader) => (
                <>
                  <span className="hidden sm:inline">{leader.goals} أهداف</span>
                  <span className="text-lg font-black text-foreground tabular-nums">{leader.assists}</span>
                </>
              )}
            />
          </TabsContent>

          <TabsContent value="cards">
            <LeadersList
              endpoint="/api/world-cup/cards"
              onOpenPlayer={onOpenPlayer}
              emptyMessage={tournamentStarted ? "البطاقات تُعتمد بعد المباريات بقليل — وعسى ألا تكثر" : "لا بطاقات بعد — وعسى ألا تكثر"}
              render={(leader) => (
                <span className="flex items-center gap-2">
                  <span className="flex items-center gap-1 font-black tabular-nums">
                    <Square className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    {leader.yellow}
                  </span>
                  <span className="flex items-center gap-1 font-black tabular-nums">
                    <Square className="h-3 w-3 fill-red-500 text-red-500" />
                    {leader.red}
                  </span>
                </span>
              )}
            />
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
