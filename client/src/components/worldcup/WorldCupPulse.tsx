import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Gauge, MonitorPlay, Radio } from "lucide-react";
import { countdownTo, formatKickoffTime, type WcFixture } from "./wcTypes";

// ===== نبض المباراة — ودجت لحظي بهوية المونديال الخضراء =====
// مصدر البيانات SportMonks عبر /api/world-cup/pulse/:id (النتيجة/الدقيقة لحظية،
// الزخم = pressure index، آخر VAR من الأحداث). يستهدف المباراة الحيّة، وإلا
// أقرب مباراة قادمة.

interface WcPulse {
  id: number;
  home: { name: string; logo: string };
  away: { name: string; logo: string };
  score: { home: number; away: number };
  status: { live: boolean; finished: boolean; elapsed: number | null; extra: number | null; label: string };
  kickoff: string;
  timestamp: number;
  round: string;
  momentum: { home: number; away: number; leader: "home" | "away" | null; value: number };
  lastVar: { minute: number; team: "home" | "away" } | null;
}

/** يختار المباراة المستهدفة: حيّة أولًا، ثم أقرب قادمة، ثم أحدث منتهية. */
function pickFixtureId(fixtures: WcFixture[]): number | null {
  const live = fixtures.find((f) => f.status.live);
  if (live) return live.id;
  const nowSec = Date.now() / 1000;
  const upcoming = fixtures
    .filter((f) => !f.status.finished && !f.status.live && f.timestamp >= nowSec - 600)
    .sort((a, b) => a.timestamp - b.timestamp)[0];
  if (upcoming) return upcoming.id;
  const recent = [...fixtures].filter((f) => f.status.finished).sort((a, b) => b.timestamp - a.timestamp)[0];
  return recent?.id ?? fixtures[0]?.id ?? null;
}

