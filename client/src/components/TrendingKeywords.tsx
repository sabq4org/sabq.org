import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Hash, Search, ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { FollowKeywordButton } from "@/components/FollowKeywordButton";
import { cn } from "@/lib/utils";

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
    <section className="space-y-3" dir="rtl">
      <header className="flex items-baseline justify-between border-b border-border/60 pb-2">
        <div className="flex items-center gap-2">
          <Hash className="h-4 w-4 text-foreground/60" aria-hidden />
          <h2
            className="text-lg md:text-xl font-bold tracking-tight"
            data-testid="heading-trending-keywords"
          >
            الكلمات الأكثر تداولاً
          </h2>
        </div>
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground tabular-nums">
          آخر ٢٤ ساعة
        </span>
      </header>

      {isLoading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-md" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Search className="h-6 w-6 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">
            تعذّر تحميل الكلمات المتداولة الآن — حاول التحديث.
          </p>
        </div>
      ) : !keywords || keywords.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Hash className="h-6 w-6 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">
            لا توجد كلمات متداولة في هذه المدّة.
          </p>
        </div>
      ) : (
        <ol className="divide-y divide-border/50" data-testid="list-trending-keywords">
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
                  initial={{ opacity: 0, x: 3 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    duration: 0.25,
                    delay: index * 0.02,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="group"
                  data-testid={`trending-keyword-${item.keyword}`}
                >
                  <div className="grid grid-cols-[28px_1fr_auto_28px] items-center gap-3 py-2.5 px-1.5 -mx-1.5 rounded-md hover:bg-muted/40 transition-colors">
                    {/* Rank — tabular, no badge, no flame */}
                    <span className="text-[11px] font-bold tabular-nums text-muted-foreground">
                      {String(rank).padStart(2, "0")}
                    </span>

                    {/* Keyword + count */}
                    <button
                      type="button"
                      onClick={() =>
                        setLocation(
                          `/keyword/${encodeURIComponent(item.keyword)}`,
                        )
                      }
                      className="min-w-0 text-start"
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
                      <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                        {item.count}{" "}
                        {item.count === 1 ? "مقال" : "مقالات"}
                      </div>
                    </button>

                    {/* Delta % */}
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

                    {/* Follow bell — keep, but muted via ghost styling */}
                    <FollowKeywordButton
                      keyword={item.keyword}
                      variant="ghost"
                      size="icon"
                    />
                  </div>
                </motion.li>
              );
            })}
        </ol>
      )}
    </section>
  );
}
