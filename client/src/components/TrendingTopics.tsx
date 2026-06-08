import { useMemo } from "react";
import { Link } from "wouter";
import { TrendingUp, ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardContent } from "@/components/ui/card";

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

/**
 * Deterministic seeded paths for a tiny 24h sparkline. Returns both the stroke line
 * path and a closed fill path for a smooth background gradient.
 */
function sparkPaths(seed: string, rising: boolean): { linePath: string; fillPath: string } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const len = 12;
  const w = 56;
  const hh = 16;
  const vals: number[] = [];
  let v = 50;
  for (let i = 0; i < len; i++) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    const drift = rising ? 1.6 : 0;
    const noise = ((h % 21) - 10) * 0.55;
    v = Math.max(8, Math.min(92, v + noise + drift));
    vals.push(v);
  }
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const range = max - min || 1;
  
  const points = vals.map((p, i) => {
    const x = (i / (len - 1)) * w;
    const y = hh - ((p - min) / range) * hh;
    return { x, y };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  const fillPath = points.length > 0 
    ? `M0,${hh} ` + points.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") + ` L${w},${hh} Z`
    : "";

  return { linePath, fillPath };
}

export function TrendingTopics({ topics }: TrendingTopicsProps) {
  // Sort defensively in case the API doesn't ship in count-order. MUST run
  // before the early return below — otherwise switching `topics` between
  // empty and non-empty re-orders hooks and crashes the whole SPA.
  const sorted = useMemo(
    () => [...(topics ?? [])].sort((a, b) => b.count - a.count),
    [topics],
  );

  if (!topics || topics.length === 0) return null;

  return (
    <Card className="border border-border/40 bg-card/45 backdrop-blur-md shadow-lg rounded-2xl overflow-hidden" dir="rtl">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 pb-4 pt-5 px-5 space-y-0">
        <div className="flex items-center gap-2.5">
          <div className="h-5 w-1 rounded-full bg-primary" />
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <TrendingUp className="h-4.5 w-4.5" aria-hidden />
          </div>
          <h2
            className="text-lg md:text-xl font-bold tracking-tight text-foreground"
            data-testid="heading-trending-topics"
          >
            موضوعات صاعدة
          </h2>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/60 px-2.5 py-0.5 rounded-full tabular-nums">
          آخر ٢٤ ساعة
        </span>
      </CardHeader>

      <CardContent className="p-4 pt-2">
        <ol className="space-y-1.5" data-testid="list-trending-topics">
          {sorted.map((topic, index) => {
            const rank = index + 1;
            const isTop3 = rank <= 3;
            const { linePath, fillPath } = sparkPaths(topic.topic, isTop3);
            // Deterministic delta % for Top-3. Bottom items show a flat dash to
            // keep the column visually quiet but aligned.
            const delta = isTop3 ? 10 + ((Math.abs(topic.articles) >> 2) % 18) : 0;

            return (
              <motion.li
                key={topic.topic}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.3,
                  delay: index * 0.03,
                  ease: [0.16, 1, 0.3, 1],
                }}
                data-testid={`card-topic-${index}`}
              >
                <Link
                  href={`/news?category=${encodeURIComponent(topic.topic)}`}
                  className="grid grid-cols-[28px_1fr_auto_64px] items-center gap-3 py-3 px-3 rounded-xl border border-transparent hover:border-border/30 hover:bg-muted/30 dark:hover:bg-muted/15 shadow-none hover:shadow-sm transition-all duration-300 transform hover:-translate-y-0.5 group"
                >
                  {/* Rank Badge */}
                  <div className="flex items-center justify-center w-7 h-7 rounded-full shrink-0">
                    {isTop3 ? (
                      <span className={cn(
                        "text-xs font-bold leading-none w-6 h-6 rounded-full flex items-center justify-center shadow-sm text-white",
                        rank === 1 && "bg-gradient-to-br from-amber-400 to-yellow-600 dark:from-amber-300 dark:to-yellow-500",
                        rank === 2 && "bg-gradient-to-br from-slate-400 to-slate-500 dark:from-slate-300 dark:to-slate-400",
                        rank === 3 && "bg-gradient-to-br from-amber-600 to-orange-700 dark:from-amber-500 dark:to-orange-600"
                      )}>
                        {rank}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-muted-foreground/60 tabular-nums">
                        {String(rank).padStart(2, "0")}
                      </span>
                    )}
                  </div>

                  {/* Topic name + stats */}
                  <div className="min-w-0">
                    <h3 className="font-bold text-[15px] leading-tight text-foreground group-hover:text-primary transition-colors truncate">
                      {topic.topic}
                    </h3>
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
                      <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums">
                        {formatArabicNumber(topic.articles)} مقال
                      </span>
                      {topic.comments > 0 && (
                        <span className="bg-primary/5 text-primary/80 dark:text-primary/95 px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums">
                          {formatArabicNumber(topic.comments)} تعليق
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Delta % Badge */}
                  <div className="text-[11px] font-bold tabular-nums shrink-0">
                    {delta > 0 ? (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                        <ArrowUpRight className="h-3 w-3 shrink-0" />
                        <span>+{delta}%</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40 px-2">—</span>
                    )}
                  </div>

                  {/* 24h sparkline with gradient area fill */}
                  <svg
                    width="56"
                    height="16"
                    viewBox="0 0 56 16"
                    className={cn(
                      "shrink-0",
                      delta > 0
                        ? "text-emerald-500"
                        : "text-muted-foreground/40",
                    )}
                    aria-hidden
                  >
                    <defs>
                      <linearGradient id={`spark-grad-${index}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="currentColor" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <path
                      d={fillPath}
                      fill={`url(#spark-grad-${index})`}
                    />
                    <path
                      d={linePath}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Link>
              </motion.li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
