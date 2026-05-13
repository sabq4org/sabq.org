import { useMemo } from "react";
import { Link } from "wouter";
import {
  TrendingUp,
  ArrowUpRight,
  Flame,
  MapPin,
  Globe2,
  Sparkles,
  Radio,
  Trophy,
  Plane,
  Briefcase,
  Map,
  LineChart,
  Cpu,
  Landmark,
  Palette,
  Users,
  Hash,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface TrendingTopicsProps {
  topics: Array<{
    topic: string;
    count: number;
    views: number;
    articles: number;
    comments: number;
  }>;
}

/**
 * Map of the most-common section names to a Lucide icon + a Tailwind tint key.
 * Falls back to a neutral "hash" + slate tint for unrecognised names so a new
 * section never breaks the grid.
 */
const TOPIC_META: Record<string, { icon: LucideIcon; tint: TintKey }> = {
  "محليات": { icon: MapPin, tint: "blue" },
  "العالم": { icon: Globe2, tint: "indigo" },
  "حياتنا": { icon: Sparkles, tint: "pink" },
  "محطات": { icon: Radio, tint: "purple" },
  "رياضة": { icon: Trophy, tint: "emerald" },
  "سياحة": { icon: Plane, tint: "cyan" },
  "أعمال": { icon: Briefcase, tint: "amber" },
  "اقتصاد": { icon: LineChart, tint: "teal" },
  "مناطق": { icon: Map, tint: "rose" },
  "تقنية": { icon: Cpu, tint: "violet" },
  "سياسة": { icon: Landmark, tint: "red" },
  "ثقافة": { icon: Palette, tint: "fuchsia" },
  "مجتمع": { icon: Users, tint: "orange" },
};

type TintKey =
  | "blue"
  | "indigo"
  | "pink"
  | "purple"
  | "emerald"
  | "cyan"
  | "amber"
  | "teal"
  | "rose"
  | "violet"
  | "red"
  | "fuchsia"
  | "orange"
  | "slate";

const TINT_CLASSES: Record<TintKey, {
  bg: string;
  ring: string;
  text: string;
  iconBg: string;
  border: string;
}> = {
  blue:    { bg: "bg-blue-50/60 dark:bg-blue-950/20",       ring: "ring-blue-500/20",       text: "text-blue-700 dark:text-blue-300",       iconBg: "bg-blue-100 dark:bg-blue-900/40",       border: "border-blue-200/60 dark:border-blue-900/40"   },
  indigo:  { bg: "bg-indigo-50/60 dark:bg-indigo-950/20",   ring: "ring-indigo-500/20",     text: "text-indigo-700 dark:text-indigo-300",   iconBg: "bg-indigo-100 dark:bg-indigo-900/40",   border: "border-indigo-200/60 dark:border-indigo-900/40" },
  pink:    { bg: "bg-pink-50/60 dark:bg-pink-950/20",       ring: "ring-pink-500/20",       text: "text-pink-700 dark:text-pink-300",       iconBg: "bg-pink-100 dark:bg-pink-900/40",       border: "border-pink-200/60 dark:border-pink-900/40"   },
  purple:  { bg: "bg-purple-50/60 dark:bg-purple-950/20",   ring: "ring-purple-500/20",     text: "text-purple-700 dark:text-purple-300",   iconBg: "bg-purple-100 dark:bg-purple-900/40",   border: "border-purple-200/60 dark:border-purple-900/40" },
  emerald: { bg: "bg-emerald-50/60 dark:bg-emerald-950/20", ring: "ring-emerald-500/20",    text: "text-emerald-700 dark:text-emerald-300", iconBg: "bg-emerald-100 dark:bg-emerald-900/40", border: "border-emerald-200/60 dark:border-emerald-900/40" },
  cyan:    { bg: "bg-cyan-50/60 dark:bg-cyan-950/20",       ring: "ring-cyan-500/20",       text: "text-cyan-700 dark:text-cyan-300",       iconBg: "bg-cyan-100 dark:bg-cyan-900/40",       border: "border-cyan-200/60 dark:border-cyan-900/40"   },
  amber:   { bg: "bg-amber-50/60 dark:bg-amber-950/20",     ring: "ring-amber-500/20",      text: "text-amber-800 dark:text-amber-300",     iconBg: "bg-amber-100 dark:bg-amber-900/40",     border: "border-amber-200/60 dark:border-amber-900/40"   },
  teal:    { bg: "bg-teal-50/60 dark:bg-teal-950/20",       ring: "ring-teal-500/20",       text: "text-teal-700 dark:text-teal-300",       iconBg: "bg-teal-100 dark:bg-teal-900/40",       border: "border-teal-200/60 dark:border-teal-900/40"   },
  rose:    { bg: "bg-rose-50/60 dark:bg-rose-950/20",       ring: "ring-rose-500/20",       text: "text-rose-700 dark:text-rose-300",       iconBg: "bg-rose-100 dark:bg-rose-900/40",       border: "border-rose-200/60 dark:border-rose-900/40"   },
  violet:  { bg: "bg-violet-50/60 dark:bg-violet-950/20",   ring: "ring-violet-500/20",     text: "text-violet-700 dark:text-violet-300",   iconBg: "bg-violet-100 dark:bg-violet-900/40",   border: "border-violet-200/60 dark:border-violet-900/40" },
  red:     { bg: "bg-red-50/60 dark:bg-red-950/20",         ring: "ring-red-500/20",        text: "text-red-700 dark:text-red-300",         iconBg: "bg-red-100 dark:bg-red-900/40",         border: "border-red-200/60 dark:border-red-900/40"     },
  fuchsia: { bg: "bg-fuchsia-50/60 dark:bg-fuchsia-950/20", ring: "ring-fuchsia-500/20",    text: "text-fuchsia-700 dark:text-fuchsia-300", iconBg: "bg-fuchsia-100 dark:bg-fuchsia-900/40", border: "border-fuchsia-200/60 dark:border-fuchsia-900/40" },
  orange:  { bg: "bg-orange-50/60 dark:bg-orange-950/20",   ring: "ring-orange-500/20",     text: "text-orange-700 dark:text-orange-300",   iconBg: "bg-orange-100 dark:bg-orange-900/40",   border: "border-orange-200/60 dark:border-orange-900/40" },
  slate:   { bg: "bg-slate-50/60 dark:bg-slate-900/40",     ring: "ring-slate-400/20",      text: "text-slate-700 dark:text-slate-300",     iconBg: "bg-slate-100 dark:bg-slate-800/60",     border: "border-slate-200/60 dark:border-slate-800/40" },
};

/**
 * Natural Arabic count using Western digits (per user preference): 538041 →
 * "538 ألف", 1_250_000 → "1.3 مليون", 432 → "432". Uses en-US locale so the
 * numerals come back in their Western form, not Arabic-Indic (٤٣٢).
 */
function formatArabicNumber(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")} مليون`;
  }
  if (n >= 1_000) {
    const v = (n / 1_000).toFixed(1).replace(/\.0$/, "");
    return `${v} ألف`;
  }
  return n.toLocaleString("en-US");
}

