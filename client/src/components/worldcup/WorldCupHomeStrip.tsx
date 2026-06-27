import { Fragment, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronLeft, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import worldCupEmblem from "@assets/world-cup-2026-emblem.png";
import {
  countdownTo,
  formatKickoffDay,
  formatKickoffTime,
  type WcFixture,
  type WcOverview,
} from "./wcTypes";
import { LiveMinute, isClockRunning } from "./LiveMinute";

/**
 * «شريط المونديال» — بلوك الصفحة الرئيسية أسفل كروسيل الأخبار.
 *
 * يعرض مباراة اليوم (الحية أولًا، والأخضر له الأولوية من الخادم):
 *   مباشر  → النتيجة + دقيقة اللعب بنبض أحمر
 *   قادمة → موعد الانطلاق + عدّ تنازلي حي
 *
 * يختفي كليًا عندما لا تتوفر بيانات (قبل تفعيل المفتاح أو عند تعطل المزود)
 * فلا يترك أي أثر في الصفحة — نفس فلسفة HajjBlock.
 */

function TeamChip({ team }: { team: WcFixture["home"] }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 text-center md:flex-row md:gap-2 md:text-start">
      <span className="h-10 w-10 shrink-0 rounded-full bg-white p-1 ring-2 ring-white/15 shadow md:h-9 md:w-9">
        <img src={team.logo} alt={team.name} className="h-full w-full object-contain" loading="lazy" />
      </span>
      <span className="max-w-[82px] truncate text-xs font-extrabold leading-tight text-white md:max-w-28 md:text-sm">
        {team.name}
      </span>
    </div>
  );
}

// صيغة المدة بالعربية السليمة: مفرد/مثنى/جمع
function arabicDays(n: number): string {
  if (n === 1) return "يوم";
  if (n === 2) return "يومين";
  if (n <= 10) return `${n} أيام`;
  return `${n} يومًا`;
}

function arabicHours(n: number): string {
  if (n === 1) return "ساعة";
  if (n === 2) return "ساعتين";
  if (n <= 10) return `${n} ساعات`;
  return `${n} ساعة`;
}

