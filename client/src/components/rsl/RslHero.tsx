/**
 * هيرو «دوري روشن السعودي» — نفس تكوين هيرو المونديال/كأس الملك (أرضية الملعب
 * الليلي، بطاقة الشعار، الشارات، العنوان الكبير) مع لمسة روشن الزرقاء، وأربع
 * حالات موسمية ذكية من /api/rsl/hero:
 *   • ما قبل الموسم: عدّاد انطلاق الموسم + بطاقة مباراة الافتتاح + حامل اللقب.
 *   • عطلة ما بين الموسمين: احتفاء بالبطل + «الجدول يُعلن قريبًا».
 *   • يوم جولة (3+ مباريات): ملخّص الجولة بعدّاد مشترك — بلا تكرار للقائمة.
 *   • مباراة الليلة/الحية (1–2): البطاقة الكبيرة بالعدّاد والدقيقة الحية.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, MapPin, Radio, Sparkles, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import roshnLogo from "@assets/roshn-league-logo.png";
import { LiveMinute } from "../worldcup/LiveMinute";
import {
  countdownTo,
  formatKickoffDay,
  formatKickoffTime,
  riyadhDayKey,
  todayRiyadhKey,
  type RslFixture,
  type RslHero as RslHeroData,
} from "./rslTypes";

interface RslHeroProps {
  hero: RslHeroData | undefined;
  isLoading: boolean;
  onOpenMatch: (fixtureId: number) => void;
}

function TeamSide({
  team,
  align,
}: {
  team: RslFixture["home"];
  align: "start" | "end";
}) {
  return (
    <div className={`flex flex-col items-center gap-2 sm:gap-3 ${align === "start" ? "sm:items-start" : "sm:items-end"}`}>
      <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-white p-2 ring-4 ring-white/15 shadow-xl">
        <img src={team.logo} alt={team.name} className="h-full w-full object-contain" loading="lazy" />
      </div>
      <span className="text-lg sm:text-2xl font-extrabold text-white text-center">{team.name}</span>
    </div>
  );
}

function CountdownChips({ timestamp, big = false }: { timestamp: number; big?: boolean }) {
  const [countdown, setCountdown] = useState(() => countdownTo(timestamp));
  useEffect(() => {
    const interval = setInterval(() => setCountdown(countdownTo(timestamp)), 1000);
    return () => clearInterval(interval);
  }, [timestamp]);

  if (countdown.total <= 0) {
    return (
      <div className="flex items-center justify-center gap-2 text-sm font-bold text-sky-200">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-300 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sky-300" />
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
    <div className="flex items-center justify-center gap-2" dir="ltr" aria-label="العد التنازلي للانطلاق">
      {chips.map((chip) => (
        <div
          key={chip.label}
          className={`flex flex-col items-center rounded-xl bg-white/10 backdrop-blur-sm ${
            big ? "px-3.5 py-2 min-w-[4rem]" : "px-2.5 py-1.5 min-w-[3.25rem]"
          }`}
        >
          <span className={`${big ? "text-2xl" : "text-xl"} font-black text-white tabular-nums`}>{chip.value}</span>
          <span className="text-[10px] text-emerald-100/80">{chip.label}</span>
        </div>
      ))}
    </div>
  );
}

/** بطاقة المباراة الكبيرة — لأيام المباراة والمباراتين (نفس بطاقة المونديال). */
function MatchHeroCard({ fixture, onOpenMatch }: { fixture: RslFixture; onOpenMatch: (id: number) => void }) {
  return (
    <div className="h-full rounded-3xl bg-white/[0.06] p-6 sm:p-8 ring-1 ring-white/10 backdrop-blur-md shadow-2xl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-emerald-100/70">
          <span className="font-bold text-sky-200">
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
          <TeamSide team={fixture.home} align="end" />

          <div className="flex flex-col items-center gap-2 min-w-[7rem]">
            {fixture.status.live || fixture.status.finished ? (
              <>
                {/* المضيف معروض يمينًا في RTL — الضيف أولًا داخل LTR ليلاصق كل رقم فريقه */}
                <div className="text-4xl sm:text-5xl font-black text-white tabular-nums" dir="ltr">
                  {fixture.goals.away ?? 0} - {fixture.goals.home ?? 0}
                </div>
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

          <TeamSide team={fixture.away} align="start" />
        </div>

        {!fixture.status.live && !fixture.status.finished && (
          <CountdownChips timestamp={fixture.timestamp} />
        )}

        <div className="flex justify-center">
          <Button
            onClick={() => onOpenMatch(fixture.id)}
            className="bg-sky-300 text-sky-950 hover:bg-sky-200 font-bold rounded-full px-6"
          >
            مركز المباراة
          </Button>
        </div>
      </div>
    </div>
  );
}

/** ملخّص «يوم الجولة» — 3+ مباريات في اليوم: عدّاد مشترك وزر ينزل للجدول (بلا تكرار). */
function MatchdayHeroCard({ hero }: { hero: RslHeroData }) {
  const md = hero.matchday!;
  return (
    <div className="mx-auto max-w-3xl rounded-3xl bg-white/[0.06] p-6 sm:p-8 ring-1 ring-white/10 backdrop-blur-md shadow-2xl">
      <div className="space-y-5 text-center">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-emerald-100/70">
          <span className="text-lg font-black text-sky-200">{md.round ?? "مباريات اليوم"}</span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            {formatKickoffDay(md.date)}
          </span>
          <span>·</span>
          <span>{md.count} {md.count === 1 ? "مباراة" : md.count === 2 ? "مباراتان" : "مباريات"}</span>
        </div>

        {md.liveCount > 0 ? (
          <div className="flex items-center justify-center gap-2 text-sm font-bold text-red-300">
            <Radio className="h-4 w-4 animate-pulse" />
            {md.liveCount === 1 ? "مباراة تجري الآن" : `${md.liveCount} مباريات تجري الآن`}
            {md.finishedCount > 0 && (
              <span className="text-emerald-100/60 font-semibold">· انتهت {md.finishedCount}</span>
            )}
          </div>
        ) : md.nextKickoffTs != null ? (
          <>
            <CountdownChips timestamp={md.nextKickoffTs} />
            {md.sameKickoff && (
              <p className="text-[11px] text-emerald-100/60">
                تنطلق جميع المباريات {formatKickoffTime(new Date(md.nextKickoffTs * 1000).toISOString())} بتوقيت الرياض
              </p>
            )}
          </>
        ) : null}

        <div className="flex justify-center">
          <Button asChild className="bg-sky-300 text-sky-950 hover:bg-sky-200 font-bold rounded-full px-6">
            <a href="#matches">مباريات الجولة كاملة</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

/** ما قبل الموسم — عدّاد انطلاق الموسم + مباراة الافتتاح + حامل اللقب. */
function PreSeasonCard({ hero, onOpenMatch }: { hero: RslHeroData; onOpenMatch: (id: number) => void }) {
  const { outlook, lastSeason } = hero;
  const opener = outlook.openers[0] ?? null;
  const seasonLabel = outlook.nextSeason ?? outlook.season;
  const holder = lastSeason?.champion ?? outlook.champion;

  return (
    <div className="mx-auto max-w-3xl rounded-3xl bg-white/[0.06] p-6 sm:p-8 ring-1 ring-white/10 backdrop-blur-md shadow-2xl">
      <div className="space-y-5 text-center">
        <p className="text-sm font-bold text-sky-200">
          موسم {seasonLabel}-{(seasonLabel + 1) % 100} ينطلق
          {outlook.nextSeasonStart ? ` — ${formatKickoffDay(outlook.nextSeasonStart)}` : " قريبًا"}
        </p>

        {outlook.firstKickoff != null && (
          <CountdownChips timestamp={Math.floor(outlook.firstKickoff / 1000)} big />
        )}

        {opener && (
          <button
            type="button"
            onClick={() => onOpenMatch(opener.id)}
            className="mx-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-white/[0.05] px-4 py-3 ring-1 ring-white/10 transition-colors hover:bg-white/[0.12]"
            data-testid="rsl-opener"
          >
            <span className="flex flex-1 items-center justify-end gap-2 min-w-0">
              <span className="truncate text-sm font-bold text-white">{opener.home.name}</span>
              <img src={opener.home.logo} alt={opener.home.name} className="h-8 w-8 shrink-0 rounded-full bg-white p-0.5 object-contain" loading="lazy" />
            </span>
            <span className="flex flex-col items-center leading-none shrink-0">
              <span className="text-[10px] font-bold text-sky-200">مباراة الافتتاح</span>
              <span className="mt-1 text-sm font-black text-white tabular-nums">{formatKickoffTime(opener.date)}</span>
            </span>
            <span className="flex flex-1 items-center justify-start gap-2 min-w-0">
              <img src={opener.away.logo} alt={opener.away.name} className="h-8 w-8 shrink-0 rounded-full bg-white p-0.5 object-contain" loading="lazy" />
              <span className="truncate text-sm font-bold text-white">{opener.away.name}</span>
            </span>
          </button>
        )}

        {holder && (
          <p className="flex items-center justify-center gap-2 text-xs text-emerald-100/80">
            <Trophy className="h-3.5 w-3.5 text-amber-300" />
            حامل اللقب{lastSeason?.previousSeason ? ` (${lastSeason.previousSeason})` : ""}:
            <img src={holder.logo} alt={holder.name} className="h-4 w-4 object-contain" />
            <b className="text-white">{holder.name}</b>
          </p>
        )}

        {/* الزر رهن مفتاح التشغيل — كان يظهر دائمًا حتى مع تعطيل منصة التوقعات،
            ويَعِد بتبويب «بطل الموسم» غير موجود. الوجهة الآن مركز التوقعات مباشرة. */}
        {hero.predictionsEnabled && (
          <div className="flex justify-center">
            <Button asChild className="bg-sky-300 text-sky-950 hover:bg-sky-200 font-bold rounded-full px-6">
              <a href="/predictions?competition=rsl-2026">توقّع وانافس على نقاط الموسم</a>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** عطلة ما بين الموسمين — احتفاء بالبطل حتى نشر جدول الموسم الجديد. */
function OffSeasonCard({ hero }: { hero: RslHeroData }) {
  const champion = hero.outlook.champion ?? hero.lastSeason?.champion ?? null;
  return (
    <div className="mx-auto max-w-3xl rounded-3xl bg-white/[0.06] p-6 sm:p-8 ring-1 ring-amber-300/30 backdrop-blur-md shadow-2xl">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
        {champion && (
          <span className="relative h-24 w-24 rounded-full bg-white p-2 ring-4 ring-amber-300/70 shadow-xl shrink-0">
            <img src={champion.logo} alt={champion.name} className="h-full w-full object-contain" />
            <Trophy className="absolute -bottom-1 -left-1 h-7 w-7 text-amber-300 drop-shadow" />
          </span>
        )}
        <div className="text-center sm:text-right min-w-0">
          <p className="text-sm font-bold text-amber-300">🏆 بطل دوري روشن {hero.outlook.season}</p>
          {champion && <p className="text-3xl font-black text-white truncate">{champion.name}</p>}
          <p className="mt-1 text-sm text-emerald-100/80">
            جدول الموسم الجديد يُعلن قريبًا — العدّ التنازلي يبدأ هنا فور اعتماده
          </p>
        </div>
      </div>
    </div>
  );
}

export function RslHero({ hero, isLoading, onOpenMatch }: RslHeroProps) {
  const outlook = hero?.outlook;
  const live = Array.isArray(hero?.live) ? hero.live : [];
  const liveCount = live.length;
  const matchday = hero?.matchday ?? null;
  const nextMatch = hero?.nextMatch ?? null;

  const inSeason = outlook?.phase === "in-season";
  const preSeason = outlook?.phase === "pre-season" && (outlook.firstKickoff != null || outlook.openers.length > 0);
  const matchdayMode = inSeason && !!matchday && matchday.count >= 3;

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
      {/* دائرة منتصف الملعب + أضواء الكشافات (توهّج روشن الأزرق) */}
      <div className="absolute -bottom-56 left-1/2 -translate-x-1/2 h-[480px] w-[480px] rounded-full border-2 border-white/[0.07]" />
      <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-sky-400/15 blur-3xl" />
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
              src={roshnLogo}
              alt="شعار دوري روشن السعودي"
              className="h-20 w-auto object-contain"
              loading="eager"
              decoding="async"
            />
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-sky-400/15 text-sky-200 border border-sky-300/20 gap-1.5 px-3 py-1">
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
            دوري <span className="text-sky-300">روشن</span> السعودي
          </h1>
          <p className="text-sm sm:text-base text-emerald-100/70 max-w-xl">
            18 ناديًا · 34 جولة · 306 مباريات — أقوى دوريات المنطقة بتغطية حية لحظة بلحظة بتوقيت الرياض
          </p>
        </motion.div>

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

        {!isLoading && hero && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
          >
            {preSeason ? (
              <PreSeasonCard hero={hero} onOpenMatch={onOpenMatch} />
            ) : outlook?.phase === "off-season" ? (
              <OffSeasonCard hero={hero} />
            ) : matchdayMode ? (
              <MatchdayHeroCard hero={hero} />
            ) : nextMatch ? (
              <div className="mx-auto max-w-3xl">
                <MatchHeroCard fixture={nextMatch} onOpenMatch={onOpenMatch} />
              </div>
            ) : (
              <div className="mx-auto max-w-3xl rounded-3xl bg-white/[0.06] p-6 sm:p-8 ring-1 ring-white/10 backdrop-blur-md shadow-2xl">
                <div className="text-center text-emerald-100/80 py-6 flex flex-col items-center gap-2">
                  <Sparkles className="h-8 w-8 text-sky-300" />
                  <p className="font-bold text-white">تغطية دوري روشن تنطلق قريبًا</p>
                  <p className="text-sm">تابعنا — جدول المباريات والنتائج الحية ستجدها هنا أولًا بأول</p>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </section>
  );
}
