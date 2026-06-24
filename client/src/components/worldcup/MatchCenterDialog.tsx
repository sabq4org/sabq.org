import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeftRight,
  Crown,
  Gauge,
  Goal,
  MapPin,
  MonitorPlay,
  Radio,
  ShieldAlert,
  Square,
  Star,
  Tv,
} from "lucide-react";
import { Cloud, CornerDownRight, Droplets, Flag, Hand, Rocket, Timer, UserX } from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatKickoffDay,
  formatKickoffTime,
  type WcCommentary,
  type WcCommentaryItem,
  type WcMomentum,
  type WcMomentumPoint,
  type WcPressure,
  type WcPressurePoint,
  type WcForecast,
  type WcOverUnderLine,
  type WcMatchFacts,
  type WcWeather,
  type WcEventDetail,
  type WcXg,
  type WcFixture,
  type WcLineup,
  type WcMatchDetail,
  type WcMatchEvent,
  type WcStatistic,
  type WcTvChannel,
} from "./wcTypes";
import { LiveMinute } from "./LiveMinute";

interface MatchCenterDialogProps {
  fixtureId: number | null;
  onClose: () => void;
  /** يفتح بطاقة اللاعب فوق مركز المباراة دون إغلاقه */
  onOpenPlayer: (playerId: number) => void;
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

// يصنّف حدث API-Football إلى صنف SportMonks لمطابقة التفصيل المركّب
function eventKlass(type: string): "goal" | "card" | "var" | null {
  if (type === "goal") return "goal";
  if (type === "yellow-card" || type === "red-card") return "card";
  if (type === "var") return "var";
  return null;
}

// بطاقة حدث على جانب فريقه في الخط الزمني (الأيقونة تلاصق العمود المركزي)
function TimelineChip({
  ev,
  extra,
  side,
  onOpenPlayer,
}: {
  ev: WcMatchEvent;
  extra: string | null;
  side: "home" | "away";
  onOpenPlayer: (playerId: number) => void;
}) {
  const clickable = (ev.playerId ?? 0) > 0;
  const isGoal = ev.type === "goal";
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => clickable && onOpenPlayer(ev.playerId!)}
      className={`inline-flex items-start gap-2 max-w-full rounded-lg px-2.5 py-1.5 hover-elevate active-elevate-2 transition-all disabled:cursor-default ${
        isGoal ? "bg-emerald-500/10 ring-1 ring-emerald-500/25" : "bg-muted/40"
      } ${side === "home" ? "flex-row" : "flex-row-reverse"}`}
    >
      <span className="mt-0.5 shrink-0">
        <EventIcon type={ev.type} />
      </span>
      <div className="min-w-0" dir="rtl">
        <p className="text-xs font-bold truncate">{ev.player || ev.label}</p>
        {extra && <p className="text-[10px] text-emerald-700 dark:text-emerald-300 truncate">{extra}</p>}
        {ev.assist && isGoal && (
          <p className="text-[10px] text-muted-foreground truncate">صناعة: {ev.assist}</p>
        )}
        {ev.assist && ev.type === "substitution" && (
          <p className="text-[10px] text-muted-foreground truncate">بديلًا عن: {ev.assist}</p>
        )}
      </div>
    </button>
  );
}

