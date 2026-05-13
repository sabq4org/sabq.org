import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Hash, Search, ArrowUpRight, Flame } from "lucide-react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { FollowKeywordButton } from "@/components/FollowKeywordButton";
import { cn } from "@/lib/utils";

interface TrendingKeyword {
  keyword: string;
  count: number;
  category?: string;
}

type TimeWindow = "24h" | "7d" | "30d";

const CATEGORY_TEXT: Record<string, string> = {
  "سياسة":  "text-red-700 dark:text-red-300",
  "اقتصاد": "text-emerald-700 dark:text-emerald-300",
  "رياضة":  "text-blue-700 dark:text-blue-300",
  "تقنية":  "text-violet-700 dark:text-violet-300",
};

const TIME_LABELS: Record<TimeWindow, string> = {
  "24h": "24 ساعة",
  "7d": "أسبوع",
  "30d": "شهر",
};

/** Top-3 rank medal styling. Top-1 also gets a subtle live pulsing dot. */
function rankMeta(rank: number): { ring: string; text: string; bg: string; medal?: string } {
  if (rank === 1) return { ring: "ring-amber-400/50", text: "text-amber-700 dark:text-amber-300", bg: "bg-amber-100 dark:bg-amber-900/40", medal: "🥇" };
  if (rank === 2) return { ring: "ring-slate-400/40", text: "text-slate-700 dark:text-slate-200", bg: "bg-slate-100 dark:bg-slate-800/60", medal: "🥈" };
  if (rank === 3) return { ring: "ring-orange-400/40", text: "text-orange-700 dark:text-orange-300", bg: "bg-orange-100 dark:bg-orange-900/40", medal: "🥉" };
  return { ring: "ring-border", text: "text-muted-foreground", bg: "bg-muted/40" };
}

export function TrendingKeywords() {
  const [, setLocation] = useLocation();
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("24h");

  const { data: keywords, isLoading, error } = useQuery<TrendingKeyword[]>({
    // Period param is forward-compatible — backend can pick it up later.
    queryKey: ["/api/trending-keywords", timeWindow],
  });

  return (
    <section className="space-y-5" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="grid place-items-center h-9 w-9 rounded-xl bg-primary/10 text-primary">
              <Hash className="h-5 w-5" />
            </div>
            <h2
              className="text-2xl md:text-3xl font-bold"
              data-testid="heading-trending-keywords"
            >
              الكلمات الأكثر تداولاً
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            أعلى 8 كلمات تفاعلاً ضمن المدة المختارة
          </p>
        </div>

        <TimeWindowSelector value={timeWindow} onChange={setTimeWindow} />
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm p-2 md:p-3">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <Search className="h-7 w-7 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">
              تعذّر تحميل الكلمات المتداولة الآن — حاول التحديث.
            </p>
          </div>
        ) : !keywords || keywords.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <Hash className="h-7 w-7 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">
              لا توجد كلمات متداولة في هذه المدّة.
            </p>
          </div>
        ) : (
          <ol className="space-y-1" data-testid="list-trending-keywords">
            {keywords
              .filter((k) => k.keyword && typeof k.keyword === "string" && k.keyword.trim())
              .slice(0, 8)
              .map((item, index) => {
                const rank = index + 1;
                const meta = rankMeta(rank);
                const catText = item.category ? CATEGORY_TEXT[item.category] : undefined;
                const isTopOne = rank === 1;

                return (
                  <motion.li
                    key={item.keyword}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      duration: 0.3,
                      delay: index * 0.04,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="group relative"
                    data-testid={`trending-keyword-${item.keyword}`}
                  >
                    {/* Top-1 left-edge stripe — calm accent, not screaming. */}
                    {rank <= 3 && (
                      <div
                        className={cn(
                          "absolute top-2 bottom-2 right-0 w-[3px] rounded-full",
                          rank === 1 && "bg-amber-400/80",
                          rank === 2 && "bg-slate-400/60",
                          rank === 3 && "bg-orange-400/70",
                        )}
                        aria-hidden
                      />
                    )}

                    <div
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5",
                        "transition-colors hover:bg-muted/50",
                      )}
                    >
                      <RankBadge rank={rank} meta={meta} live={isTopOne} />

                      <button
                        type="button"
                        onClick={() => setLocation(`/keyword/${encodeURIComponent(item.keyword)}`)}
                        className="flex-1 min-w-0 text-start"
                        aria-label={`عرض ${item.keyword}`}
                      >
                        <div className="flex items-baseline gap-2">
                          <span
                            className={cn(
                              "font-bold truncate",
                              isTopOne ? "text-lg" : "text-base",
                              "text-foreground group-hover:text-primary transition-colors",
                            )}
                          >
                            #{item.keyword}
                          </span>
                          {catText && (
                            <span className={cn("text-[10px] font-bold", catText)}>
                              {item.category}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
                          <span className="tabular-nums">
                            {item.count} {item.count === 1 ? "مقال" : "مقالات"}
                          </span>
                          {rank <= 3 && (
                            <>
                              <span className="opacity-50">·</span>
                              <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                                <ArrowUpRight className="h-3 w-3" />
                                يتصاعد
                              </span>
                            </>
                          )}
                        </div>
                      </button>

                      <FollowKeywordButton keyword={item.keyword} variant="ghost" size="icon" />
                    </div>
                  </motion.li>
                );
              })}
          </ol>
        )}
      </div>
    </section>
  );
}

// MARK: - Rank badge

interface RankBadgeProps {
  rank: number;
  meta: ReturnType<typeof rankMeta>;
  /** Top-1 gets a subtle live pulse so it reads as "happening now". */
  live: boolean;
}

function RankBadge({ rank, meta, live }: RankBadgeProps) {
  return (
    <div
      className={cn(
        "relative grid place-items-center h-9 w-9 rounded-xl ring-1 shrink-0",
        meta.bg,
        meta.ring,
      )}
    >
      {live && (
        <motion.span
          className="absolute -top-0.5 -right-0.5 grid place-items-center h-2.5 w-2.5"
          aria-hidden
        >
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 animate-ping" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
        </motion.span>
      )}
      {rank <= 3 ? (
        <Flame className={cn("h-4 w-4", meta.text)} />
      ) : (
        <span className={cn("text-sm font-extrabold tabular-nums", meta.text)}>{rank}</span>
      )}
    </div>
  );
}

// MARK: - Time window selector (shared visual with TrendingTopics)

interface TimeWindowSelectorProps {
  value: TimeWindow;
  onChange: (value: TimeWindow) => void;
}

function TimeWindowSelector({ value, onChange }: TimeWindowSelectorProps) {
  return (
    <div
      className="inline-flex items-center p-1 rounded-full bg-muted/60 border border-border/60"
      role="tablist"
      data-testid="time-window-selector-keywords"
    >
      {(Object.keys(TIME_LABELS) as TimeWindow[]).map((key) => {
        const isActive = key === value;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(key)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
              isActive
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            data-testid={`time-window-keywords-${key}`}
          >
            {TIME_LABELS[key]}
          </button>
        );
      })}
    </div>
  );
}
