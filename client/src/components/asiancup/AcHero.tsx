import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, MapPin, Radio, Sparkles, Trophy, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
// الشعار الرسمي (نسخة «الخلفيات الفاتحة» — نصّه أخضر داكن) لذا يُعرض
// دائمًا فوق لوح فاتح لا فوق خلفية الهيرو الداكنة مباشرة.
import asianCupLogo from "@assets/asian-cup-2027-logo.png";
import { countdownFromIso, formatDateRange, type AcOverview } from "./acTypes";

interface AcHeroProps {
  overview: AcOverview | undefined;
  onJump: (id: "schedule" | "teams") => void;
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative grid place-items-center rounded-2xl bg-white/[0.07] px-3.5 py-3 sm:px-5 sm:py-4 min-w-[4rem] sm:min-w-[5.25rem] ring-1 ring-emerald-300/20 backdrop-blur-md shadow-xl">
        <span className="bg-gradient-to-b from-white to-emerald-100 bg-clip-text text-3xl sm:text-5xl font-black tabular-nums text-transparent">
          {String(value).padStart(2, "0")}
        </span>
        <span className="absolute inset-x-2 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/50 to-transparent" />
      </div>
      <span className="mt-2 text-[11px] sm:text-xs font-semibold text-emerald-100/70">{label}</span>
    </div>
  );
}

function Countdown({ startsAt }: { startsAt: string | null }) {
  const [c, setC] = useState(() => countdownFromIso(startsAt));
  useEffect(() => {
    const t = setInterval(() => setC(countdownFromIso(startsAt)), 1000);
    return () => clearInterval(t);
  }, [startsAt]);

  if (!startsAt || c.total <= 0) {
    return (
      <div className="flex items-center justify-center gap-2 text-base font-bold text-amber-200">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-300" />
        </span>
        انطلقت البطولة — التغطية الحيّة جارية
      </div>
    );
  }

  return (
    <div className="flex items-end justify-center gap-2 sm:gap-3" dir="ltr" aria-label="العد التنازلي">
      <CountdownUnit value={c.days} label="يوم" />
      <span className="pb-7 text-2xl font-black text-emerald-300/40">:</span>
      <CountdownUnit value={c.hours} label="ساعة" />
      <span className="pb-7 text-2xl font-black text-emerald-300/40">:</span>
      <CountdownUnit value={c.minutes} label="دقيقة" />
      <span className="pb-7 text-2xl font-black text-emerald-300/40">:</span>
      <CountdownUnit value={c.seconds} label="ثانية" />
    </div>
  );
}

export function AcHero({ overview, onJump }: AcHeroProps) {
  const dateRange = formatDateRange(overview?.startsAt ?? null, overview?.endsAt ?? null);

  return (
    <section dir="rtl" className="relative overflow-hidden">
      {/* خلفية زمردية أوضح — أقرب لهوية التطبيق، بلا أسود مخضّر */}
      <div className="absolute inset-0 bg-gradient-to-bl from-[#0c7a4f] via-[#0a9a5c] to-[#087a4a]" />
      <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-emerald-300/30 blur-[120px]" />
      <div className="absolute -bottom-48 -right-24 h-96 w-96 rounded-full bg-amber-300/15 blur-3xl" />
      <div className="absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-teal-300/15 blur-3xl" />
      {/* زخرفة هندسية خفيفة مستوحاة من اللوقو */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(255,255,255,0.7) 0 2px, transparent 2px 22px)",
        }}
      />

      <div className="relative container max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center text-center gap-5"
        >
          {/* الشعار الرسمي على لوح فاتح مع هالة متوهّجة — المقاس مضبوط على
              مرجع هيرو المونديال (h-20 على لوح صغير) */}
          <div className="relative">
            <motion.div
              className="absolute inset-0 -m-5 rounded-3xl bg-emerald-400/20 blur-2xl"
              animate={{ scale: [1, 1.1, 1], opacity: [0.45, 0.75, 0.45] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="relative rounded-2xl bg-gradient-to-b from-white to-emerald-50/90 px-4 py-3 shadow-2xl ring-1 ring-emerald-300/40"
              initial={{ scale: 0.88, rotate: -2 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 120, damping: 12 }}
            >
              <img
                src={asianCupLogo}
                alt="شعار كأس آسيا AFC 2027 — السعودية"
                className="h-20 w-auto object-contain sm:h-24"
                width={359}
                height={640}
                loading="eager"
                decoding="async"
              />
            </motion.div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Badge className="gap-1.5 border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-amber-200">
              <Trophy className="h-3.5 w-3.5" />
              تغطية خاصة
            </Badge>
            <Badge className="gap-1.5 border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-emerald-100">
              <MapPin className="h-3.5 w-3.5" />
              تستضيفها المملكة العربية السعودية
            </Badge>
          </div>

          <h1 className="text-4xl font-black tracking-tight text-white sm:text-6xl">
            كأس آسيا{" "}
            <span className="bg-gradient-to-l from-amber-300 via-amber-200 to-emerald-300 bg-clip-text text-transparent">
              2027
            </span>
          </h1>

          {dateRange && (
            <p className="flex items-center gap-2 text-sm text-emerald-100/80 sm:text-base">
              <CalendarDays className="h-4 w-4 text-amber-300" />
              {dateRange}
            </p>
          )}

          {/* العد التنازلي */}
          <div className="mt-2 w-full">
            <Countdown startsAt={overview?.startsAt ?? null} />
          </div>

          {/* مؤشرات سريعة */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-emerald-100/80">
            {!!overview?.teamsCount && (
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-emerald-300" />
                {overview.teamsCount} منتخبًا
              </span>
            )}
            {!!overview?.venues?.length && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-emerald-300" />
                {overview.venues.length} ملعبًا
              </span>
            )}
            {overview?.started && (
              <span className="flex items-center gap-1.5 font-bold text-red-300">
                <Radio className="h-4 w-4 animate-pulse" />
                البطولة جارية
              </span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
            <Button
              onClick={() => onJump("schedule")}
              className="rounded-full bg-emerald-400 px-6 font-bold text-emerald-950 hover:bg-emerald-300"
            >
              جدول المباريات
            </Button>
            <Button
              onClick={() => onJump("teams")}
              variant="outline"
              className="rounded-full border-emerald-300/30 bg-white/5 px-6 font-bold text-emerald-100 hover:bg-white/10"
            >
              المنتخبات المتأهّلة
            </Button>
          </div>

          {!overview?.startsAt && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-100/50">
              <Sparkles className="h-3.5 w-3.5" />
              يجري تجهيز التغطية — الجدول والمنتخبات ستظهر هنا أولًا بأول
            </p>
          )}
        </motion.div>
      </div>
    </section>
  );
}