function EventsTimeline({
  events,
  fixture,
  onOpenPlayer,
  eventDetails = [],
  halftime = null,
}: {
  events: WcMatchEvent[];
  fixture: WcFixture;
  onOpenPlayer: (playerId: number) => void;
  /** تفصيل SportMonks المركّب فوق أحداث API-Football (طريقة الهدف/سبب البطاقة/VAR) */
  eventDetails?: WcEventDetail[];
  halftime?: { home: number; away: number } | null;
}) {
  if (events.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-8">
        {fixture.status.finished || fixture.status.live
          ? "لا توجد أحداث مسجلة لهذه المباراة"
          : "الأحداث تظهر هنا لحظة بلحظة مع انطلاق المباراة"}
      </p>
    );
  }
  // مطابقة بـ صنف+جهة+دقيقة (سماح ±1 لاختلاف توقيت المزوّدين)
  const detailFor = (event: WcMatchEvent): string | null => {
    const klass = eventKlass(event.type);
    if (!klass) return null;
    const location = event.teamId === fixture.home.id ? "home" : "away";
    const hit = eventDetails.find(
      (d) => d.klass === klass && d.location === location && Math.abs(d.minute - event.minute) <= 1
    );
    return hit?.detail ?? null;
  };
  // تنازلي زمنيًا (الأحدث أعلى → الأقدم أسفل)
  const sorted = [...events].sort(
    (a, b) => b.minute - a.minute || (b.extraMinute ?? 0) - (a.extraMinute ?? 0)
  );
  return (
    <div>
      {halftime && (
        <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground pb-2">
          <span>نتيجة الشوط الأول</span>
          <span className="font-black tabular-nums text-foreground" dir="ltr">
            {halftime.away} - {halftime.home}
          </span>
        </div>
      )}
      {/* رأس الجانبين: المضيف يمينًا، الضيف يسارًا */}
      <div dir="ltr" className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mb-2 px-1">
        <div className="flex items-center gap-1.5 justify-end min-w-0">
          <span className="text-xs font-bold truncate">{fixture.away.name}</span>
          <img src={fixture.away.logo} alt="" className="h-5 w-5 object-contain shrink-0" loading="lazy" />
        </div>
        <span className="min-w-[2.75rem]" />
        <div className="flex items-center gap-1.5 justify-start min-w-0">
          <img src={fixture.home.logo} alt="" className="h-5 w-5 object-contain shrink-0" loading="lazy" />
          <span className="text-xs font-bold truncate">{fixture.home.name}</span>
        </div>
      </div>
      {/* الخط الزمني: عمود مركزي للدقائق */}
      <div className="relative">
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-emerald-500/20" />
        <div className="space-y-1.5">
          {sorted.map((event, index) => {
            const isHome = event.teamId === fixture.home.id;
            const extra = detailFor(event);
            return (
              <div key={index} dir="ltr" className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div className="flex justify-end min-w-0">
                  {!isHome && (
                    <TimelineChip ev={event} extra={extra} side="away" onOpenPlayer={onOpenPlayer} />
                  )}
                </div>
                <span className="z-[1] grid place-items-center min-w-[2.75rem] rounded-full bg-emerald-600 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white">
                  {event.minute}'{event.extraMinute ? `+${event.extraMinute}` : ""}
                </span>
                <div className="flex justify-start min-w-0">
                  {isHome && (
                    <TimelineChip ev={event} extra={extra} side="home" onOpenPlayer={onOpenPlayer} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// يجلب معطيات SportMonks ويركّب تفصيلها على أحداث API-Football + نتيجة الشوط الأول
function EventsTab({
  detail,
  onOpenPlayer,
}: {
  detail: WcMatchDetail;
  onOpenPlayer: (playerId: number) => void;
}) {
  const { data: facts } = useQuery<WcMatchFacts>({
    queryKey: [`/api/world-cup/match-facts/${detail.fixture.id}`],
    refetchInterval: detail.fixture.status.live ? 30_000 : false,
  });
  return (
    <EventsTimeline
      events={detail.events}
      fixture={detail.fixture}
      onOpenPlayer={onOpenPlayer}
      eventDetails={facts?.eventDetails ?? []}
      halftime={facts?.halftime ?? null}
    />
  );
}

// ---------- التشكيلات (ملعب 2D) ----------

function TacticalPitch({
  lineup,
  onOpenPlayer,
}: {
  lineup: WcLineup;
  onOpenPlayer: (playerId: number) => void;
}) {
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
                <button
                  key={player.id}
                  type="button"
                  onClick={() => player.id > 0 && onOpenPlayer(player.id)}
                  disabled={player.id <= 0}
                  className="flex flex-col items-center gap-0.5 w-14 disabled:cursor-default"
                >
                  <span className="h-7 w-7 rounded-full bg-white text-emerald-900 text-[11px] font-black flex items-center justify-center shadow-md tabular-nums">
                    {player.number ?? "•"}
                  </span>
                  <span className="text-[9px] text-white text-center leading-tight line-clamp-2 drop-shadow">
                    {player.name}
                  </span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
      {lineup.coach && (
        <p className="text-[11px] text-muted-foreground">المدرب: {lineup.coach}</p>
      )}
      {lineup.substitutes.length > 0 && (
        <div className="pt-1">
          <p className="text-[10px] font-bold text-muted-foreground mb-1">البدلاء</p>
          <div className="flex flex-wrap gap-1">
            {lineup.substitutes.map((s, idx) => (
              <button
                key={`${s.id}-${idx}`}
                type="button"
                onClick={() => s.id > 0 && onOpenPlayer(s.id)}
                disabled={s.id <= 0}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] hover-elevate active-elevate-2 transition-all disabled:cursor-default"
              >
                {s.number != null && <span className="font-black tabular-nums">{s.number}</span>}
                <span className="truncate max-w-[7rem]">{s.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LineupsTab({
  lineups,
  onOpenPlayer,
}: {
  lineups: WcLineup[];
  onOpenPlayer: (playerId: number) => void;
}) {
  if (lineups.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-8">
        التشكيلات تُعلن قبل انطلاق المباراة بنحو 20–40 دقيقة
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {lineups.map((lineup) => (
        <TacticalPitch key={lineup.teamId} lineup={lineup} onOpenPlayer={onOpenPlayer} />
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

// ---------- معطيات المباراة: طقس + غيابات + إحصائيات أعمق (SportMonks) ----------

function WeatherCard({ weather }: { weather: WcWeather }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/40 px-3.5 py-2.5">
      {weather.icon ? (
        <img src={weather.icon} alt="" className="h-9 w-9 object-contain shrink-0" loading="lazy" />
      ) : (
        <Cloud className="h-7 w-7 text-sky-500 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">
          {weather.description}
          {weather.type === "forecast" && (
            <span className="text-[10px] text-muted-foreground font-normal"> · توقّع</span>
          )}
        </p>
        <div className="text-[11px] text-muted-foreground flex items-center gap-3 mt-0.5">
          {weather.temp != null && <span className="tabular-nums">{weather.temp}°م</span>}
          {weather.humidity && (
            <span className="flex items-center gap-0.5">
              <Droplets className="h-3 w-3" /> {weather.humidity}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function AbsenteesSection({
  absentees,
  fixture,
}: {
  absentees: WcMatchFacts["absentees"];
  fixture: WcFixture;
}) {
  const col = (team: WcFixture["home"], location: "home" | "away") => {
    const list = absentees.filter((a) => a.location === location);
    return (
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 mb-1.5">
          <img src={team.logo} alt="" className="h-4 w-4 object-contain shrink-0" loading="lazy" />
          <span className="text-xs font-bold truncate">{team.name}</span>
        </div>
        <ul className="space-y-1">
          {list.length === 0 ? (
            <li className="text-[11px] text-muted-foreground">—</li>
          ) : (
            list.map((a, i) => (
              <li key={i} className="text-[11px] text-muted-foreground truncate">
                <span className="text-foreground font-semibold">{a.name}</span>
                {a.reason ? ` — ${a.reason}` : ""}
              </li>
            ))
          )}
        </ul>
      </div>
    );
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <UserX className="h-3.5 w-3.5 text-rose-500" />
        <h4 className="text-xs font-bold text-rose-600 dark:text-rose-300">الغيابات</h4>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {col(fixture.home, "home")}
        {col(fixture.away, "away")}
      </div>
    </div>
  );
}

function XgCard({ fixtureId, fixture }: { fixtureId: number; fixture: WcFixture }) {
  const { data } = useQuery<WcXg>({
    queryKey: [`/api/world-cup/xg/${fixtureId}`],
    refetchInterval: fixture.status.live ? 30_000 : false,
  });
  if (!data?.available) return null;
  const teamLogo = (loc: "home" | "away") => (loc === "home" ? fixture.home.logo : fixture.away.logo);
  return (
    <div className="rounded-xl bg-gradient-to-l from-emerald-500/10 to-sky-500/10 ring-1 ring-border/60 px-3.5 py-3 space-y-2.5">
      <StatRow
        stat={{
          key: "xg",
          label: "الأهداف المتوقعة (xG)",
          home: data.home.xg.toFixed(2),
          away: data.away.xg.toFixed(2),
        }}
      />
      {(data.home.xgot > 0 || data.away.xgot > 0) && (
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="tabular-nums w-12">{data.home.xgot.toFixed(2)}</span>
          <span>على المرمى (xGoT)</span>
          <span className="tabular-nums w-12 text-left">{data.away.xgot.toFixed(2)}</span>
        </div>
      )}
      {data.topPlayers.length > 0 && (
        <div className="pt-2 border-t border-border/60 space-y-1">
          <p className="text-[10px] text-muted-foreground">الأعلى خطورة (xG)</p>
          {data.topPlayers.slice(0, 3).map((p, i) => (
            <div key={i} className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 min-w-0">
                <img
                  src={teamLogo(p.location)}
                  alt=""
                  className="h-3.5 w-3.5 object-contain shrink-0"
                  loading="lazy"
                />
                <span className="truncate">{p.name}</span>
              </span>
              <span className="font-bold tabular-nums shrink-0">{p.xg.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatsTab({ detail }: { detail: WcMatchDetail }) {
  const { data: facts, isLoading } = useQuery<WcMatchFacts>({
    queryKey: [`/api/world-cup/match-facts/${detail.fixture.id}`],
    refetchInterval: detail.fixture.status.live ? 30_000 : false,
  });
  // إحصاء الفريق المفصّل من TheSports (احتياط للمباريات المنتهية، خلف SportMonks).
  const { data: tsStats } = useQuery<{ available: boolean; team: WcStatistic[] }>({
    queryKey: [`/api/world-cup/match/${detail.fixture.id}/stats`],
    enabled: detail.fixture.status.finished,
  });
  const tsTeam = Array.isArray(tsStats?.team) ? tsStats.team : [];
  // أثناء اللعب نُفضّل إحصاءات detail اللحظية (TheSports — أسرع) إن توفّرت؛ وإلا
  // إحصائيات SportMonks الأعمق (حتى 16 سطرًا منتقى)؛ ثم TheSports المفصّل
  // (للمنتهية)؛ ثم API-Football عند غيابها جميعًا.
  const stats =
    detail.fixture.status.live && detail.statistics.length > 0
      ? detail.statistics
      : (facts?.statistics?.length ?? 0) > 0
        ? facts!.statistics
        : tsTeam.length > 0
          ? tsTeam
          : detail.statistics;
  const weather = facts?.weather ?? null;
  const hasAbsentees = (facts?.absentees?.length ?? 0) > 0;
  const hasStats = stats.length > 0;

  if (isLoading && detail.statistics.length === 0) {
    return (
      <div className="space-y-3 py-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 py-2">
      <XgCard fixtureId={detail.fixture.id} fixture={detail.fixture} />
      {weather && <WeatherCard weather={weather} />}
      {hasAbsentees && facts && (
        <AbsenteesSection absentees={facts.absentees} fixture={detail.fixture} />
      )}
      {hasStats && (
        <div className="space-y-3">
          {(weather || hasAbsentees) && <div className="border-t border-border/60 pt-1" />}
          {stats.map((stat) => (
            <StatRow key={stat.key} stat={stat} />
          ))}
        </div>
      )}
      {!hasStats && !weather && !hasAbsentees && (
        <p className="text-center text-sm text-muted-foreground py-8">
          الإحصائيات تظهر هنا أثناء المباراة
        </p>
      )}
    </div>
  );
}

// ---------- التوقعات وسجل المواجهات ----------

function HeadToHeadList({ detail }: { detail: WcMatchDetail }) {
  if (detail.headToHead.length === 0) {
    return (
      <p className="text-center text-xs text-muted-foreground py-3">
        أول مواجهة رسمية بين المنتخبين — التاريخ يبدأ من هنا
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      {detail.headToHead.map((match) => (
        <div key={match.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
          <Badge variant="secondary" className="tabular-nums shrink-0" dir="ltr">
            {(match.date ?? "").slice(0, 4)}
          </Badge>
          <div className="flex items-center justify-center gap-2 flex-1 min-w-0">
            <span className="font-semibold truncate">{match.home.name}</span>
            {/* اسم المضيف على اليمين — الضيف أولًا داخل LTR */}
            <span className="font-black tabular-nums shrink-0" dir="ltr">
              {match.goals.away ?? 0} - {match.goals.home ?? 0}
            </span>
            <span className="font-semibold truncate">{match.away.name}</span>
          </div>
          {match.penalties && (
            <span className="text-[10px] text-muted-foreground shrink-0">ركلات ترجيح</span>
          )}
        </div>
      ))}
    </div>
  );
}

// شريط مزدوج (احتمالان متقابلان) — للفريقان يسجلان وأوفر/أندر
function ForecastSplit({
  title,
  left,
  right,
}: {
  title: string;
  left: { label: string; value: number; color: string };
  right: { label: string; value: number; color: string };
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-bold text-muted-foreground">{title}</p>
      <div className="flex h-6 w-full overflow-hidden rounded-lg text-[11px] font-bold text-white" dir="rtl">
        <div
          className={`flex items-center justify-center ${left.color}`}
          style={{ width: `${left.value}%` }}
        >
          {left.value >= 16 ? `${left.value}%` : ""}
        </div>
        <div
          className={`flex items-center justify-center ${right.color}`}
          style={{ width: `${right.value}%` }}
        >
          {right.value >= 16 ? `${right.value}%` : ""}
        </div>
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {left.label} <span className="font-bold tabular-nums text-foreground">{left.value}%</span>
        </span>
        <span>
          {right.label} <span className="font-bold tabular-nums text-foreground">{right.value}%</span>
        </span>
      </div>
    </div>
  );
}

function OverUnderRow({ ou }: { ou: WcOverUnderLine }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="font-bold tabular-nums shrink-0 w-9" dir="ltr">
        {ou.line}
      </span>
      <div className="flex h-5 flex-1 overflow-hidden rounded-md text-[10px] font-bold text-white" dir="rtl">
        <div className="flex items-center justify-center bg-emerald-500" style={{ width: `${ou.over}%` }}>
          {ou.over >= 20 ? `${ou.over}%` : ""}
        </div>
        <div className="flex items-center justify-center bg-zinc-400" style={{ width: `${ou.under}%` }}>
          {ou.under >= 20 ? `${ou.under}%` : ""}
        </div>
      </div>
    </div>
  );
}

function ForecastBlocks({ detail }: { detail: WcMatchDetail }) {
  const { data, isLoading } = useQuery<WcForecast>({
    queryKey: [`/api/world-cup/forecast/${detail.fixture.id}`],
  });
  if (isLoading) {
    return (
      <div className="space-y-3 pt-1">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  if (!data?.available) return null;
  const { btts, doubleChance, goals, correctScores } = data;
  const homeName = detail.fixture.home.name;
  const awayName = detail.fixture.away.name;

  return (
    <div className="space-y-4 pt-3 border-t border-border/60">
      <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-300">توقعات متقدّمة</h4>

      {doubleChance && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-muted-foreground">الفرصة المزدوجة</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: `${homeName} أو تعادل`, value: doubleChance.homeOrDraw },
              { label: "بلا تعادل", value: doubleChance.homeOrAway },
              { label: `${awayName} أو تعادل`, value: doubleChance.awayOrDraw },
            ].map((c) => (
              <div key={c.label} className="rounded-lg bg-muted/50 px-1.5 py-2">
                <p className="text-base font-black tabular-nums">{c.value}%</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{c.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {btts && (
        <ForecastSplit
          title="الفريقان يسجلان"
          left={{ label: "نعم", value: btts.yes, color: "bg-emerald-500" }}
          right={{ label: "لا", value: btts.no, color: "bg-zinc-400" }}
        />
      )}

      {goals.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-muted-foreground">
            مجموع الأهداف — <span className="text-emerald-600">أكثر</span> /{" "}
            <span className="text-zinc-500">أقل</span> من
          </p>
          <div className="space-y-1.5">
            {goals.map((ou) => (
              <OverUnderRow key={ou.line} ou={ou} />
            ))}
          </div>
        </div>
      )}

      {correctScores.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-muted-foreground">
            أرجح النتائج <span className="font-normal">(الرقم الأول للمضيف)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {correctScores.map((cs) => (
              <div
                key={cs.score}
                className="rounded-lg bg-muted/50 px-2.5 py-1.5 text-center min-w-[3.5rem]"
              >
                <p className="text-sm font-black tabular-nums" dir="ltr">
                  {cs.score}
                </p>
                <p className="text-[10px] text-muted-foreground tabular-nums">{cs.prob}%</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PredictionTab({ detail }: { detail: WcMatchDetail }) {
  // مصدر نتيجة المباراة: API-Football إن توفّر، وإلا احتمالات SportMonks
  const { data: forecast } = useQuery<WcForecast>({
    queryKey: [`/api/world-cup/forecast/${detail.fixture.id}`],
  });
  const apiPred = detail.prediction;
  const ft = apiPred
    ? { home: apiPred.home, draw: apiPred.draw, away: apiPred.away }
    : forecast?.fulltime ?? null;
  const rows = ft
    ? [
        { label: `فوز ${detail.fixture.home.name}`, value: ft.home, color: "bg-emerald-500" },
        { label: "التعادل", value: ft.draw, color: "bg-zinc-400" },
        { label: `فوز ${detail.fixture.away.name}`, value: ft.away, color: "bg-sky-500" },
      ]
    : [];
  const hasAny = ft != null || forecast?.available;

  return (
    <div className="space-y-4 py-2">
      {!hasAny && (
        <p className="text-center text-sm text-muted-foreground py-2">لا تتوفر توقعات لهذه المباراة</p>
      )}
      {rows.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-muted-foreground">نتيجة المباراة</p>
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
        </div>
      )}

      <ForecastBlocks detail={detail} />

      {hasAny && (
        <p className="text-[11px] text-muted-foreground text-center">
          توقعات خوارزمية من مزود البيانات الرياضية — للاستئناس وليست ترجيحًا تحريريًا
        </p>
      )}
      <div className="pt-2 border-t border-border/60">
        <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mb-2">سجل المواجهات</h4>
        <HeadToHeadList detail={detail} />
      </div>
    </div>
  );
}

// ---------- تقييمات اللاعبين ----------

function ratingColor(rating: number): string {
  if (rating >= 8) return "bg-emerald-500 text-white";
  if (rating >= 7) return "bg-lime-500 text-white";
  if (rating >= 6) return "bg-amber-500 text-white";
  return "bg-red-500 text-white";
}

function RatingsTab({
  detail,
  onOpenPlayer,
}: {
  detail: WcMatchDetail;
  onOpenPlayer: (playerId: number) => void;
}) {
  if (detail.ratings.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-8">
        تقييمات اللاعبين تظهر هنا بعد انطلاق المباراة
      </p>
    );
  }
  const teamLogo = (teamId: number) =>
    teamId === detail.fixture.home.id ? detail.fixture.home.logo : detail.fixture.away.logo;
  return (
    <div className="space-y-2 py-1">
      {detail.manOfTheMatch && (
        <button
          type="button"
          onClick={() => detail.manOfTheMatch!.id > 0 && onOpenPlayer(detail.manOfTheMatch!.id)}
          disabled={detail.manOfTheMatch.id <= 0}
          className="w-full flex items-center gap-3 rounded-xl bg-gradient-to-l from-amber-500/15 to-transparent ring-1 ring-amber-500/30 px-3.5 py-2.5 text-right hover-elevate active-elevate-2 transition-all disabled:cursor-default"
        >
          <Crown className="h-5 w-5 text-amber-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-bold">رجل المباراة</p>
            <p className="text-sm font-black truncate">{detail.manOfTheMatch.name}</p>
          </div>
          <span className={`rounded-lg px-2 py-1 text-sm font-black tabular-nums ${ratingColor(detail.manOfTheMatch.rating)}`}>
            {detail.manOfTheMatch.rating.toFixed(1)}
          </span>
        </button>
      )}
      {detail.ratings.map((player) => (
        <button
          key={`${player.teamId}-${player.id}`}
          type="button"
          onClick={() => player.id > 0 && onOpenPlayer(player.id)}
          disabled={player.id <= 0}
          className="w-full flex items-center gap-2.5 rounded-lg bg-muted/40 px-3 py-2 text-right hover-elevate active-elevate-2 transition-all disabled:cursor-default"
        >
          <div className="h-8 w-8 rounded-full overflow-hidden bg-muted shrink-0">
            {player.photo && (
              <img src={player.photo} alt={player.name} className="h-full w-full object-cover" loading="lazy" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold truncate">
              {player.name}
              {player.captain && <span className="text-[10px] text-amber-500 ms-1">(ك)</span>}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {player.position}
              {player.minutes ? ` · ${player.minutes} د` : ""}
              {player.goals ? ` · ${player.goals} ⚽` : ""}
              {player.assists ? ` · ${player.assists} صناعة` : ""}
            </p>
          </div>
          <img src={teamLogo(player.teamId)} alt="" className="h-4 w-4 object-contain shrink-0" loading="lazy" />
          <span className={`rounded-md px-1.5 py-0.5 text-xs font-black tabular-nums shrink-0 ${ratingColor(player.rating)}`}>
            {player.rating.toFixed(1)}
          </span>
        </button>
      ))}
    </div>
  );
}

// ---------- الزخم الهجومي (من trends — إضافة Match Facts بـSportMonks) ----------

function MomentumTooltip({
  active,
  payload,
  homeName,
  awayName,
}: {
  active?: boolean;
  payload?: { payload: WcMomentumPoint }[];
  homeName: string;
  awayName: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-md" dir="rtl">
      <p className="font-bold mb-0.5 tabular-nums" dir="ltr">
        ~{p.minute}'
      </p>
      <p className="text-emerald-600">
        {homeName}: <span className="font-bold tabular-nums">{p.home}</span>
      </p>
      <p className="text-rose-600">
        {awayName}: <span className="font-bold tabular-nums">{Math.abs(p.away)}</span>
      </p>
    </div>
  );
}

function PossessionBar({
  home,
  away,
  homeName,
  awayName,
}: {
  home: number;
  away: number;
  homeName: string;
  awayName: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-bold mb-1">
        <span className="text-emerald-600 tabular-nums">{home}%</span>
        <span className="text-muted-foreground">الاستحواذ</span>
        <span className="text-rose-600 tabular-nums">{away}%</span>
      </div>
      {/* بلا dir="ltr": يبقى RTL ليُحاذي الأخضر(المضيف) يمينًا والأحمر(الضيف) يسارًا
          مطابقةً لصفّ النِّسب أعلاه — وإلا انعكس اللون عكس الجهة والنسبة */}
      <div className="flex h-2.5 w-full overflow-hidden rounded-full">
        <div className="bg-emerald-500" style={{ width: `${home}%` }} title={homeName} />
        <div className="bg-rose-500" style={{ width: `${away}%` }} title={awayName} />
      </div>
    </div>
  );
}

function MomentumTab({
  fixtureId,
  live,
  homeName,
  awayName,
}: {
  fixtureId: number;
  live: boolean;
  homeName: string;
  awayName: string;
}) {
  const { data, isLoading } = useQuery<WcMomentum>({
    queryKey: [`/api/world-cup/momentum/${fixtureId}`],
    refetchInterval: live ? 12_000 : false,
  });

  if (isLoading) {
    return (
      <div className="space-y-3 py-3">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }

  const points = Array.isArray(data?.points) ? data!.points : [];
  const possession = data?.possession ?? null;
  // الاستحواذ قد يتوفّر قبل أن يُصدر المزوّد مقياس الزخم — لا نُخفيه معه
  if (points.length === 0 && !possession) {
    return (
      <p className="text-center text-sm text-muted-foreground py-8">
        رسم الزخم يظهر هنا أثناء المباراة
      </p>
    );
  }

  return (
    <div className="space-y-4 py-3">
      {possession && (
        <PossessionBar
          home={possession.home}
          away={possession.away}
          homeName={homeName}
          awayName={awayName}
        />
      )}
      {points.length > 0 ? (
        <div>
          <p className="text-[11px] text-muted-foreground mb-2 text-center">
            الزخم الهجومي اللحظي — أعلى: ضغط {homeName} · أسفل: ضغط {awayName}
          </p>
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barCategoryGap={1}>
                <XAxis
                  dataKey="minute"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(m) => `${m}'`}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis hide />
                <ReferenceLine y={0} stroke="hsl(var(--border))" />
                <RechartsTooltip
                  cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                  content={<MomentumTooltip homeName={homeName} awayName={awayName} />}
                />
                <Bar dataKey="net" radius={[2, 2, 0, 0]}>
                  {points.map((p) => (
                    <Cell key={p.minute} fill={p.net >= 0 ? "#059669" : "#e11d48"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <p className="text-center text-xs text-muted-foreground py-2">
          رسم الزخم الهجومي يظهر فور توفّره أثناء المباراة
        </p>
      )}
    </div>
  );
}

// ---------- مؤشّر الضغط (Pressure Index — إضافة SportMonks) ----------

function PressureTooltip({
  active,
  payload,
  homeName,
  awayName,
}: {
  active?: boolean;
  payload?: { payload: WcPressurePoint }[];
  homeName: string;
  awayName: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-md" dir="rtl">
      <p className="font-bold mb-0.5 tabular-nums" dir="ltr">
        {p.minute}'
      </p>
      <p className="text-emerald-600">
        {homeName}: <span className="font-bold tabular-nums">{Math.round(p.home)}</span>
      </p>
      <p className="text-rose-600">
        {awayName}: <span className="font-bold tabular-nums">{Math.round(Math.abs(p.away))}</span>
      </p>
    </div>
  );
}

function PressureTab({
  fixtureId,
  live,
  homeName,
  awayName,
}: {
  fixtureId: number;
  live: boolean;
  homeName: string;
  awayName: string;
}) {
  const { data, isLoading } = useQuery<WcPressure>({
    queryKey: [`/api/world-cup/pressure/${fixtureId}`],
    refetchInterval: live ? 12_000 : false,
  });

  if (isLoading) {
    return (
      <div className="space-y-3 py-3">
        <Skeleton className="h-5 w-40 mx-auto" />
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }

  const points = Array.isArray(data?.points) ? data!.points : [];
  if (points.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-8">
        مؤشّر الضغط يظهر هنا أثناء المباراة
      </p>
    );
  }

  const latest = data?.latest ?? null;
  const dominant =
    latest && latest.side !== "even"
      ? { name: latest.side === "home" ? homeName : awayName, value: Math.round(latest.value) }
      : null;

  return (
    <div className="space-y-4 py-3">
      {live && dominant && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Gauge className="h-4 w-4 text-emerald-600" />
          <span className="text-muted-foreground">الأكثر سيطرة الآن:</span>
          <span className="font-extrabold">{dominant.name}</span>
          <Badge variant="secondary" className="tabular-nums" dir="ltr">
            {dominant.value}
          </Badge>
        </div>
      )}
      <div>
        <p className="text-[11px] text-muted-foreground mb-2 text-center">
          مؤشّر الضغط لحظة بلحظة — أعلى: سيطرة {homeName} · أسفل: سيطرة {awayName}
        </p>
        <div dir="ltr">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barCategoryGap={0}>
              <XAxis
                dataKey="minute"
                tick={{ fontSize: 10 }}
                tickFormatter={(m) => `${m}'`}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis hide />
              <ReferenceLine y={0} stroke="hsl(var(--border))" />
              <RechartsTooltip
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                content={<PressureTooltip homeName={homeName} awayName={awayName} />}
              />
              <Bar dataKey="net" radius={[1, 1, 0, 0]}>
                {points.map((p) => (
                  <Cell key={p.minute} fill={p.net >= 0 ? "#059669" : "#e11d48"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ---------- التعليق المباشر المترجم (من commentaries) ----------

// أيقونة بحسب نوع اللحظة المُستنتجة من النص العربي (الخادم لا يُرسل نوعًا صريحًا).
function commentaryKind(item: WcCommentaryItem): string {
  if (item.goal) return "goal";
  const t = item.textAr;
  if (t.includes("بطاقة حمراء")) return "red";
  if (t.includes("بطاقة صفراء")) return "yellow";
  if (t.includes("ضربة جزاء")) return "penalty";
  if (t.includes("ركلة ركنية")) return "corner";
  if (t.includes("تبديل")) return "substitution";
  if (t.startsWith("تصدٍّ")) return "shot-saved";
  if (t.startsWith("تسديدة محالة")) return "shot-missed";
  if (t.includes("صافرة النهاية")) return "fulltime";
  if (t.includes("الوقت بدل الضائع")) return "added-time";
  if (t.includes("بداية الشوط") || t.includes("نهاية الشوط")) return "period";
  return "other";
}

function CommentaryIcon({ kind }: { kind: string }) {
  switch (kind) {
    case "goal":
      return <Goal className="h-4 w-4 text-emerald-500" />;
    case "yellow":
      return <Square className="h-4 w-4 fill-yellow-400 text-yellow-400" />;
    case "red":
      return <Square className="h-4 w-4 fill-red-500 text-red-500" />;
    case "penalty":
      return <Goal className="h-4 w-4 text-sky-500" />;
    case "corner":
      return <CornerDownRight className="h-4 w-4 text-sky-500" />;
    case "substitution":
      return <ArrowLeftRight className="h-4 w-4 text-sky-500" />;
    case "shot-saved":
      return <Hand className="h-4 w-4 text-indigo-500" />;
    case "shot-missed":
      return <Rocket className="h-4 w-4 text-muted-foreground" />;
    case "fulltime":
      return <Flag className="h-4 w-4 text-red-500" />;
    case "period":
    case "added-time":
      return <Timer className="h-4 w-4 text-muted-foreground" />;
    default:
      return <Radio className="h-4 w-4 text-muted-foreground" />;
  }
}

function CommentaryTab({ fixtureId, live }: { fixtureId: number; live: boolean }) {
  const { data, isLoading } = useQuery<WcCommentary>({
    queryKey: [`/api/world-cup/commentary/${fixtureId}`],
    refetchInterval: live ? 20_000 : false,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 py-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const items = Array.isArray(data?.items) ? data!.items : [];
  if (items.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-8">
        {live
          ? "التعليق اللحظي يبدأ مع صافرة البداية"
          : "لا يتوفر تعليق لهذه المباراة"}
      </p>
    );
  }

  return (
    <div className="space-y-2 py-1">
      {items.map((item, index) => {
        const kind = commentaryKind(item);
        const highlight = item.goal || item.important;
        return (
          <div
            key={index}
            className={`flex items-start gap-3 rounded-xl px-3 py-2.5 text-right transition-colors ${
              highlight ? "bg-emerald-500/10 ring-1 ring-emerald-500/20" : "bg-muted/40"
            }`}
          >
            <Badge
              variant="secondary"
              className="tabular-nums shrink-0 min-w-[3rem] justify-center"
              dir="ltr"
            >
              {item.minute > 0 ? `${item.minute}'` : "—"}
              {item.minute > 0 && item.extraMinute ? `+${item.extraMinute}` : ""}
            </Badge>
            <CommentaryIcon kind={kind} />
            <p className="text-sm leading-relaxed flex-1 min-w-0">{item.textAr}</p>
          </div>
        );
      })}
    </div>
  );
}

// ---------- قنوات البثّ «أين تُشاهد» (TheSports عبر جسر المباراة) ----------

function MatchTvSection({ fixtureId }: { fixtureId: number }) {
  const { data } = useQuery<{ available: boolean; channels: WcTvChannel[] }>({
    queryKey: [`/api/world-cup/match/${fixtureId}/tv`],
  });
  const channels = Array.isArray(data?.channels) ? data.channels : [];
  if (channels.length === 0) return null;
  return (
    <div className="rounded-xl bg-muted/30 ring-1 ring-border/60 px-3.5 py-2.5 space-y-2">
      <div className="flex items-center gap-1.5">
        <Tv className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-300">أين تُشاهد المباراة</h4>
      </div>
      <div className="flex flex-wrap gap-2">
        {channels.map((c, i) => {
          const inner = (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-background ring-1 ring-border/60 px-2.5 py-1.5 text-xs">
              {c.logo && <img src={c.logo} alt="" className="h-4 w-4 object-contain shrink-0" loading="lazy" />}
              <span className="font-semibold">{c.name}</span>
              {c.country && <span className="text-[10px] text-muted-foreground">{c.country}</span>}
            </span>
          );
          return c.url ? (
            <a
              key={i}
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg hover-elevate active-elevate-2 transition-all"
            >
              {inner}
            </a>
          ) : (
            <div key={i}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- الحوار ----------

export function MatchCenterDialog({ fixtureId, onClose, onOpenPlayer }: MatchCenterDialogProps) {
  const { data: detail, isLoading } = useQuery<WcMatchDetail>({
    queryKey: [`/api/world-cup/match/${fixtureId}`],
    enabled: fixtureId != null,
    // مباراة حية → 8ث لتطازج النتيجة اللحظية (الخادم يركّب نتيجة SportMonks الحيّة)
    refetchInterval: (query) => (query.state.data?.fixture.status.live ? 8_000 : false),
  });

  const fixture = detail?.fixture;

  return (
    <Dialog open={fixtureId != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col [&>button]:left-4 [&>button]:right-auto"
        dir="rtl"
      >
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
                  {/* المضيف معروض يمينًا في RTL — الضيف أولًا داخل LTR ليلاصق كل رقم منتخبه */}
                  {fixture.status.live || fixture.status.finished ? (
                    <span className="text-3xl font-black tabular-nums" dir="ltr">
                      {fixture.goals.away ?? 0} - {fixture.goals.home ?? 0}
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
                    {fixture.status.live && fixture.status.elapsed != null ? (
                      <LiveMinute status={fixture.status} />
                    ) : (
                      fixture.status.label
                    )}
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

        {fixture && !fixture.status.finished && <MatchTvSection fixtureId={fixture.id} />}

        {detail && (
          <Tabs
            defaultValue={detail.fixture.status.live ? "live" : "events"}
            dir="rtl"
            className="flex-1 min-h-0 flex flex-col"
          >
            <TabsList className="self-center flex-wrap h-auto">
              {(detail.fixture.status.live || detail.fixture.status.finished) && (
                <TabsTrigger value="live" className="gap-1">
                  {detail.fixture.status.live && <Radio className="h-3 w-3 animate-pulse text-red-500" />}
                  {detail.fixture.status.live ? "مباشر" : "التعليق"}
                </TabsTrigger>
              )}
              <TabsTrigger value="events">الأحداث</TabsTrigger>
              {(detail.fixture.status.live || detail.fixture.status.finished) && (
                <TabsTrigger value="momentum" className="gap-1">
                  <Activity className="h-3 w-3" />
                  الزخم
                </TabsTrigger>
              )}
              {(detail.fixture.status.live || detail.fixture.status.finished) && (
                <TabsTrigger value="pressure" className="gap-1">
                  <Gauge className="h-3 w-3" />
                  الضغط
                </TabsTrigger>
              )}
              <TabsTrigger value="lineups">التشكيلات</TabsTrigger>
              <TabsTrigger value="stats">الإحصائيات</TabsTrigger>
              {detail.ratings.length > 0 && (
                <TabsTrigger value="ratings" className="gap-1">
                  <Star className="h-3 w-3 text-amber-500" />
                  التقييمات
                </TabsTrigger>
              )}
              <TabsTrigger value="prediction">التوقعات</TabsTrigger>
            </TabsList>
            {/* تمرير أصلي — react-remove-scroll في نافذة Radix يحجب ScrollArea على اللمس */}
            <div
              className="flex-1 mt-3 pe-2 overflow-y-auto overscroll-contain"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <TabsContent value="events" className="mt-0">
                <EventsTab detail={detail} onOpenPlayer={onOpenPlayer} />
              </TabsContent>
              {(detail.fixture.status.live || detail.fixture.status.finished) && (
                <TabsContent value="live" className="mt-0">
                  <CommentaryTab fixtureId={detail.fixture.id} live={detail.fixture.status.live} />
                </TabsContent>
              )}
              {(detail.fixture.status.live || detail.fixture.status.finished) && (
                <TabsContent value="momentum" className="mt-0">
                  <MomentumTab
                    fixtureId={detail.fixture.id}
                    live={detail.fixture.status.live}
                    homeName={detail.fixture.home.name}
                    awayName={detail.fixture.away.name}
                  />
                </TabsContent>
              )}
              {(detail.fixture.status.live || detail.fixture.status.finished) && (
                <TabsContent value="pressure" className="mt-0">
                  <PressureTab
                    fixtureId={detail.fixture.id}
                    live={detail.fixture.status.live}
                    homeName={detail.fixture.home.name}
                    awayName={detail.fixture.away.name}
                  />
                </TabsContent>
              )}
              <TabsContent value="lineups" className="mt-0">
                <LineupsTab lineups={detail.lineups} onOpenPlayer={onOpenPlayer} />
              </TabsContent>
              <TabsContent value="stats" className="mt-0">
                <StatsTab detail={detail} />
              </TabsContent>
              {detail.ratings.length > 0 && (
                <TabsContent value="ratings" className="mt-0">
                  <RatingsTab detail={detail} onOpenPlayer={onOpenPlayer} />
                </TabsContent>
              )}
              <TabsContent value="prediction" className="mt-0">
                <PredictionTab detail={detail} />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
