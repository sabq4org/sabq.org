/**
 * مركز مباراة كأس الملك — نافذة مبوّبة على مرآة GcMatchCenterDialog (النسخة
 * الرشيقة من مركز المونديال) بلمسة الكأس الذهبية:
 * ترويسة نتيجة داكنة + شريط احتمالات (API-Football) + قنوات البث (TheSports)
 * + تبويبات: الأحداث / التشكيلات (بالبدلاء والمدرب) / الإحصائيات / التقييمات.
 * البيانات من /api/kings-cup/match/:id وتوابعها، وتُحدَّث كل 15ث أثناء البث.
 */
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  BarChart3,
  Goal,
  ListOrdered,
  MapPin,
  MonitorPlay,
  Radio,
  ShieldAlert,
  Square,
  Star,
  Tv,
  Users,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toBinaryPlayerName } from "@shared/sportsNames";
import { PenaltyResult } from "../worldcup/PenaltyResult";
import { LiveMinute } from "../worldcup/LiveMinute";
import { KcPredictionsMatchPromo } from "./KcPredictionsPromo";
import { KcProbabilityBar } from "./KcProbabilityBar";
import {
  elapsedLabel,
  formatKickoffDay,
  formatKickoffTime,
  type KcFixture,
  type KcLineup,
  type KcMatchDetail,
  type KcMatchEvent,
  type KcMatchRatings,
  type KcMatchTv,
  type KcPrediction,
} from "./kcTypes";

function KcEventIcon({ type }: { type: string }) {
  if (type === "goal") return <Goal className="h-4 w-4 text-emerald-500" />;
  if (type === "missed-penalty") return <ShieldAlert className="h-4 w-4 text-red-500" />;
  if (type === "yellow-card") return <Square className="h-4 w-4 fill-yellow-400 text-yellow-400" />;
  if (type === "red-card") return <Square className="h-4 w-4 fill-red-500 text-red-500" />;
  if (type === "substitution") return <ArrowLeftRight className="h-4 w-4 text-sky-500" />;
  if (/var/i.test(type)) return <MonitorPlay className="h-4 w-4 text-purple-500" />;
  return <Radio className="h-4 w-4 text-muted-foreground" />;
}

function KcTimelineChip({
  ev,
  side,
  onOpenPlayer,
}: {
  ev: KcMatchEvent;
  side: "home" | "away";
  onOpenPlayer?: (id: number) => void;
}) {
  const isGoal = ev.type === "goal";
  const isSub = ev.type === "substitution";
  const playerName = toBinaryPlayerName(ev.player || ev.label);
  const assistName = ev.assist ? toBinaryPlayerName(ev.assist) : null;
  const clickable = (ev.playerId ?? 0) > 0 && onOpenPlayer != null;

  const content = (
    <div
      className={`inline-flex items-start gap-2 max-w-full rounded-lg px-2.5 py-1.5 ${
        isGoal ? "bg-emerald-500/10 ring-1 ring-emerald-500/25" : "bg-muted/40"
      } ${side === "home" ? "flex-row" : "flex-row-reverse"}`}
    >
      <span className="mt-0.5 shrink-0">
        <KcEventIcon type={ev.type} />
      </span>
      <div className="min-w-0" dir="rtl">
        <p className="text-xs font-bold truncate">{playerName}</p>
        {assistName && isGoal && (
          <p className="text-[10px] text-muted-foreground truncate">صناعة: {assistName}</p>
        )}
        {assistName && isSub && (
          <p className="text-[10px] text-muted-foreground truncate">بديلًا عن: {assistName}</p>
        )}
        {!isGoal && !isSub && ev.label && ev.label !== ev.player && (
          <p className="text-[10px] text-muted-foreground truncate">{ev.label}</p>
        )}
      </div>
    </div>
  );

  if (clickable) {
    return (
      <button
        type="button"
        onClick={() => onOpenPlayer(ev.playerId!)}
        className="text-right hover-elevate active-elevate-2 transition-all rounded-lg"
      >
        {content}
      </button>
    );
  }

  return content;
}

