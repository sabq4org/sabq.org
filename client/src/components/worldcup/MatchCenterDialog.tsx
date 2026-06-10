import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Goal,
  MapPin,
  MonitorPlay,
  Radio,
  ShieldAlert,
  Square,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatKickoffDay,
  formatKickoffTime,
  type WcFixture,
  type WcLineup,
  type WcMatchDetail,
  type WcMatchEvent,
  type WcStatistic,
} from "./wcTypes";

interface MatchCenterDialogProps {
  fixtureId: number | null;
  onClose: () => void;
}

// ---------- الأحداث ----------

function EventIcon({ type }: { type: string }) {
  if (type === "goal") return <Goal className="h-4 w-4 text-emerald-500" />;
  if (type === "missed-penalty") return <ShieldAlert className="h-4 w-4 text-red-500" />;
  if (type === "yellow-card") return <Square className="h-4 w-4 fill-yellow-400 text-yellow-400" />;
  if (type === "red-card") return <Square className="h-4 w-4 fill-red-500 text-red-500" />;
  if (type === "substitution") return <ArrowLeftRight className="h-4 w-4 text-sky-500" />;
  if (type === "var") return <MonitorPlay className="h-4 w-4 text-purple-500" />;
  return <Radio className="h-4 w-4 text-muted-foreground" />;
}

function EventsTimeline({ events, fixture }: { events: WcMatchEvent[]; fixture: WcFixture }) {
  if (events.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-8">
        {fixture.status.finished || fixture.status.live
          ? "لا توجد أحداث مسجلة لهذه المباراة"
          : "الأحداث تظهر هنا لحظة بلحظة مع انطلاق المباراة"}
      </p>
    );
  }
  const sorted = [...events].sort(
    (a, b) => b.minute - a.minute || (b.extraMinute ?? 0) - (a.extraMinute ?? 0)
  );
  return (
    <div className="space-y-2">
      {sorted.map((event, index) => {
        const isHome = event.teamId === fixture.home.id;
        const team = isHome ? fixture.home : fixture.away;
        return (
          <div key={index} className="flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-2.5">
            <Badge variant="secondary" className="tabular-nums shrink-0 min-w-[3rem] justify-center" dir="ltr">
              {event.minute}'{event.extraMinute ? `+${event.extraMinute}` : ""}
            </Badge>
            <EventIcon type={event.type} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate">
                {event.label}
                {event.player ? ` — ${event.player}` : ""}
              </p>
              {event.assist && event.type === "goal" && (
                <p className="text-[11px] text-muted-foreground truncate">صناعة: {event.assist}</p>
              )}
              {event.assist && event.type === "substitution" && (
                <p className="text-[11px] text-muted-foreground truncate">بديلًا عن: {event.assist}</p>
              )}
            </div>
            <img src={team.logo} alt={team.name} className="h-5 w-5 object-contain shrink-0" loading="lazy" />
          </div>
        );
      })}
    </div>
  );
}

// ---------- التشكيلات (ملعب 2D) ----------

