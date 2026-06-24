import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CalendarDays, MapPin, Radio, Sparkles, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import worldCupEmblem from "@assets/world-cup-2026-emblem.png";
import {
  countdownTo,
  formatKickoffDay,
  formatKickoffTime,
  riyadhDayKey,
  todayRiyadhKey,
  type WcCountdown,
  type WcFixture,
  type WcForecast,
  type WcOverview,
  type WcPrediction,
} from "./wcTypes";
import { LiveMinute } from "./LiveMinute";

interface HeroSectionProps {
  overview: WcOverview | undefined;
  isLoading: boolean;
  onOpenMatch: (fixtureId: number) => void;
}

function TeamSide({
  team,
  align,
  compact = false,
}: {
  team: WcFixture["home"];
  align: "start" | "end";
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center gap-2 sm:gap-3 ${align === "start" ? "sm:items-start" : "sm:items-end"}`}>
      <div
        className={`${
          compact ? "h-12 w-12 sm:h-16 sm:w-16" : "h-16 w-16 sm:h-20 sm:w-20"
        } rounded-full bg-white p-2 ring-4 ring-white/15 shadow-xl`}
      >
        <img src={team.logo} alt={team.name} className="h-full w-full object-contain" loading="lazy" />
      </div>
      <span className={`${compact ? "text-base sm:text-xl" : "text-lg sm:text-2xl"} font-extrabold text-white text-center`}>
        {team.name}
      </span>
    </div>
  );
}

function CountdownChips({ timestamp }: { timestamp: number }) {
  const [countdown, setCountdown] = useState<WcCountdown>(() => countdownTo(timestamp));
  useEffect(() => {
    const interval = setInterval(() => setCountdown(countdownTo(timestamp)), 1000);
    return () => clearInterval(interval);
  }, [timestamp]);

  // موعد الانطلاق حان لكن المزود لم يرفع إشارة «حية» بعد — لا نعرض أصفارًا مجمدة
  if (countdown.total <= 0) {
    return (
      <div className="flex items-center justify-center gap-2 text-sm font-bold text-emerald-100">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300" />
        </span>
        حان موعد الانطلاق — التغطية الحية تبدأ خلال لحظات
      </div>
    );
  }

  const chips = [
    { value: countdown.days, label: "يوم" },
    { value: countdown.hours, label: "ساعة" },
    { value: countdown.minutes, label: "دقيقة" },
    { value: countdown.seconds, label: "ثانية" },
  ];
  return (
    <div className="flex items-center justify-center gap-2" aria-label="العد التنازلي لانطلاق المباراة">
      {chips.map((chip) => (
        <div key={chip.label} className="flex flex-col items-center rounded-xl bg-white/10 px-2.5 py-1.5 min-w-[3.25rem] backdrop-blur-sm">
          <span className="text-xl font-black text-white tabular-nums">{chip.value}</span>
          <span className="text-[10px] text-emerald-100/80">{chip.label}</span>
        </div>
      ))}
    </div>
  );
}

function ProbabilityBar({ fixture, prediction }: { fixture: WcFixture; prediction: WcPrediction }) {
  const total = prediction.home + prediction.draw + prediction.away || 100;
  const pct = (v: number) => Math.round((v / total) * 100);
  return (
    <div className="w-full max-w-md mx-auto space-y-1.5">
      <div className="flex justify-between text-[11px] text-emerald-100/90 font-semibold">
        <span>فوز {fixture.home.name} {pct(prediction.home)}%</span>
        <span className="text-white/60">تعادل {pct(prediction.draw)}%</span>
        <span>فوز {fixture.away.name} {pct(prediction.away)}%</span>
      </div>
      <div className="flex h-2.5 rounded-full overflow-hidden ring-1 ring-white/10">
        <div className="bg-emerald-400" style={{ width: `${pct(prediction.home)}%` }} />
        <div className="bg-zinc-300/60" style={{ width: `${pct(prediction.draw)}%` }} />
        <div className="bg-sky-400" style={{ width: `${pct(prediction.away)}%` }} />
      </div>
      <p className="text-center text-[10px] text-white/40">توقعات خوارزمية للاستئناس من مزود البيانات</p>
    </div>
  );
}

function TodayChip({
  fixture,
  active,
  onOpen,
}: {
  fixture: WcFixture;
  active: boolean;
  onOpen: (id: number) => void;
}) {
  const started = fixture.status.live || fixture.status.finished;
  return (
    <button
      type="button"
      onClick={() => onOpen(fixture.id)}
      title={`${fixture.home.name} × ${fixture.away.name}`}
      data-testid={`wc-today-chip-${fixture.id}`}
      className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-2 ring-1 backdrop-blur-sm transition-colors ${
        active
          ? "bg-emerald-400/15 ring-emerald-300/40"
          : "bg-white/[0.06] ring-white/10 hover:bg-white/[0.12]"
      }`}
    >
      <div className="flex items-center gap-2">
        <img src={fixture.home.logo} alt={fixture.home.name} className="h-6 w-6 rounded-full bg-white p-0.5 object-contain" loading="lazy" />
        {/* الضيف أولًا داخل LTR ليلاصق كل رقم منتخبه — كبطاقة المباراة المميّزة */}
        <span className="min-w-[2.75rem] text-center text-sm font-black text-white tabular-nums" dir="ltr">
          {started ? `${fixture.goals.away ?? 0} - ${fixture.goals.home ?? 0}` : formatKickoffTime(fixture.date)}
        </span>
        <img src={fixture.away.logo} alt={fixture.away.name} className="h-6 w-6 rounded-full bg-white p-0.5 object-contain" loading="lazy" />
      </div>
      <span className="text-[10px] leading-none">
        {fixture.status.live ? (
          <span className="flex items-center gap-1 font-bold text-red-300">
            <Radio className="h-2.5 w-2.5 animate-pulse" />
            <LiveMinute status={fixture.status} />
          </span>
        ) : (
          <span className="text-emerald-100/50">{fixture.status.finished ? "انتهت" : "لم تبدأ"}</span>
        )}
      </span>
    </button>
  );
}

