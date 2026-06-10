import { useEffect, useState } from "react";
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
    <div className="flex items-center gap-2 min-w-0">
      <span className="h-9 w-9 shrink-0 rounded-full bg-white p-1 ring-2 ring-white/15 shadow">
        <img src={team.logo} alt={team.name} className="h-full w-full object-contain" loading="lazy" />
      </span>
      <span className="text-sm font-extrabold text-white truncate">{team.name}</span>
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

export default function WorldCupHomeStrip() {
  const { data } = useQuery<WcOverview>({
    queryKey: ["/api/world-cup/overview"],
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });

  const fixture = data?.matchOfTheDay?.fixture ?? null;
  if (!fixture) return null;

  const started = fixture.status.live || fixture.status.finished;

  return (
    <section
      dir="rtl"
      aria-label="تغطية كأس العالم 2026"
      className="relative overflow-hidden rounded-3xl bg-gradient-to-bl from-emerald-950 via-[#04261b] to-[#063828] ring-1 ring-emerald-900/40 shadow-lg"
    >
      {/* ملمس العشب + وهج الكشافات */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, rgba(255,255,255,0.6) 0 70px, transparent 70px 140px)",
        }}
      />
      <div className="absolute -top-20 -right-16 h-48 w-48 rounded-full bg-emerald-400/15 blur-3xl" />
      <div className="absolute -bottom-24 -left-16 h-48 w-48 rounded-full bg-sky-400/10 blur-3xl" />

      <div className="relative flex flex-col md:flex-row items-center gap-4 md:gap-6 px-4 sm:px-6 py-4">
        {/* هوية البطولة */}
        <Link href="/world-cup">
          <span className="flex items-center gap-3 cursor-pointer group">
            <span className="rounded-xl bg-white p-1.5 shadow-lg shrink-0">
              <img
                src={worldCupEmblem}
                alt="كأس العالم 2026"
                className="h-11 w-auto object-contain"
                width={233}
                height={360}
                loading="lazy"
              />
            </span>
            <span className="text-right">
              <span className="block text-lg font-black text-white leading-tight group-hover:text-emerald-300 transition-colors">
                مونديال 2026
              </span>
              <span className="block text-[11px] text-emerald-200/80">تغطية حية بتوقيت الرياض</span>
            </span>
          </span>
        </Link>

        <div className="hidden md:block h-12 w-px bg-white/10 shrink-0" />

        {/* المباراة */}
        <div className="flex-1 flex items-center justify-center gap-3 sm:gap-5 min-w-0">
          <TeamChip team={fixture.home} />

          <div className="flex flex-col items-center gap-0.5 shrink-0">
            {started ? (
              <>
                <span className="text-2xl font-black text-white tabular-nums leading-none" dir="ltr">
                  {fixture.goals.home ?? 0} - {fixture.goals.away ?? 0}
                </span>
                <Badge
                  className={
                    fixture.status.live
                      ? "bg-red-500 text-white border-0 gap-1 text-[10px] px-2 py-0"
                      : "bg-white/10 text-emerald-100 border-0 text-[10px] px-2 py-0"
                  }
                >
                  {fixture.status.live && <Radio className="h-2.5 w-2.5 animate-pulse" />}
                  {fixture.status.live && fixture.status.elapsed != null
                    ? `${fixture.status.elapsed}'`
                    : fixture.status.label}
                </Badge>
              </>
            ) : (
              <>
                <span className="text-xl font-black text-white leading-none">
                  {formatKickoffTime(fixture.date)}
                </span>
                <span className="text-[10px] text-emerald-200/70">{formatKickoffDay(fixture.date)}</span>
                <TickingCountdown timestamp={fixture.timestamp} />
              </>
            )}
          </div>

          <TeamChip team={fixture.away} />
        </div>

        {/* الدعوة للقسم */}
        <Link href="/world-cup" className="shrink-0">
          <Button className="bg-emerald-400 text-emerald-950 hover:bg-emerald-300 font-bold rounded-full gap-1 px-5">
            مركز المونديال
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </section>
  );
}