function TickingCountdown({ timestamp }: { timestamp: number }) {
  const [countdown, setCountdown] = useState(() => countdownTo(timestamp));
  useEffect(() => {
    const interval = setInterval(() => setCountdown(countdownTo(timestamp)), 1000);
    return () => clearInterval(interval);
  }, [timestamp]);

  // موعد الانطلاق حان لكن المزود لم يرفع إشارة «حية» بعد — لا نعرض 00:00:00 مجمدة
  if (countdown.total <= 0) {
    return (
      <p className="text-[11px] font-bold text-emerald-200/90">
        حان موعد الانطلاق — التغطية الحية خلال لحظات
      </p>
    );
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  // في آخر يوم نعرض ساعة رقمية HH:MM:SS (وحدها تحتاج dir=ltr)؛
  // قبل ذلك نصًا عربيًا خالصًا — خلطه مع dir=ltr يبعثر الأرقام (Bidi)
  const isClock = countdown.days === 0;
  const text = isClock
    ? `${pad(countdown.hours)}:${pad(countdown.minutes)}:${pad(countdown.seconds)}`
    : countdown.hours > 0
      ? `${arabicDays(countdown.days)} و${arabicHours(countdown.hours)}`
      : arabicDays(countdown.days);

  return (
    <p className="text-[11px] text-emerald-200/90">
      تنطلق بعد{" "}
      <span className="font-black text-emerald-300 tabular-nums" dir={isClock ? "ltr" : undefined}>
        {text}
      </span>
    </p>
  );
}

// كتلة مباراة واحدة: المضيف — النتيجة/الموعد — الضيف. تُعاد لكل مباراة متزامنة.
function MatchBlock({ fixture }: { fixture: WcFixture }) {
  const started = fixture.status.live || fixture.status.finished;
  return (
    <div className="grid w-full max-w-[330px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 md:flex md:max-w-none md:justify-center md:gap-5 md:min-w-0">
      <TeamChip team={fixture.home} />

      <div className="flex shrink-0 flex-col items-center gap-1 rounded-2xl bg-white/[0.08] px-3 py-2 ring-1 ring-white/10 md:bg-transparent md:px-0 md:py-0 md:ring-0">
        {started ? (
          <>
            {/* المضيف معروض يمينًا في RTL — الضيف أولًا داخل LTR */}
            <span className="text-3xl font-black leading-none text-white tabular-nums md:text-2xl" dir="ltr">
              {fixture.goals.away ?? 0} - {fixture.goals.home ?? 0}
            </span>
            <Badge
              className={
                fixture.status.live
                  ? "bg-red-500 text-white border-0 gap-1 text-[10px] px-2 py-0"
                  : "bg-white/10 text-emerald-100 border-0 text-[10px] px-2 py-0"
              }
            >
              {fixture.status.live && <Radio className="h-2.5 w-2.5 animate-pulse" />}
              {fixture.status.live && isClockRunning(fixture.status) ? (
                <LiveMinute status={fixture.status} />
              ) : (
                fixture.status.label
              )}
            </Badge>
          </>
        ) : (
          <>
            <span className="text-2xl font-black leading-none text-white md:text-xl">
              {formatKickoffTime(fixture.date)}
            </span>
            <span className="text-[10px] text-emerald-200/70">{formatKickoffDay(fixture.date)}</span>
            <TickingCountdown timestamp={fixture.timestamp} />
          </>
        )}
      </div>

      <TeamChip team={fixture.away} />
    </div>
  );
}

export default function WorldCupHomeStrip() {
  const { data } = useQuery<WcOverview>({
    queryKey: ["/api/world-cup/overview"],
    // مباراة جارية → 8ث لتتحرّك النتيجة لحظيًا في شريط الواجهة؛ غير ذلك → 60ث
    refetchInterval: (query) => {
      const d = query.state.data;
      const live =
        (d?.live?.length ?? 0) > 0 || Boolean(d?.matchOfTheDay?.fixture?.status.live);
      return live ? 8_000 : 60_000;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });

  const fixture = data?.matchOfTheDay?.fixture ?? null;
  if (!fixture) return null;

  // المباريات المتزامنة: مباراتان (أو أكثر) تجريان الآن، أو قادمتان تنطلقان في
  // التوقيت نفسه (ختام دور المجموعات). الشقيقات تأتي من الخادم (matchOfDayPeers)
  // لا من today فقط، لأنها قد تكون في يوم تقويمي تالٍ. مطابق منطق الهيرو.
  const peers = Array.isArray(data?.matchOfDayPeers) ? data.matchOfDayPeers : [];
  const liveMatches = Array.isArray(data?.live) ? data.live.filter((f) => f.status.live) : [];
  const upcomingGroup =
    !fixture.status.live && !fixture.status.finished
      ? [
          fixture,
          ...peers.filter(
            (p) =>
              p.id !== fixture.id &&
              !p.status.live &&
              !p.status.finished &&
              p.timestamp === fixture.timestamp
          ),
        ]
      : [];
  const multi = liveMatches.length >= 2 || upcomingGroup.length >= 2;
  const matches = !multi
    ? [fixture]
    : liveMatches.length >= 2
      ? liveMatches
      : upcomingGroup;

  return (
    <section
      dir="rtl"
      aria-label="تغطية كأس العالم 2026"
      className="relative overflow-hidden rounded-[26px] bg-gradient-to-bl from-emerald-950 via-[#04261b] to-[#063828] ring-1 ring-emerald-900/40 shadow-lg md:rounded-3xl"
    >
      {/* ملمس العشب + وهج الكشافات */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, rgba(255,255,255,0.6) 0 70px, transparent 70px 140px)",
        }}
      />
      <div className="absolute -top-20 -right-16 hidden h-48 w-48 rounded-full bg-emerald-400/15 blur-3xl md:block" />
      <div className="absolute -bottom-24 -left-16 hidden h-48 w-48 rounded-full bg-sky-400/10 blur-3xl md:block" />

      <div className="relative flex flex-col items-stretch gap-4 px-4 py-4 sm:px-6 md:flex-row md:items-center md:gap-6">
        {/* هوية البطولة */}
        <Link href="/world-cup">
          <span className="group flex cursor-pointer items-center justify-center gap-3 md:justify-start">
            <span className="shrink-0 rounded-xl bg-white p-1.5 shadow-lg">
              <img
                src={worldCupEmblem}
                alt="كأس العالم 2026"
                className="h-10 w-auto object-contain md:h-11"
                width={233}
                height={360}
                loading="lazy"
              />
            </span>
            <span className="text-center md:text-right">
              <span className="block text-xl font-black leading-tight text-white transition-colors group-hover:text-emerald-300 md:text-lg">
                مونديال 2026
              </span>
              <span className="block text-[11px] text-emerald-200/80">تغطية حية بتوقيت الرياض</span>
            </span>
          </span>
        </Link>

        <div className="hidden md:block h-12 w-px bg-white/10 shrink-0" />

        {/* المباراة — أو مباراتان متجاورتان عند التزامن */}
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 md:flex-row md:flex-wrap md:gap-6">
          {matches.map((f, i) => (
            <Fragment key={f.id}>
              {i > 0 && <div className="hidden h-12 w-px shrink-0 bg-white/10 md:block" />}
              <MatchBlock fixture={f} />
            </Fragment>
          ))}
        </div>

        {/* الدعوة للقسم */}
        <Link href="/world-cup" className="shrink-0">
          <Button className="h-11 w-full rounded-full bg-emerald-400 px-5 font-bold text-emerald-950 hover:bg-emerald-300 md:h-10 md:w-auto gap-1">
            مركز المونديال
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </section>
  );
}