function TodayStrip({
  matches,
  activeId,
  onOpenMatch,
}: {
  matches: WcFixture[];
  activeId: number | undefined;
  onOpenMatch: (id: number) => void;
}) {
  // لا مباريات متبقية للعرض في الشريط
  if (matches.length === 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.2 }}
      className="mx-auto max-w-3xl mt-5"
    >
      <div className="mb-3 flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-100/80">
        <CalendarDays className="h-3.5 w-3.5" />
        مباريات اليوم
        <span className="text-emerald-100/50">({matches.length})</span>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {matches.map((f) => (
          <TodayChip key={f.id} fixture={f} active={f.id === activeId} onOpen={onOpenMatch} />
        ))}
      </div>
    </motion.div>
  );
}

// شريط احتمالات النتيجة لبطاقة Hero. المباراة المميّزة تأتيها التوقعات جاهزة
// من overview؛ أما البطاقات المتزامنة الأخرى فنجلب احتمالاتها حسب الطلب من
// /api/world-cup/forecast/:id (نفس مصدر مركز المباراة) لتظهر التوقعات لكلٍّ منها.
function HeroPrediction({
  fixture,
  prediction,
}: {
  fixture: WcFixture;
  prediction?: WcPrediction | null;
}) {
  const { data } = useQuery<WcForecast>({
    queryKey: [`/api/world-cup/forecast/${fixture.id}`],
    enabled: !prediction && !fixture.status.finished,
    staleTime: 5 * 60_000,
  });
  const ft = prediction
    ? { home: prediction.home, draw: prediction.draw, away: prediction.away }
    : data?.fulltime ?? null;
  if (!ft) return null;
  return (
    <ProbabilityBar
      fixture={fixture}
      prediction={{ ...ft, advice: prediction?.advice ?? null }}
    />
  );
}