export function WorldCupPulse({ fixtureId: overrideId }: { fixtureId?: number }) {
  const { data: fxRaw } = useQuery<{ fixtures: WcFixture[] }>({
    queryKey: ["/api/world-cup/fixtures"],
    enabled: overrideId == null,
  });
  const fixtures = Array.isArray(fxRaw?.fixtures) ? fxRaw!.fixtures : [];
  const computedId = useMemo(() => pickFixtureId(fixtures), [fixtures]);
  const fixtureId = overrideId ?? computedId;

  const { data: pulse } = useQuery<WcPulse>({
    queryKey: [`/api/world-cup/pulse/${fixtureId}`],
    enabled: fixtureId != null,
    refetchInterval: (q) => (q.state.data?.status.live ? 6000 : 30000),
  });

  // كشف الهدف → فلاش ٥ ثوانٍ
  const [goalFlash, setGoalFlash] = useState(false);
  const prevScore = useRef<string | null>(null);
  useEffect(() => {
    if (!pulse) return;
    const s = `${pulse.score.home}-${pulse.score.away}`;
    if (prevScore.current && prevScore.current !== s && pulse.status.live) {
      setGoalFlash(true);
      const t = setTimeout(() => setGoalFlash(false), 5000);
      return () => clearTimeout(t);
    }
    prevScore.current = s;
  }, [pulse?.score.home, pulse?.score.away, pulse?.status.live]);

  // كشف VAR → رادار ٣٫٥ ثانية
  const [varOn, setVarOn] = useState(false);
  const prevVar = useRef<string | null>(null);
  useEffect(() => {
    if (!pulse?.lastVar) return;
    const k = `${pulse.lastVar.minute}-${pulse.lastVar.team}`;
    if (prevVar.current && prevVar.current !== k && pulse.status.live) {
      setVarOn(true);
      const t = setTimeout(() => setVarOn(false), 3500);
      return () => clearTimeout(t);
    }
    prevVar.current = k;
  }, [pulse?.lastVar?.minute, pulse?.lastVar?.team, pulse?.status.live]);

  // عدّاد تنازلي للمباراة القادمة
  const [, tick] = useState(0);
  useEffect(() => {
    if (!pulse || pulse.status.live || pulse.status.finished) return;
    const i = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, [pulse?.status.live, pulse?.status.finished, pulse?.id]);

  if (!fixtureId || !pulse) return null;

  const { home, away, score, status, momentum } = pulse;
  const started = status.live || status.finished;
  const homeHot = momentum.leader === "home" && momentum.value > 70;
  const awayHot = momentum.leader === "away" && momentum.value > 70;
  const total = Math.max(1, momentum.home + momentum.away);
  const cd = countdownTo(pulse.timestamp);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-200/70 bg-white shadow-sm">
      {/* شريط علوي أخضر — هوية المونديال */}
      <div className="flex items-center justify-between gap-2 bg-gradient-to-l from-emerald-700 to-emerald-600 px-4 py-2.5 text-white">
        <span className="text-xs font-bold truncate">كأس العالم 2026 · {pulse.round}</span>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-50/90">
          {status.live ? (
            <>
              <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
              مباشر · حصري سبق
            </>
          ) : status.finished ? (
            "انتهت · حصري سبق"
          ) : (
            "قريبًا · حصري سبق"
          )}
        </span>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {/* المضيف */}
          <TeamSide team={home} hot={homeHot} />
          {/* المنتصف */}
          <div className="flex flex-col items-center gap-1 px-1">
            {started ? (
              <span className="text-3xl font-black tabular-nums text-zinc-900" dir="ltr">
                {score.away} <span className="text-zinc-300">:</span> {score.home}
              </span>
            ) : (
              <span className="text-xl font-black text-zinc-900">{formatKickoffTime(pulse.kickoff)}</span>
            )}
            <span className={`text-[11px] font-bold ${status.live ? "text-red-500" : "text-muted-foreground"}`}>
              {status.live
                ? `${status.elapsed ?? 0}${status.extra ? `+${status.extra}` : ""}'`
                : status.finished
                  ? "النهاية"
                  : cd.total > 0
                    ? `بعد ${cd.days ? `${cd.days}ي ` : ""}${String(cd.hours).padStart(2, "0")}:${String(cd.minutes).padStart(2, "0")}:${String(cd.seconds).padStart(2, "0")}`
                    : "تنطلق الآن"}
            </span>
          </div>
          {/* الضيف */}
          <TeamSide team={away} hot={awayHot} />
        </div>

        {/* شريط الزخم (The Pulse) */}
        {started && (momentum.home > 0 || momentum.away > 0) && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-center gap-1.5 text-[11px] font-bold text-emerald-700">
              <Gauge className="h-3.5 w-3.5" />
              {momentum.leader
                ? `ضغط عالٍ من ${momentum.leader === "home" ? home.name : away.name}`
                : "مؤشّر الضغط"}
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-emerald-50">
              <div
                className="bg-gradient-to-l from-emerald-600 to-emerald-500 transition-[width] duration-700"
                style={{ width: `${(momentum.home / total) * 100}%` }}
              />
              <div
                className="bg-zinc-300 transition-[width] duration-700"
                style={{ width: `${(momentum.away / total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {!started && (
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            تبدأ المتابعة اللحظية (النبض · النتيجة · VAR) مع صافرة البداية
          </p>
        )}
      </div>

      {/* ===== VAR ===== */}
      <AnimatePresence>
        {varOn && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2.5 bg-zinc-900/55 backdrop-blur-[2px]"
          >
            <div
              className="h-20 w-20 animate-spin rounded-full"
              style={{
                background: "conic-gradient(from 0deg, rgba(16,185,129,.95), rgba(16,185,129,0) 60deg, transparent 360deg)",
                animationDuration: "1.1s",
              }}
            />
            <span className="rounded-full bg-white px-4 py-1.5 text-sm font-bold text-emerald-700 shadow-lg">
              <MonitorPlay className="me-1 inline h-4 w-4" />
              مراجعة الفيديو · VAR
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== فلاش الهدف ===== */}
      <AnimatePresence>
        {goalFlash && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-br from-emerald-600 to-emerald-800"
          >
            <motion.div
              initial={{ scale: 0.3, rotate: -6, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 220, damping: 12 }}
              className="text-5xl font-black tracking-widest text-white drop-shadow-lg"
              dir="ltr"
            >
              GOAL!
            </motion.div>
            <span className="mt-1 text-xs font-bold tracking-[0.3em] text-emerald-50/90">سبق</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TeamSide({ team, hot }: { team: { name: string; logo: string }; hot: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 min-w-0">
      <div className="relative grid h-[68px] w-[68px] place-items-center">
        {/* The Pulse: حلقة توهّج خضراء عند الزخم العالي */}
        {hot && (
          <span className="absolute inset-1 rounded-full bg-emerald-400/40 animate-ping" />
        )}
        <div
          className={`relative z-[1] grid h-14 w-14 place-items-center rounded-full bg-white ring-1 ${
            hot ? "ring-emerald-400" : "ring-border"
          } shadow-sm`}
        >
          {team.logo ? (
            <img src={team.logo} alt={team.name} className="h-10 w-10 object-contain" loading="lazy" />
          ) : (
            <Radio className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </div>
      <span className="text-sm font-bold text-center leading-tight text-zinc-900">{team.name}</span>
    </div>
  );
}
