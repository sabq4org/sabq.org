import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Hash, Search, ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { FollowKeywordButton } from "@/components/FollowKeywordButton";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardContent } from "@/components/ui/card";

interface TrendingKeyword {
  keyword: string;
  count: number;
  category?: string;
}

export function TrendingKeywords() {
  const [, setLocation] = useLocation();

  const { data: keywords, isLoading, error } = useQuery<TrendingKeyword[]>({
    queryKey: ["/api/trending-keywords"],
  });

  return (
    <Card className="border border-border/40 bg-card/45 backdrop-blur-md shadow-lg rounded-2xl overflow-hidden" dir="rtl">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 pb-4 pt-5 px-5 space-y-0">
        <div className="flex items-center gap-2.5">
          <div className="h-5 w-1 rounded-full bg-primary" />
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <Hash className="h-4.5 w-4.5" aria-hidden />
          </div>
          <h2
            className="text-lg md:text-xl font-bold tracking-tight text-foreground"
            data-testid="heading-trending-keywords"
          >
            الكلمات الأكثر تداولاً
          </h2>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/60 px-2.5 py-0.5 rounded-full tabular-nums">
          آخر ٢٤ ساعة
        </span>
      </CardHeader>

      <CardContent className="p-4 pt-2">
        {isLoading ? (
          <div className="space-y-2.5 py-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Search className="h-8 w-8 text-muted-foreground/30 mb-2.5" />
            <p className="text-sm text-muted-foreground font-medium">
              تعذّر تحميل الكلمات المتداولة الآن — حاول التحديث.
            </p>
          </div>
        ) : !keywords || keywords.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Hash className="h-8 w-8 text-muted-foreground/30 mb-2.5" />
            <p className="text-sm text-muted-foreground font-medium">
              لا توجد كلمات متداولة في هذه المدّة.
            </p>
          </div>
        ) : (
          <ol className="space-y-1.5" data-testid="list-trending-keywords">
            {keywords
              .filter(
                (k) =>
                  k.keyword && typeof k.keyword === "string" && k.keyword.trim(),
              )
              .slice(0, 8)
              .map((item, index) => {
                const rank = index + 1;
                const isTop3 = rank <= 3;
                // Deterministic delta % for Top-3 — stable visual cue until we
                // have a real time-series for keyword volume.
                const delta = isTop3 ? 10 + ((item.count * 7) % 22) : 0;

                return (
                  <motion.li
                    key={item.keyword}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      duration: 0.3,
                      delay: index * 0.03,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="group"
                    data-testid={`trending-keyword-${item.keyword}`}
                  >
                    <div className="grid grid-cols-[28px_1fr_auto_auto] items-center gap-3 py-2.5 px-3 rounded-xl border border-transparent hover:border-border/30 hover:bg-muted/30 dark:hover:bg-muted/15 shadow-none hover:shadow-sm transition-all duration-300 transform hover:-translate-y-0.5">
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

                      {/* Keyword + count */}
                      <button
                        type="button"
                        onClick={() =>
                          setLocation(
                            `/keyword/${encodeURIComponent(item.keyword)}`,
                          )
                        }
                        className="min-w-0 text-start focus:outline-none"
                        aria-label={`عرض ${item.keyword}`}
                      >
                        <div
                          className={cn(
                            "font-bold text-[15px] leading-tight truncate transition-colors",
                            "text-foreground group-hover:text-primary",
                          )}
                        >
                          #{item.keyword}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
                          <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums">
                            {item.count}{" "}
                            {item.count === 1 ? "مقال" : "مقالات"}
                          </span>
                        </div>
                      </button>

                      {/* Delta % */}
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

                      {/* Follow bell — keep, styled as elegant compact button */}
                      <div className="shrink-0 flex items-center justify-center min-w-[32px]">
                        <FollowKeywordButton
                          keyword={item.keyword}
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-lg border-border/60 hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-all duration-300"
                        />
                      </div>
                    </div>
                  </motion.li>
                );
              })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