function MatchHeroCard({
  fixture,
  prediction,
  onOpenMatch,
  compact = false,
}: {
  fixture: WcFixture;
  prediction?: WcPrediction | null;
  onOpenMatch: (id: number) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`h-full rounded-3xl bg-white/[0.06] ${
        compact ? "p-5 sm:p-6" : "p-6 sm:p-8"
      } ring-1 ring-white/10 backdrop-blur-md shadow-2xl`}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-emerald-100/70">
          <span className="font-bold text-emerald-200">
            {fixture.status.live
              ? "تجري الآن"
              : riyadhDayKey(fixture.date) === todayRiyadhKey()
                ? "مباراة اليوم"
                : "المباراة القادمة"}
          </span>
          <span>·</span>
          <span>{fixture.round}</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {fixture.venue.name} — {fixture.venue.city}
          </span>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-6">
          <TeamSide team={fixture.home} align="end" compact={compact} />

          <div className="flex flex-col items-center gap-2 min-w-[7rem]">
            {fixture.status.live || fixture.status.finished ? (
              <>
                {/* المضيف معروض يمينًا في RTL — الضيف أولًا داخل LTR ليلاصق كل رقم منتخبه */}
                <div className="text-4xl sm:text-5xl font-black text-white tabular-nums" dir="ltr">
                  {fixture.goals.away ?? 0} - {fixture.goals.home ?? 0}
                </div>
                {fixture.penalties && (
                  <span className="text-xs text-emerald-100/80" dir="ltr">
                    ({fixture.penalties.away} - {fixture.penalties.home}) ركلات الترجيح
                  </span>
                )}
                <Badge
                  className={
                    fixture.status.live
                      ? "bg-red-500 text-white border-0 gap-1"
                      : "bg-white/10 text-emerald-100 border-0"
                  }
                >
                  {fixture.status.live && <Radio className="h-3 w-3 animate-pulse" />}
                  {fixture.status.live && fixture.status.elapsed != null ? (
                    <>
                      {fixture.status.label} — <LiveMinute status={fixture.status} />
                    </>
                  ) : (
                    fixture.status.label
                  )}
                </Badge>
              </>
            ) : (
              <>
                <div className="text-2xl sm:text-3xl font-black text-white">
                  {formatKickoffTime(fixture.date)}
                </div>
                <span className="flex items-center gap-1 text-xs text-emerald-100/70">
                  <CalendarDays className="h-3 w-3" />
                  {formatKickoffDay(fixture.date)}
                </span>
              </>
            )}
          </div>

          <TeamSide team={fixture.away} align="start" compact={compact} />
        </div>

        {!fixture.status.live && !fixture.status.finished && (
          <CountdownChips timestamp={fixture.timestamp} />
        )}

        {!fixture.status.finished && (
          <HeroPrediction fixture={fixture} prediction={prediction} />
        )}

        <div className="flex justify-center">
          <Button
            onClick={() => onOpenMatch(fixture.id)}
            className="bg-emerald-400 text-emerald-950 hover:bg-emerald-300 font-bold rounded-full px-6"
          >
            مركز المباراة
          </Button>
        </div>
      </div>
    </div>
  );
}