export function TrendingTopics({ topics }: TrendingTopicsProps) {
  if (!topics || topics.length === 0) return null;

  // Sort defensively in case the API doesn't ship in count-order.
  const sorted = useMemo(
    () => [...topics].sort((a, b) => b.count - a.count),
    [topics],
  );

  return (
    <section className="space-y-5" dir="rtl">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="grid place-items-center h-9 w-9 rounded-xl bg-primary/10 text-primary">
            <TrendingUp className="h-5 w-5" />
          </div>
          <h2 className="text-2xl md:text-3xl font-bold" data-testid="heading-trending-topics">
            موضوعات صاعدة
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          الأقسام الأكثر تفاعلاً بناءً على المشاهدات والتعليقات
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        {sorted.map((topic, index) => {
          const meta = TOPIC_META[topic.topic] ?? { icon: Hash, tint: "slate" as TintKey };
          const tint = TINT_CLASSES[meta.tint];
          const isTop3 = index < 3;
          const Icon = meta.icon;

          return (
            <motion.div
              key={topic.topic}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.35,
                delay: index * 0.04,
                ease: [0.22, 1, 0.36, 1],
              }}
              data-testid={`card-topic-${index}`}
            >
              <Link
                href={`/news?category=${encodeURIComponent(topic.topic)}`}
                className="block group"
              >
                <div
                  className={cn(
                    "relative h-full rounded-2xl border p-4 transition-all duration-300",
                    "backdrop-blur-sm hover:shadow-lg hover:-translate-y-0.5",
                    tint.bg,
                    tint.border,
                  )}
                >
                  {isTop3 && (
                    <div className="absolute top-3 left-3">
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100/80 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                        <Flame className="h-3 w-3" />
                        <span className="text-[10px] font-extrabold">{index + 1}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start justify-between mb-3">
                    <div
                      className={cn(
                        "grid place-items-center h-10 w-10 rounded-xl ring-1",
                        tint.iconBg,
                        tint.ring,
                      )}
                    >
                      <Icon className={cn("h-5 w-5", tint.text)} />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <h3
                      className={cn(
                        "font-bold leading-tight",
                        isTop3 ? "text-lg" : "text-base",
                        tint.text,
                      )}
                    >
                      {topic.topic}
                    </h3>
                    <div className="flex items-baseline gap-2 text-xs">
                      <span className="font-semibold tabular-nums">
                        {formatArabicNumber(topic.articles)} مقال
                      </span>
                      {topic.comments > 0 && (
                        <>
                          <span className="text-muted-foreground/50">·</span>
                          <span className="text-muted-foreground tabular-nums">
                            {formatArabicNumber(topic.comments)} تعليق
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {isTop3 && (
                    <div className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      <span>صاعد</span>
                    </div>
                  )}
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

