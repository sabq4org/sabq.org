import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { CalendarDays, Crown, MapPin, Sparkles, Trophy, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
// الشعار الرسمي (SVG متجهي). نصّه أخضر داكن — يُعرض فوق لوح أبيض كروشن.
import gulfCupLogo from "@assets/gulf-cup-27-logo.svg";
import { countdownFromIso, formatDateRange, type GcOverview, type GcTeam } from "./gcTypes";

interface GcHeroProps {
  overview: GcOverview | undefined;
  onJump: (id: "schedule" | "teams") => void;
  titleHolder?: GcTeam | null;
}

/** رقائق العدّ التنازلي — أسلوب هيرو روشن */
function CountdownChips({ startsAt }: { startsAt: string }) {
  const [c, setC] = useState(() => countdownFromIso(startsAt));
  useEffect(() => {
    const t = setInterval(() => setC(countdownFromIso(startsAt)), 1000);
    return () => clearInterval(t);
  }, [startsAt]);

  if (c.total <= 0) return null;

  const chips = [
    { value: c.days, label: "يوم" },
    { value: c.hours, label: "ساعة" },
    { value: c.minutes, label: "دقيقة" },
    { value: c.seconds, label: "ثانية" },
  ];

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-2.5" dir="ltr" aria-label="العد التنازلي">
      {chips.map((chip) => (
        <div
          key={chip.label}
          className="flex min-w-[3.75rem] flex-col items-center rounded-xl bg-white/10 px-3 py-2.5 backdrop-blur-sm sm:min-w-[4.5rem] sm:px-4 sm:py-3"
        >
          <span className="text-2xl font-black tabular-nums text-white sm:text-3xl">
            {String(chip.value).padStart(2, "0")}
          </span>
          <span className="mt-0.5 text-[10px] text-emerald-100/75">{chip.label}</span>
        </div>
      ))}
    </div>
  );
}

export function GcHero({ overview, onJump, titleHolder }: GcHeroProps) {
  const dateRange = formatDateRange(overview?.startsAt ?? null, overview?.endsAt ?? null);
  const startsAt = overview?.startsAt ?? null;

  const [countdownLeft, setCountdownLeft] = useState(() =>
    startsAt ? countdownFromIso(startsAt).total : 0,
  );
  useEffect(() => {
    if (!startsAt) {
      setCountdownLeft(0);
      return;
    }
    setCountdownLeft(countdownFromIso(startsAt).total);
    const t = setInterval(() => setCountdownLeft(countdownFromIso(startsAt).total), 1000);
    return () => clearInterval(t);
  }, [startsAt]);

  const countdownActive = !!startsAt && countdownLeft > 0 && !overview?.started;

  return (
    <section dir="rtl" className="relative overflow-hidden">
      {/* أرضية الملعب الليلي — روشن / المونديال */}
      <div className="absolute inset-0 bg-gradient-to-bl from-emerald-950 via-[#04261b] to-[#063828]" />
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, rgba(255,255,255,0.6) 0 90px, transparent 90px 180px)",
        }}
      />
      <div className="absolute -bottom-56 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full border-2 border-white/[0.07]" />
      <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-sky-400/15 blur-3xl" />
      <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="relative container mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center gap-3.5 text-center"
        >
          <div className="rounded-2xl bg-white px-4 py-3 shadow-2xl ring-1 ring-white/20">
            <img
              src={gulfCupLogo}
              alt="شعار خليجي 27 — كأس الخليج العربي في السعودية 2026"
              className="h-16 w-auto object-contain sm:h-20"
              loading="eager"
              decoding="async"
            />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Badge className="gap-1.5 border border-sky-300/20 bg-sky-400/15 px-3 py-1 text-sky-200">
              <Trophy className="h-3.5 w-3.5" />
              تغطية خاصة
            </Badge>
            {overview?.started ? (
              <Badge className="gap-1.5 border-0 bg-red-500 px-3 py-1 text-white">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                </span>
                البطولة جارية
              </Badge>
            ) : (
              <Badge className="gap-1.5 border border-white/15 bg-white/5 px-3 py-1 text-emerald-100/85">
                <MapPin className="h-3.5 w-3.5" />
                جدة — السعودية
              </Badge>
            )}
            {titleHolder && (
              <Badge className="gap-1.5 border border-white/15 bg-white/5 px-3 py-1 text-emerald-100/85">
                <Crown className="h-3.5 w-3.5 text-sky-300" />
                حامل اللقب: {titleHolder.name}
              </Badge>
            )}
          </div>

          <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl">
            خليجي <span className="text-sky-300">27</span>
          </h1>
          <p className="max-w-xl text-sm text-emerald-100/70 sm:text-base">
            كأس الخليج العربي السابع والعشرون — تغطية حية لحظة بلحظة بتوقيت الرياض
          </p>

          {(!!overview?.teamsCount || !!overview?.venues?.length || !!dateRange) && (
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-emerald-100/65 sm:text-sm">
              {!!overview?.teamsCount && (
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-sky-300/80" />
                  {overview.teamsCount} منتخبات
                </span>
              )}
              {!!overview?.venues?.length && (
                <>
                  <span className="text-white/25">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-sky-300/80" />
                    {overview.venues.length} ملاعب
                  </span>
                </>
              )}
              {dateRange && (
                <>
                  <span className="text-white/25">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-sky-300/80" />
                    {dateRange}
                  </span>
                </>
              )}
            </div>
          )}
        </motion.div>

        {/* العدّاد فقط — يظهر قبل الانطلاق، ويختفي بعده بدون أن يأخذ معه أزرار الدخول */}
        {countdownActive && overview?.startsAt && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
            className="mx-auto mt-8 max-w-3xl"
          >
            <div className="rounded-3xl bg-white/[0.06] p-6 shadow-2xl ring-1 ring-white/10 backdrop-blur-md sm:p-8">
              <p className="mb-5 text-center text-xs font-bold text-sky-200">
                العدّ التنازلي لانطلاق البطولة
              </p>
              <CountdownChips startsAt={overview.startsAt} />
            </div>
          </motion.div>
        )}

        {/* أزرار ثابتة خارج بلوك العدّاد — تبقى بعد اختفائه */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
        >
          <Button
            onClick={() => onJump("schedule")}
            className="rounded-full bg-sky-300 px-6 font-bold text-sky-950 hover:bg-sky-200"
          >
            جدول المباريات
          </Button>
          <Link href="/gulf-cup/predictions">
            <Button className="rounded-full bg-white px-6 font-bold text-emerald-950 hover:bg-emerald-50">
              <Sparkles className="h-4 w-4 text-sky-500" />
              توقّع واربح
            </Button>
          </Link>
          <Button
            onClick={() => onJump("teams")}
            variant="outline"
            className="rounded-full border-white/20 bg-white/5 px-6 font-bold text-emerald-100 hover:bg-white/10"
          >
            المنتخبات
          </Button>
        </motion.div>

        {!overview?.startsAt && (
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-emerald-100/50">
            <Sparkles className="h-3.5 w-3.5 text-sky-300" />
            يجري تجهيز التغطية — الجدول والمنتخبات ستظهر هنا أولًا بأول
          </p>
        )}
      </div>
    </section>
  );
}