function TacticalPitch({ lineup }: { lineup: WcLineup }) {
  // المزود يرسل موقع كل لاعب كشبكة "صف:عمود" — الصف 1 هو الحارس
  const rows = useMemo(() => {
    const byRow = new Map<number, { col: number; player: WcLineup["startXI"][number] }[]>();
    for (const player of lineup.startXI) {
      const [row, col] = (player.grid ?? "0:0").split(":").map((n) => parseInt(n, 10) || 0);
      if (!byRow.has(row)) byRow.set(row, []);
      byRow.get(row)!.push({ col, player });
    }
    return [...byRow.entries()]
      .filter(([row]) => row > 0)
      .sort(([a], [b]) => a - b)
      .map(([, players]) => players.sort((a, b) => a.col - b.col).map((p) => p.player));
  }, [lineup.startXI]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">{lineup.teamName}</p>
        {lineup.formation && (
          <Badge variant="secondary" dir="ltr" className="tabular-nums">{lineup.formation}</Badge>
        )}
      </div>
      <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-gradient-to-b from-emerald-700 to-emerald-800 ring-1 ring-emerald-900/40">
        {/* خطوط الملعب */}
        <div className="absolute inset-2 rounded-xl border border-white/25" />
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 h-16 w-36 border border-white/25 border-b-0 rounded-t-sm" />
        <div className="absolute top-2 left-1/2 -translate-x-1/2 h-10 w-44 border border-white/25 border-t-0" />
        <div className="absolute top-1/2 left-0 right-0 h-px bg-white/20" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-16 w-16 rounded-full border border-white/25" />

        {rows.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-white/80 px-4 text-center">التشكيلة غير متاحة بعد</p>
          </div>
        ) : (
          rows.map((rowPlayers, rowIndex) => (
            <div
              key={rowIndex}
              className="absolute left-0 right-0 flex justify-around px-3"
              style={{ bottom: `${((rowIndex + 0.6) / (rows.length + 0.4)) * 100}%` }}
              dir="ltr"
            >
              {rowPlayers.map((player) => (
                <div key={player.id} className="flex flex-col items-center gap-0.5 w-14">
                  <span className="h-7 w-7 rounded-full bg-white text-emerald-900 text-[11px] font-black flex items-center justify-center shadow-md tabular-nums">
                    {player.number ?? "•"}
                  </span>
                  <span className="text-[9px] text-white text-center leading-tight line-clamp-2 drop-shadow">
                    {player.name}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
      {lineup.coach && (
        <p className="text-[11px] text-muted-foreground">المدرب: {lineup.coach}</p>
      )}
    </div>
  );
}

function LineupsTab({ lineups }: { lineups: WcLineup[] }) {
  if (lineups.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-8">
        التشكيلات تُعلن قبل انطلاق المباراة بنحو ساعة
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {lineups.map((lineup) => (
        <TacticalPitch key={lineup.teamId} lineup={lineup} />
      ))}
    </div>
  );
}

// ---------- الإحصائيات ----------

function StatRow({ stat }: { stat: WcStatistic }) {
  const home = parseFloat(String(stat.home).replace("%", "")) || 0;
  const away = parseFloat(String(stat.away).replace("%", "")) || 0;
  const max = home + away || 1;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-black tabular-nums w-12">{stat.home}</span>
        <span className="text-xs text-muted-foreground">{stat.label}</span>
        <span className="font-black tabular-nums w-12 text-left">{stat.away}</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-muted">
        <div
          className="absolute top-0 bottom-0 end-1/2 rounded-s-full bg-emerald-500"
          style={{ width: `${(home / max) * 50}%` }}
        />
        <div
          className="absolute top-0 bottom-0 start-1/2 rounded-e-full bg-sky-500"
          style={{ width: `${(away / max) * 50}%` }}
        />
      </div>
    </div>
  );
}

// ---------- التوقعات ----------

function PredictionTab({ detail }: { detail: WcMatchDetail }) {
  const prediction = detail.prediction;
  if (!prediction) {
    return <p className="text-center text-sm text-muted-foreground py-8">لا تتوفر توقعات لهذه المباراة</p>;
  }
  const rows = [
    { label: `فوز ${detail.fixture.home.name}`, value: prediction.home, color: "bg-emerald-500" },
    { label: "التعادل", value: prediction.draw, color: "bg-zinc-400" },
    { label: `فوز ${detail.fixture.away.name}`, value: prediction.away, color: "bg-sky-500" },
  ];
  return (
    <div className="space-y-4 py-2">
      {rows.map((row) => (
        <div key={row.label} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">{row.label}</span>
            <span className="font-black tabular-nums">{row.value}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full ${row.color}`} style={{ width: `${row.value}%` }} />
          </div>
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground text-center pt-2">
        توقعات خوارزمية من مزود البيانات الرياضية — للاستئناس وليست ترجيحًا تحريريًا
      </p>
    </div>
  );
}

// ---------- الحوار ----------

export function MatchCenterDialog({ fixtureId, onClose }: MatchCenterDialogProps) {
  const { data: detail, isLoading } = useQuery<WcMatchDetail>({
    queryKey: [`/api/world-cup/match/${fixtureId}`],
    enabled: fixtureId != null,
    refetchInterval: (query) => (query.state.data?.fixture.status.live ? 30_000 : false),
  });

  const fixture = detail?.fixture;

  return (
    <Dialog open={fixtureId != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="sr-only">مركز المباراة</DialogTitle>
          {isLoading && (
            <div className="flex items-center justify-between py-2">
              <Skeleton className="h-14 w-14 rounded-full" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-14 w-14 rounded-full" />
            </div>
          )}
          {fixture && (
            <div className="space-y-2 text-center">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="flex flex-col items-center gap-1.5">
                  <div className="h-12 w-12 rounded-full bg-white ring-1 ring-border p-1">
                    <img src={fixture.home.logo} alt={fixture.home.name} className="h-full w-full object-contain" />
                  </div>
                  <span className="text-sm font-extrabold">{fixture.home.name}</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  {fixture.status.live || fixture.status.finished ? (
                    <span className="text-3xl font-black tabular-nums" dir="ltr">
                      {fixture.goals.home ?? 0} - {fixture.goals.away ?? 0}
                    </span>
                  ) : (
                    <span className="text-xl font-black">{formatKickoffTime(fixture.date)}</span>
                  )}
                  <Badge
                    className={
                      fixture.status.live
                        ? "bg-red-500 text-white border-0 gap-1"
                        : "bg-muted text-muted-foreground border-0"
                    }
                  >
                    {fixture.status.live && <Radio className="h-3 w-3 animate-pulse" />}
                    {fixture.status.live && fixture.status.elapsed != null
                      ? `${fixture.status.elapsed}'`
                      : fixture.status.label}
                  </Badge>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <div className="h-12 w-12 rounded-full bg-white ring-1 ring-border p-1">
                    <img src={fixture.away.logo} alt={fixture.away.name} className="h-full w-full object-contain" />
                  </div>
                  <span className="text-sm font-extrabold">{fixture.away.name}</span>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1">
                <MapPin className="h-3 w-3" />
                {fixture.round} · {fixture.venue.name} — {fixture.venue.city} · {formatKickoffDay(fixture.date)}
              </p>
            </div>
          )}
        </DialogHeader>

        {detail && (
          <Tabs defaultValue="events" dir="rtl" className="flex-1 min-h-0 flex flex-col">
            <TabsList className="self-center">
              <TabsTrigger value="events">الأحداث</TabsTrigger>
              <TabsTrigger value="lineups">التشكيلات</TabsTrigger>
              <TabsTrigger value="stats">الإحصائيات</TabsTrigger>
              <TabsTrigger value="prediction">التوقعات</TabsTrigger>
            </TabsList>
            <ScrollArea className="flex-1 mt-3 pe-2">
              <TabsContent value="events" className="mt-0">
                <EventsTimeline events={detail.events} fixture={detail.fixture} />
              </TabsContent>
              <TabsContent value="lineups" className="mt-0">
                <LineupsTab lineups={detail.lineups} />
              </TabsContent>
              <TabsContent value="stats" className="mt-0">
                {detail.statistics.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    الإحصائيات تظهر هنا أثناء المباراة
                  </p>
                ) : (
                  <div className="space-y-3 py-2">
                    {detail.statistics.map((stat) => (
                      <StatRow key={stat.key} stat={stat} />
                    ))}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="prediction" className="mt-0">
                <PredictionTab detail={detail} />
              </TabsContent>
            </ScrollArea>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
