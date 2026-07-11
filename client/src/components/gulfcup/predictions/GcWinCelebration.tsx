import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { Coins, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { TIER_AR, TIER_EMOJI, type GcTier } from "./gcPredictionTypes";

export interface GcWin {
  fixtureId: string;
  points: number;
  tier: Exclude<GcTier, "none">;
  homeName: string;
  awayName: string;
  predHome: number;
  predAway: number;
  finalHome: number | null;
  finalAway: number | null;
  beatPercent?: number; // تفوّقت على X% من المتوقّعين
}

function fireConfetti() {
  const colors = ["#F5B833", "sky-600", "sky-300", "#29BC7A"];
  const burst = (ratio: number, opts: confetti.Options) =>
    confetti({ ...opts, origin: { y: 0.6 }, particleCount: Math.floor(180 * ratio), colors });
  burst(0.25, { spread: 26, startVelocity: 55 });
  burst(0.2, { spread: 60 });
  burst(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
  burst(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
  burst(0.1, { spread: 120, startVelocity: 45 });
}

/** عدّاد نقاط متصاعد. */
function useCountUp(target: number, ms = 1200) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}

export function GcWinCelebration({ win, onClose }: { win: GcWin; onClose: () => void }) {
  const count = useCountUp(win.points);

  useEffect(() => {
    fireConfetti();
    const t = setTimeout(fireConfetti, 600);
    return () => clearTimeout(t);
  }, []);

  const share = async () => {
    const text = `🎉 توقّعت ${win.homeName} ${win.predHome}-${win.predAway} ${win.awayName} في خليجي 27 وربحت ${win.points} نقطة ولاء! ${TIER_EMOJI[win.tier]} ${TIER_AR[win.tier]}\nشارك توقّعاتك على سبق:`;
    const url = `${window.location.origin}/gulf-cup/predictions`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "توقّعات خليجي 27 — سبق", text, url });
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
      }
    } catch {
      /* المستخدم ألغى المشاركة */
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        dir="rtl"
      >
        <motion.div
          className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-gradient-to-b from-sky-500 via-sky-600 to-sky-950 p-6 text-center text-white shadow-2xl"
          initial={{ scale: 0.8, y: 24 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 20 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white/15 text-white/80 hover:bg-white/25"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>

          <motion.div
            className="mx-auto mb-2 text-5xl"
            initial={{ rotate: -15, scale: 0 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
          >
            🎉
          </motion.div>
          <p className="text-lg font-black">توقّعك صحيح!</p>
          <p className="mt-0.5 text-sm text-green-100/90">
            {TIER_EMOJI[win.tier]} {TIER_AR[win.tier]} — {win.homeName}{" "}
            <span dir="ltr" className="tabular-nums">{win.finalAway}-{win.finalHome}</span>{" "}
            {win.awayName}
          </p>

          <div className="my-5 inline-flex items-center gap-2 rounded-2xl bg-amber-400/20 px-6 py-3 ring-2 ring-amber-300/40">
            <Coins className="h-7 w-7 text-amber-300" />
            <span className="text-4xl font-black tabular-nums text-amber-200">+{formatNumber(count)}</span>
            <span className="self-end pb-1 text-sm font-bold text-amber-100/90">نقطة ولاء</span>
          </div>

          {win.beatPercent != null && win.beatPercent > 0 && (
            <p className="mb-3 text-xs font-semibold text-green-100/80">
              تفوّقت على {win.beatPercent}% من المتوقّعين 🔥
            </p>
          )}

          <div className="flex gap-2">
            <Button onClick={share} className="flex-1 gap-2 bg-white text-green-800 hover:bg-green-50">
              <Share2 className="h-4 w-4" /> شارك فوزك
            </Button>
            <Button onClick={onClose} variant="outline" className="flex-1 border-white/40 bg-transparent text-white hover:bg-white/10">
              رائع!
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