export function HeroSection({ overview, isLoading, onOpenMatch }: HeroSectionProps) {
  const motd = overview?.matchOfTheDay ?? null;
  const fixture = motd?.fixture;
  const today = Array.isArray(overview?.today) ? overview.today : [];
  const liveMatches = Array.isArray(overview?.live)
    ? overview.live.filter((f) => f.status.live)
    : [];
  const liveCount = liveMatches.length;

  // مباريات قادمة تنطلق في التوقيت نفسه للمباراة المميّزة (لم تبدأ بعد)
  const upcomingPeers =
    fixture && !fixture.status.live && !fixture.status.finished
      ? today.filter(
          (f) => !f.status.live && !f.status.finished && f.timestamp === fixture.timestamp
        )
      : [];

  // أبرز كل المباريات المتزامنة ببطاقات كبيرة بدل إبراز واحدة وحشر الباقي:
  //  • مباراتان (أو أكثر) تجريان الآن في وقت واحد، أو
  //  • مباراتان قادمتان تنطلقان في التوقيت نفسه (ختام دور المجموعات تحديدًا)
  const multiHero = liveCount >= 2 || upcomingPeers.length >= 2;
  const heroFixtures = !multiHero
    ? fixture
      ? [fixture]
      : []
    : liveCount >= 2
      ? liveMatches
      : upcomingPeers;
  const heroIds = new Set(heroFixtures.map((f) => f.id));
  // متعدد: الشريط يعرض بقية مباريات اليوم فقط (تفاديًا لتكرار البطاقات الكبيرة).
  // مفرد: يعرض كل مباريات اليوم مع إبراز البطاقة المميّزة — كما كان.
  const stripMatches = multiHero ? today.filter((f) => !heroIds.has(f.id)) : today;
  const showStrip = multiHero ? stripMatches.length >= 1 : today.length >= 2;

  return (
    <section dir="rtl" className="relative overflow-hidden">
      {/* أرضية الملعب الليلي */}
      <div className="absolute inset-0 bg-gradient-to-bl from-emerald-950 via-[#04261b] to-[#063828]" />
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, rgba(255,255,255,0.6) 0 90px, transparent 90px 180px)",
        }}
      />
      {/* دائرة منتصف الملعب + أضواء الكشافات */}
      <div className="absolute -bottom-56 left-1/2 -translate-x-1/2 h-[480px] w-[480px] rounded-full border-2 border-white/[0.07]" />
      <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-emerald-400/15 blur-3xl" />
      <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-sky-400/10 blur-3xl" />

      <div className="relative container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        {/* ترويسة القسم */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center text-center gap-3 mb-8"
        >
          <div className="rounded-2xl bg-white px-4 py-3 shadow-2xl ring-1 ring-white/20">
            <img
              src={worldCupEmblem}
              alt="شعار كأس العالم 2026"
              className="h-20 w-auto object-contain"
              width={233}
              height={360}
              loading="eager"
              decoding="async"
            />
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-400/15 text-emerald-200 border border-emerald-300/20 gap-1.5 px-3 py-1">
              <Trophy className="h-3.5 w-3.5" />
              تغطية خاصة
            </Badge>
            {liveCount > 0 && (
              <Badge className="bg-red-500 text-white border-0 gap-1.5 px-3 py-1">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                </span>
                {liveCount === 1 ? "مباراة مباشرة الآن" : `${liveCount} مباريات مباشرة`}
              </Badge>
            )}
          </div>
          <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight">
            مونديال <span className="text-emerald-300">2026</span>
          </h1>
          <p className="text-sm sm:text-base text-emerald-100/70 max-w-xl">
            48 منتخبًا · 16 ملعبًا · ثلاث دول مضيفة — تغطية حية لحظة بلحظة بتوقيت الرياض
          </p>
        </motion.div>

        {/* بطاقة مباراة اليوم — أو بطاقة كبيرة لكل مباراة تجري الآن في وقت واحد */}
        {isLoading && (
          <div className="mx-auto max-w-3xl rounded-3xl bg-white/[0.06] p-6 sm:p-8 ring-1 ring-white/10 backdrop-blur-md shadow-2xl">
            <div className="space-y-4">
              <Skeleton className="h-5 w-40 mx-auto bg-white/10" />
              <div className="flex items-center justify-between">
                <Skeleton className="h-20 w-20 rounded-full bg-white/10" />
                <Skeleton className="h-10 w-28 bg-white/10" />
                <Skeleton className="h-20 w-20 rounded-full bg-white/10" />
              </div>
            </div>
          </div>
        )}

        {!isLoading && heroFixtures.length === 0 && (
          <div className="mx-auto max-w-3xl rounded-3xl bg-white/[0.06] p-6 sm:p-8 ring-1 ring-white/10 backdrop-blur-md shadow-2xl">
            <div className="text-center text-emerald-100/80 py-6 flex flex-col items-center gap-2">
              <Sparkles className="h-8 w-8 text-emerald-300" />
              <p className="font-bold text-white">تغطية المونديال تنطلق قريبًا</p>
              <p className="text-sm">تابعنا — جدول المباريات والنتائج الحية ستجدها هنا أولًا بأول</p>
            </div>
          </div>
        )}

        {!isLoading && heroFixtures.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
            className={`mx-auto ${
              multiHero ? "max-w-5xl grid gap-4 sm:gap-6 md:grid-cols-2" : "max-w-3xl"
            }`}
          >
            {heroFixtures.map((f) => (
              <MatchHeroCard
                key={f.id}
                fixture={f}
                prediction={f.id === fixture?.id ? motd?.prediction : null}
                onOpenMatch={onOpenMatch}
                compact={multiHero}
              />
            ))}
          </motion.div>
        )}

        {/* شريط مباريات اليوم — بقية مباريات اليوم غير المعروضة كبطاقات كبيرة */}
        {!isLoading && showStrip && (
          <TodayStrip
            matches={stripMatches}
            activeId={multiHero ? undefined : fixture?.id}
            onOpenMatch={onOpenMatch}
          />
        )}
      </div>
    </section>
  );
}
