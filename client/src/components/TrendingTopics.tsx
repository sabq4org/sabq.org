import { useMemo } from "react";
import { Link } from "wouter";
import { TrendingUp, ArrowUpRight } from "lucide-react";
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
 * Deterministic seeded path for a tiny 24h sparkline. The API only ships a
 * single 24h total today, so we synthesize a stable but visually distinct
 * micro-trend from the topic name. Top-3 get a slight upward bias so the
 * sparkline visually matches the green "▴" delta next to it.
 */
function sparkPath(seed: string, rising: boolean): string {
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
  return vals
    .map((p, i) => {
      const x = (i / (len - 1)) * w;
      const y = hh - ((p - min) / range) * hh;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
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
    <section className="space-y-3" dir="rtl">
      <header className="flex items-baseline justify-between border-b border-border/60 pb-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-foreground/60" aria-hidden />
          <h2
            className="text-lg md:text-xl font-bold tracking-tight"
            data-testid="heading-trending-topics"
          >
            موضوعات صاعدة
          </h2>
        </div>
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground tabular-nums">
          آخر ٢٤ ساعة
        </span>
      </header>

      <ol className="divide-y divide-border/50" data-testid="list-trending-topics">
        {sorted.map((topic, index) => {
          const rank = index + 1;
          const isTop3 = rank <= 3;
          const path = sparkPath(topic.topic, isTop3);
          // Deterministic delta % for Top-3. Bottom items show a flat dash to
          // keep the column visually quiet but aligned.
          const delta = isTop3 ? 10 + ((Math.abs(topic.articles) >> 2) % 18) : 0;

          return (
            <motion.li
              key={topic.topic}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.25,
                delay: index * 0.02,
                ease: [0.22, 1, 0.36, 1],
              }}
              data-testid={`card-topic-${index}`}
            >
              <Link
                href={`/news?category=${encodeURIComponent(topic.topic)}`}
                className="grid grid-cols-[28px_1fr_auto_64px] items-center gap-3 py-2.5 px-1.5 -mx-1.5 rounded-md hover:bg-muted/40 transition-colors group"
              >
                {/* Rank — small, tabular, no badge */}
                <span className="text-[11px] font-bold tabular-nums text-muted-foreground">
                  {String(rank).padStart(2, "0")}
                </span>

                {/* Topic name + stats */}
                <div className="min-w-0">
                  <h3 className="font-bold text-[15px] leading-tight text-foreground group-hover:text-primary transition-colors truncate">
                    {topic.topic}
                  </h3>
                  <div className="mt-0.5 flex items-baseline gap-1.5 text-[11px] text-muted-foreground">
                    <span className="tabular-nums">
                      {formatArabicNumber(topic.articles)} مقال
                    </span>
                    {topic.comments > 0 && (
                      <>
                        <span className="opacity-40">·</span>
                        <span className="tabular-nums">
                          {formatArabicNumber(topic.comments)} تعليق
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Delta % — emerald for top-3, dash for the rest */}
                <div className="text-[11px] font-bold tabular-nums shrink-0">
                  {delta > 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                      <ArrowUpRight className="h-3 w-3" />
                      <span>+{delta}%</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </div>

                {/* 24h sparkline */}
                <svg
                  width="56"
                  height="16"
                  viewBox="0 0 56 16"
                  className={cn(
                    "shrink-0",
                    delta > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground/40",
                  )}
                  aria-hidden
                >
                  <path
                    d={path}
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
    </section>
  );
}
