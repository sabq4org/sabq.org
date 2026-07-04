/**
 * هيرو «كأس خادم الحرمين الشريفين» — نفس تكوين هيرو المونديال (HeroSection):
 * أرضية الملعب الليلي، بطاقة الشعار، الشارات، بطاقة المباراة الكبيرة بعدّادها
 * التنازلي، وشريط مباريات اليوم — مع لمسة الكأس الذهبية بدل الأخضر المونديالي.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, MapPin, Radio, Sparkles, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import kingsCupLogo from "@assets/kings-cup-logo.png";
import { LiveMinute } from "../worldcup/LiveMinute";
import { PenaltyResult } from "../worldcup/PenaltyResult";
import { KcProbabilityBar } from "./KcProbabilityBar";
import {
  countdownTo,
  formatKickoffDay,
  formatKickoffTime,
  riyadhDayKey,
  todayRiyadhKey,
  type KcChampion,
  type KcFixture,
  type KcOverview,
  type KcPrediction,
} from "./kcTypes";

interface KcHeroProps {
  overview: KcOverview | undefined;
  /** الجدول الكامل — لاشتقاق «يوم الجولة» القادم عندما لا توجد مباريات اليوم */
  fixtures?: KcFixture[];
  isLoading: boolean;
  onOpenMatch: (fixtureId: number) => void;
}