function EventsTimeline({
  events,
  fixture,
  onOpenPlayer,
}: {
  events: KcMatchEvent[];
  fixture: KcFixture;
  onOpenPlayer?: (id: number) => void;
}) {
  if (events.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {fixture.status.finished || fixture.status.live
          ? "لا توجد أحداث مسجلة لهذه المباراة"
          : "الأحداث تظهر هنا لحظة بلحظة مع انطلاق المباراة"}
      </p>
    );
  }

  // ترتيب تنازلي زمنيًا (الأحدث أعلى)، كما في بطولة روشن والمونديال
  const sorted = [...events].sort(
    (a, b) => (b.minute ?? 0) - (a.minute ?? 0) || (b.extra ?? 0) - (a.extra ?? 0)
  );

  return (
    <div className="lg:max-w-2xl lg:mx-auto py-2">
      {/* رأس الجانبين: المضيف يمينًا، الضيف يسارًا */}
      <div dir="ltr" className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mb-3 px-1">
        <div className="flex items-center gap-1.5 justify-end min-w-0">
          <span className="text-xs font-bold truncate">{fixture.away.name}</span>
          {fixture.away.logo && (
            <img src={fixture.away.logo} alt="" className="h-5 w-5 object-contain shrink-0" loading="lazy" />
          )}
        </div>
        <span className="min-w-[2.75rem]" />
        <div className="flex items-center gap-1.5 justify-start min-w-0">
          {fixture.home.logo && (
            <img src={fixture.home.logo} alt="" className="h-5 w-5 object-contain shrink-0" loading="lazy" />
          )}
          <span className="text-xs font-bold truncate">{fixture.home.name}</span>
        </div>
      </div>

      {/* الخط الزمني: عمود مركزي لأقراص الدقائق (مطابق لبطولة روشن) */}
      <div className="relative">
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-emerald-500/20" />
        <div className="space-y-1.5">
          {sorted.map((e, i) => {
            const isHome = e.teamId === fixture.home.id;
            return (
              <div key={i} dir="ltr" className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div className="flex justify-end min-w-0">
                  {!isHome && (
                    <KcTimelineChip ev={e} side="away" onOpenPlayer={onOpenPlayer} />
                  )}
                </div>
                <span className="z-[1] grid place-items-center min-w-[2.75rem] rounded-full bg-emerald-600 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white">
                  {e.minute ?? 0}&apos;{e.extra ? `+${e.extra}` : ""}
                </span>
                <div className="flex justify-start min-w-0">
                  {isHome && (
                    <KcTimelineChip ev={e} side="home" onOpenPlayer={onOpenPlayer} />
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

function LineupColumn({
  lineup,
  onOpenPlayer,
}: {
  lineup: KcLineup;
  onOpenPlayer?: (id: number) => void;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2">
        <div className="flex items-center gap-2">
          <img src={lineup.team.logo} alt="" className="h-5 w-5 object-contain" />
          <p className="font-black text-foreground text-sm truncate">{lineup.team.name}</p>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {lineup.formation ? `الخطة ${lineup.formation}` : ""}
          {lineup.coach ? `${lineup.formation ? " · " : ""}المدرب: ${toBinaryPlayerName(lineup.coach)}` : ""}
        </p>
      </div>
      <ul className="space-y-1">
        {lineup.startXI.map((p) => (
          <li key={`${p.id}-${p.number}`}>
            <button
              type="button"
              onClick={() => p.id > 0 && onOpenPlayer?.(p.id)}
              className="flex items-center gap-2 text-sm hover:text-emerald-600 text-right w-full"
            >
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-[10px] font-black text-emerald-700 dark:text-emerald-300 tabular-nums">
                {p.number ?? "–"}
              </span>
              <span className="truncate">{toBinaryPlayerName(p.name)}</span>
            </button>
          </li>
        ))}
      </ul>
      {lineup.substitutes.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] font-bold text-muted-foreground">
            البدلاء ({lineup.substitutes.length})
          </summary>
          <ul className="mt-1 space-y-1">
            {lineup.substitutes.map((p) => (
              <li key={`${p.id}-${p.number}`}>
                <button
                  type="button"
                  onClick={() => p.id > 0 && onOpenPlayer?.(p.id)}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-emerald-600 text-right w-full"
                >
                  <span className="tabular-nums w-5 text-center shrink-0">{p.number ?? "–"}</span>
                  <span className="truncate">{toBinaryPlayerName(p.name)}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function StatBar({ label, home, away }: { label: string; home: string | number | null; away: string | number | null }) {
  const num = (v: string | number | null) => Number(String(v ?? 0).replace("%", "")) || 0;
  const h = num(home);
  const a = num(away);
  const total = h + a;
  const homePct = total > 0 ? (h / total) * 100 : 50;
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-bold text-foreground">
        <span className="tabular-nums">{home ?? 0}</span>
        <span className="text-muted-foreground font-semibold">{label}</span>
        <span className="tabular-nums">{away ?? 0}</span>
      </div>
      <div className="mt-1 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-muted" dir="rtl">
        <div className="bg-emerald-500" style={{ width: `${homePct}%` }} />
        <div className="bg-amber-400" style={{ width: `${100 - homePct}%` }} />
      </div>
    </div>
  );
}

function RatingsBlock({
  ratings,
  fixture,
  onOpenPlayer,
}: {
  ratings: KcMatchRatings | null | undefined;
  fixture: KcFixture;
  onOpenPlayer?: (id: number) => void;
}) {
  const players = Array.isArray(ratings?.players) ? ratings.players : [];
  if (players.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        تظهر تقييمات اللاعبين هنا بعد انطلاق المباراة
      </p>
    );
  }
  const motm = ratings?.motm ?? null;
  const columns = [fixture.home, fixture.away].map((team) => ({
    team,
    players: players
      .filter((p) => p.teamId === team.id && p.rating != null)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 11),
  }));
  return (
    <div className="space-y-4 py-2">
      {motm && (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-amber-400/10 px-3 py-2 text-sm ring-1 ring-amber-400/30">
          <Star className="h-4 w-4 text-amber-500 fill-amber-400" />
          <span className="font-black">رجل المباراة:</span>
          <span className="font-bold truncate">{toBinaryPlayerName(motm.name)}</span>
          <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-black text-emerald-950 tabular-nums">
            {motm.rating.toFixed(1)}
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        {columns.map(({ team, players: teamPlayers }) => (
          <div key={team.id} className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <img src={team.logo} alt="" className="h-5 w-5 object-contain" />
              <span className="text-xs font-bold truncate">{team.name}</span>
            </div>
            <ul className="space-y-1">
              {teamPlayers.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => p.id > 0 && onOpenPlayer?.(p.id)}
                    className="flex w-full items-center justify-between gap-2 text-xs hover:text-emerald-600 text-right"
                  >
                    <span className="truncate">{toBinaryPlayerName(p.name)}</span>
                    <span
                      className={`shrink-0 rounded-md px-1.5 py-0.5 font-black tabular-nums text-white ${
                        (p.rating ?? 0) >= 7.5 ? "bg-emerald-500" : (p.rating ?? 0) >= 6.5 ? "bg-emerald-600/70" : "bg-zinc-400"
                      }`}
                    >
                      {(p.rating ?? 0).toFixed(1)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export function KcMatchDialog({
  fixtureId,
  onClose,
  onOpenPlayer,
}: {
  fixtureId: number | null;
  onClose: () => void;
  onOpenPlayer?: (id: number) => void;
}) {
  const { data, isLoading } = useQuery<KcMatchDetail>({
    queryKey: [`/api/kings-cup/match/${fixtureId}`],
    enabled: fixtureId != null,
    // الفتح يجلب دائمًا (staleTime العام كان يعيد لقطة «قادمة» قديمة)، وحول
    // الانطلاق نلتقط تحوّل قادمة→مباشر — نفس إيقاع مركز مباراة خليجي.
    refetchOnMount: "always",
    refetchInterval: (query) => {
      const f = query.state.data?.fixture;
      if (!f) return false;
      if (f.status.live) return 8_000;
      if (f.status.finished) return false;
      const msToKickoff = f.timestamp * 1000 - Date.now();
      return msToKickoff <= 30 * 60_000 && msToKickoff > -2 * 3_600_000 ? 25_000 : false;
    },
    refetchIntervalInBackground: false,
  });

  const fx = data?.fixture;
  const started = fx ? fx.status.live || fx.status.finished : false;

  const { data: predictionData } = useQuery<{ prediction: KcPrediction | null }>({
    queryKey: [`/api/kings-cup/match/${fixtureId}/prediction`],
    enabled: fixtureId != null && fx != null && !fx.status.finished,
    staleTime: 5 * 60_000,
  });
  const prediction = predictionData?.prediction ?? null;

  const { data: tvData } = useQuery<KcMatchTv>({
    queryKey: [`/api/kings-cup/match/${fixtureId}/tv`],
    enabled: fixtureId != null,
    staleTime: 10 * 60_000,
  });
  const tvChannels = tvData?.available && Array.isArray(tvData.channels) ? tvData.channels : [];

  const { data: ratings } = useQuery<KcMatchRatings | null>({
    queryKey: [`/api/kings-cup/match/${fixtureId}/player-stats`],
    enabled: fixtureId != null && started,
    staleTime: 60_000,
    refetchInterval: fx?.status.live ? 60_000 : false,
    refetchIntervalInBackground: false,
  });

  return (
    <Dialog open={fixtureId != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[85vh] overflow-y-auto p-0 gap-0">
        {/* ترويسة النتيجة بهوية الكأس: أخضر داكن + توهّج ذهبي */}
        <div className="relative overflow-hidden bg-gradient-to-bl from-emerald-950 via-[#04261b] to-[#063828] px-5 pb-5 pt-4">
          <div className="absolute -top-16 -left-10 h-40 w-40 rounded-full bg-amber-400/10 blur-3xl" />
          <DialogHeader className="mb-3">
            <DialogTitle className="text-right text-xs font-bold text-emerald-100/70">
              {fx ? (
                <>
                  <span className="text-amber-300">{fx.round}</span> · {formatKickoffDay(fx.date)}
                </>
              ) : (
                "مركز المباراة"
              )}
            </DialogTitle>
          </DialogHeader>

          {isLoading || !fx ? (
            <div className="flex items-center justify-center gap-6 py-2">
              <Skeleton className="h-16 w-16 rounded-full bg-white/10" />
              <Skeleton className="h-8 w-16 bg-white/10" />
              <Skeleton className="h-16 w-16 rounded-full bg-white/10" />
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="flex flex-col items-center gap-2 min-w-0">
                <div className="h-16 w-16 rounded-full bg-white p-1.5 ring-2 ring-amber-300/30 shadow">
                  <img src={fx.home.logo} alt={fx.home.name} className="h-full w-full object-contain" />
                </div>
                <span className="text-sm font-bold text-white text-center truncate w-full">{fx.home.name}</span>
              </div>
              <div className="flex flex-col items-center gap-1 px-2">
                {started ? (
                  <>
                    {/* المضيف يمينًا في RTL — الضيف أولًا داخل LTR ليلاصق كل رقم فريقه */}
                    <span className="text-4xl font-black text-white tabular-nums" dir="ltr">
                      {fx.goals.away ?? 0} - {fx.goals.home ?? 0}
                    </span>
                    <PenaltyResult fixture={fx} className="text-[11px] text-emerald-100/80" />
                    {fx.status.live ? (
                      <span className="flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-0.5 text-[11px] font-black text-white">
                        <Radio className="h-3 w-3 animate-pulse" />
                        {fx.status.elapsed != null ? <LiveMinute status={fx.status} /> : elapsedLabel(fx.status)}
                      </span>
                    ) : (
                      <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-100">
                        {fx.status.label}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-2xl font-black text-white">{formatKickoffTime(fx.date)}</span>
                    <span className="text-[11px] text-emerald-100/70">بتوقيت الرياض</span>
                  </>
                )}
              </div>
              <div className="flex flex-col items-center gap-2 min-w-0">
                <div className="h-16 w-16 rounded-full bg-white p-1.5 ring-2 ring-amber-300/30 shadow">
                  <img src={fx.away.logo} alt={fx.away.name} className="h-full w-full object-contain" />
                </div>
                <span className="text-sm font-bold text-white text-center truncate w-full">{fx.away.name}</span>
              </div>
            </div>
          )}

          {fx?.venue?.name && (
            <p className="mt-3 flex items-center justify-center gap-1 text-[11px] text-emerald-100/60">
              <MapPin className="h-3 w-3" />
              {fx.venue.name}
              {fx.venue.city ? ` — ${fx.venue.city}` : ""}
            </p>
          )}
        </div>

        {fx && (
          <div className="p-4 space-y-4">
            {/* دعوة التوقع — قبل صافرة البداية فقط، وتختفي ما دامت البطولة غير مفعّلة */}
            {!fx.status.live && !fx.status.finished && (
              <KcPredictionsMatchPromo
                fixtureId={fx.id}
                homeName={fx.home?.name}
                awayName={fx.away?.name}
              />
            )}

            {/* شريط الاحتمالات — قبل المباراة وأثناءها */}
            {prediction && !fx.status.finished && (
              <div className="rounded-2xl bg-muted/40 px-3 py-3">
                <KcProbabilityBar fixture={fx} prediction={prediction} tone="light" />
              </div>
            )}

            {/* أين تشاهد المباراة (TheSports — يختفي بصمت إن لم تتوفر القنوات) */}
            {tvChannels.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-muted/40 px-3 py-2.5">
                <span className="flex items-center gap-1.5 text-xs font-black text-foreground">
                  <Tv className="h-3.5 w-3.5 text-emerald-600" />
                  أين تشاهد:
                </span>
                {tvChannels.map((ch) => (
                  <span key={ch.name} className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                    {ch.name}
                  </span>
                ))}
              </div>
            )}

            <Tabs defaultValue={started ? "events" : "lineups"} dir="rtl">
              <TabsList className="w-full grid grid-cols-4">
                <TabsTrigger value="events" className="gap-1 text-xs">
                  <ListOrdered className="h-3.5 w-3.5" />
                  الأحداث
                </TabsTrigger>
                <TabsTrigger value="lineups" className="gap-1 text-xs">
                  <Users className="h-3.5 w-3.5" />
                  التشكيلات
                </TabsTrigger>
                <TabsTrigger value="stats" className="gap-1 text-xs">
                  <BarChart3 className="h-3.5 w-3.5" />
                  الإحصائيات
                </TabsTrigger>
                <TabsTrigger value="ratings" className="gap-1 text-xs">
                  <Star className="h-3.5 w-3.5" />
                  التقييمات
                </TabsTrigger>
              </TabsList>

              <TabsContent value="events">
                {data && <EventsTimeline events={data.events} fixture={fx} onOpenPlayer={onOpenPlayer} />}
              </TabsContent>

              <TabsContent value="lineups">
                {data && data.lineups.length === 2 ? (
                  <div className="grid grid-cols-2 gap-4 py-2">
                    {data.lineups.map((l) => (
                      <LineupColumn key={l.team.id} lineup={l} onOpenPlayer={onOpenPlayer} />
                    ))}
                  </div>
                ) : (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    تُعلن التشكيلات قبل انطلاق المباراة بنحو ساعة
                  </p>
                )}
              </TabsContent>

              <TabsContent value="stats">
                {data?.statistics && data.statistics.rows.length > 0 ? (
                  <div className="space-y-3 py-2">
                    {data.statistics.rows.map((r) => (
                      <StatBar key={r.type} label={r.label} home={r.home} away={r.away} />
                    ))}
                  </div>
                ) : (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    تظهر إحصائيات المباراة هنا بعد الانطلاق
                  </p>
                )}
              </TabsContent>

              <TabsContent value="ratings">
                <RatingsBlock ratings={ratings} fixture={fx} onOpenPlayer={onOpenPlayer} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