function TeamSide({
  team,
  align,
  compact = false,
}: {
  team: KcFixture["home"];
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
  const [countdown, setCountdown] = useState(() => countdownTo(timestamp));
  useEffect(() => {
    const interval = setInterval(() => setCountdown(countdownTo(timestamp)), 1000);
    return () => clearInterval(interval);
  }, [timestamp]);

  // موعد الانطلاق حان لكن المزود لم يرفع إشارة «حية» بعد — لا نعرض أصفارًا مجمدة
  if (countdown.total <= 0) {
    return (
      <div className="flex items-center justify-center gap-2 text-sm font-bold text-amber-200">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-300" />
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

function TodayChip({
  fixture,
  active,
  onOpen,
}: {
  fixture: KcFixture;
  active: boolean;
  onOpen: (id: number) => void;
}) {
  const started = fixture.status.live || fixture.status.finished;
  return (
    <button
      type="button"
      onClick={() => onOpen(fixture.id)}
      title={`${fixture.home.name} × ${fixture.away.name}`}
      data-testid={`kc-today-chip-${fixture.id}`}
      className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-2 ring-1 backdrop-blur-sm transition-colors ${
        active
          ? "bg-amber-400/15 ring-amber-300/40"
          : "bg-white/[0.06] ring-white/10 hover:bg-white/[0.12]"
      }`}
    >
      <div className="flex items-center gap-2">
        <img src={fixture.home.logo} alt={fixture.home.name} className="h-6 w-6 rounded-full bg-white p-0.5 object-contain" loading="lazy" />
        {/* الضيف أولًا داخل LTR ليلاصق كل رقم فريقه — كبطاقة المباراة المميّزة */}
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
  matches: KcFixture[];
  activeId: number | undefined;
  onOpenMatch: (id: number) => void;
}) {
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

function MatchHeroCard({
  fixture,
  prediction = null,
  onOpenMatch,
  compact = false,
}: {
  fixture: KcFixture;
  /** احتمالات الفوز للمباراة المميّزة — تصل جاهزة ضمن overview */
  prediction?: KcPrediction | null;
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
          <span className="font-bold text-amber-200">
            {fixture.status.live
              ? "تجري الآن"
              : riyadhDayKey(fixture.date) === todayRiyadhKey()
                ? "مباراة اليوم"
                : "المباراة القادمة"}
          </span>
          <span>·</span>
          <span>{fixture.round}</span>
          {fixture.venue.name && (
            <>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {fixture.venue.name}
                {fixture.venue.city ? ` — ${fixture.venue.city}` : ""}
              </span>
            </>
          )}
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-6">
          <TeamSide team={fixture.home} align="end" compact={compact} />

          <div className="flex flex-col items-center gap-2 min-w-[7rem]">
            {fixture.status.live || fixture.status.finished ? (
              <>
                {/* المضيف معروض يمينًا في RTL — الضيف أولًا داخل LTR ليلاصق كل رقم فريقه */}
                <div className="text-4xl sm:text-5xl font-black text-white tabular-nums" dir="ltr">
                  {fixture.goals.away ?? 0} - {fixture.goals.home ?? 0}
                </div>
                <PenaltyResult fixture={fixture} className="text-xs text-emerald-100/90" />
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

        {/* شريط الاحتمالات — قبل المباراة وأثناءها؛ يختفي بعد النهاية */}
        {prediction && !fixture.status.finished && (
          <KcProbabilityBar fixture={fixture} prediction={prediction} tone="dark" />
        )}

        <div className="flex justify-center">
          <Button
            onClick={() => onOpenMatch(fixture.id)}
            className="bg-amber-300 text-emerald-950 hover:bg-amber-200 font-bold rounded-full px-6"
          >
            مركز المباراة
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * بطاقة «يوم الجولة» — أدوار الكأس المبكرة تُلعب دفعة واحدة (حتى 16 مباراة في
 * يوم وبتوقيت واحد)، فلا معنى لإبراز مباراة اعتباطية ولا لتكرار القائمة هنا:
 * ملخّص فقط (الدور + التاريخ + عدد المباريات + عدّاد تنازلي مشترك) وزر ينزل
 * لقسم المباريات — القائمة تُعرض مرة واحدة هناك. عند الانطلاق يتحوّل العدّاد
 * لمؤشّر مباشر.
 */
function MatchdayHeroCard({ matches }: { matches: KcFixture[] }) {
  const anchor = [...matches].sort((a, b) => a.timestamp - b.timestamp)[0];
  const rounds = new Set(matches.map((f) => f.round));
  const title = rounds.size === 1 ? anchor.round : "مباريات اليوم";
  const upcoming = matches.filter((f) => !f.status.live && !f.status.finished);
  const liveNow = matches.filter((f) => f.status.live).length;
  const finished = matches.filter((f) => f.status.finished).length;
  // كل المباريات القادمة بتوقيت واحد؟ عدّاد واحد يكفي الجميع
  const sameKickoff = upcoming.length > 0 && upcoming.every((f) => f.timestamp === upcoming[0].timestamp);
  const nextKickoff = upcoming.length > 0 ? Math.min(...upcoming.map((f) => f.timestamp)) : null;

  return (
    <div className="mx-auto max-w-3xl rounded-3xl bg-white/[0.06] p-6 sm:p-8 ring-1 ring-white/10 backdrop-blur-md shadow-2xl">
      <div className="space-y-5 text-center">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-emerald-100/70">
          <span className="text-lg font-black text-amber-200">{title}</span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            {formatKickoffDay(anchor.date)}
          </span>
          <span>·</span>
          <span>{matches.length} {matches.length === 1 ? "مباراة" : "مباريات"}</span>
        </div>

        {liveNow > 0 ? (
          <div className="flex items-center justify-center gap-2 text-sm font-bold text-red-300">
            <Radio className="h-4 w-4 animate-pulse" />
            {liveNow === 1 ? "مباراة تجري الآن" : `${liveNow} مباريات تجري الآن`}
            {finished > 0 && <span className="text-emerald-100/60 font-semibold">· انتهت {finished}</span>}
          </div>
        ) : nextKickoff != null ? (
          <>
            <CountdownChips timestamp={nextKickoff} />
            {sameKickoff && (
              <p className="text-[11px] text-emerald-100/60">
                تنطلق جميع المباريات {formatKickoffTime(upcoming[0].date)} بتوقيت الرياض
              </p>
            )}
          </>
        ) : null}

        <div className="flex justify-center">
          <Button asChild className="bg-amber-300 text-emerald-950 hover:bg-amber-200 font-bold rounded-full px-6">
            <a href="#matches">مباريات الجولة كاملة</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

/** بطاقة البطل — تحلّ محل بطاقة المباراة بعد حسم النهائي (أو التعيين اليدوي). */
function ChampionHeroCard({ champion }: { champion: KcChampion }) {
  return (
    <div className="mx-auto max-w-3xl rounded-3xl bg-white/[0.06] p-6 sm:p-8 ring-1 ring-amber-300/30 backdrop-blur-md shadow-2xl">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
        <span className="relative h-24 w-24 rounded-full bg-white p-2 ring-4 ring-amber-300/70 shadow-xl shrink-0">
          <img src={champion.team.logo} alt={champion.team.name} className="h-full w-full object-contain" />
          <Trophy className="absolute -bottom-1 -left-1 h-7 w-7 text-amber-300 drop-shadow" />
        </span>
        <div className="text-center sm:text-right min-w-0">
          <p className="text-sm font-bold text-amber-300">🏆 بطل كأس خادم الحرمين الشريفين</p>
          <p className="text-3xl font-black text-white truncate">{champion.team.name}</p>
          {champion.runnerUp && champion.score && (
            <p className="mt-1 text-sm text-emerald-100/80">
              فاز على {champion.runnerUp.name} في النهائي{" "}
              <span dir="ltr" className="font-black text-amber-300">{champion.score}</span>
              {champion.penalties && (
                <> (بركلات الترجيح <span dir="ltr" className="font-black text-amber-300">{champion.penalties}</span>)</>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function KcHero({ overview, fixtures, isLoading, onOpenMatch }: KcHeroProps) {
  const champion = overview?.champion ?? null;
  const fixture = overview?.matchOfTheDay?.fixture ?? overview?.nextMatch ?? null;
  const today = Array.isArray(overview?.today) ? overview.today : [];
  const liveMatches = Array.isArray(overview?.live)
    ? overview.live.filter((f) => f.status.live)
    : [];
  const liveCount = liveMatches.length;

  // «يوم الجولة»: مباريات اليوم إن وُجدت، وإلا كل مباريات يوم المباراة القادمة من
  // الجدول الكامل (قبل انطلاق الجولة يكون today فارغًا والجدول هو المصدر).
  const allFixtures = Array.isArray(fixtures) ? fixtures : [];
  const matchday =
    today.length > 0
      ? today
      : fixture
        ? allFixtures.filter((f) => riyadhDayKey(f.date) === riyadhDayKey(fixture.date))
        : [];

  // أدوار الكأس المبكرة تُلعب دفعة واحدة (حتى 16 مباراة في اليوم) — إبراز مباراة
  // واحدة اعتباطي، فنعرض بطاقة «يوم الجولة» بكل المباريات. البطاقة الكبيرة تبقى
  // ليوم فيه مباراة أو مباراتان (نصف النهائي والنهائي).
  const matchdayMode = !champion && matchday.length >= 3;
  const multiHero = !champion && !matchdayMode && liveCount >= 2;
  const heroFixtures =
    champion || matchdayMode ? [] : multiHero ? liveMatches : fixture ? [fixture] : [];
  const heroIds = new Set(heroFixtures.map((f) => f.id));
  const stripMatches = multiHero ? today.filter((f) => !heroIds.has(f.id)) : today;
  const showStrip =
    !champion && !matchdayMode && (multiHero ? stripMatches.length >= 1 : today.length >= 2);

  return (
    <section dir="rtl" className="relative overflow-hidden">
      {/* أرضية الملعب الليلي — نفس أرضية هيرو المونديال */}
      <div className="absolute inset-0 bg-gradient-to-bl from-emerald-950 via-[#04261b] to-[#063828]" />
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, rgba(255,255,255,0.6) 0 90px, transparent 90px 180px)",
        }}
      />
      {/* دائرة منتصف الملعب + أضواء الكشافات (توهّج ذهبي للكأس) */}
      <div className="absolute -bottom-56 left-1/2 -translate-x-1/2 h-[480px] w-[480px] rounded-full border-2 border-white/[0.07]" />
      <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-amber-300/15 blur-3xl" />
      <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-emerald-400/10 blur-3xl" />

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
              src={kingsCupLogo}
              alt="شعار كأس خادم الحرمين الشريفين"
              className="h-20 w-auto object-contain"
              loading="eager"
              decoding="async"
            />
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-amber-400/15 text-amber-200 border border-amber-300/20 gap-1.5 px-3 py-1">
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
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            كأس <span className="text-amber-300">خادم الحرمين الشريفين</span>
          </h1>
          <p className="text-sm sm:text-base text-emerald-100/70 max-w-xl">
            أعرق بطولات الكرة السعودية — إقصاء مباشر من أول صافرة، وتغطية حية لحظة بلحظة بتوقيت الرياض
          </p>
        </motion.div>

        {/* بطاقة البطل / بطاقة مباراة اليوم / بطاقات المباريات المتزامنة */}
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

        {!isLoading && champion && <ChampionHeroCard champion={champion} />}

        {!isLoading && matchdayMode && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
          >
            <MatchdayHeroCard matches={matchday} />
          </motion.div>
        )}

        {!isLoading && !champion && !matchdayMode && heroFixtures.length === 0 && (
          <div className="mx-auto max-w-3xl rounded-3xl bg-white/[0.06] p-6 sm:p-8 ring-1 ring-white/10 backdrop-blur-md shadow-2xl">
            <div className="text-center text-emerald-100/80 py-6 flex flex-col items-center gap-2">
              <Sparkles className="h-8 w-8 text-amber-300" />
              <p className="font-bold text-white">تغطية كأس الملك تنطلق قريبًا</p>
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
                prediction={
                  f.id === overview?.matchOfTheDay?.fixture.id
                    ? overview?.matchOfTheDay?.prediction ?? null
                    : null
                }
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
