import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Eye, TrendingUp, Flame, ExternalLink } from "lucide-react";
import { Link } from "wouter";

interface TopArticle {
  id: string;
  title: string;
  slug?: string;
  englishSlug?: string;
  views: number;
  category: string;
  publishedAt: string;
  change: number;
}

export default function TopContentTable() {
  const { data: topArticlesRaw, isLoading } = useQuery<TopArticle[]>({
    queryKey: ["/api/analytics/top-content"],
  });

  const topArticles = Array.isArray(topArticlesRaw)
    ? [...topArticlesRaw].sort((a, b) => (b.views || 0) - (a.views || 0))
    : [];

  if (isLoading) {
    return (
      <Card className="h-full border-border/60">
        <CardHeader>
          <div className="h-6 w-40 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-56 animate-pulse rounded bg-muted" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/40" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full border-border/60">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border/50 pb-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Flame className="h-5 w-5 text-orange-500" />
            المحتوى الأعلى قراءة
          </CardTitle>
          <CardDescription className="mt-1">أبرز 10 مقالات خلال آخر 30 يوماً</CardDescription>
        </div>
        <Badge variant="outline" className="tabular-nums">
          أفضل {topArticles.slice(0, 10).length}
        </Badge>
      </CardHeader>
      <CardContent className="pt-4">
        {topArticles.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            لا توجد مقالات مسجلة خلال الفترة الحالية
          </div>
        ) : (
          <div className="space-y-2.5">
            {topArticles.slice(0, 10).map((article, index) => {
              const targetPath = `/article/${article.englishSlug || article.slug || article.id}`;
              const formattedDate = article.publishedAt
                ? new Date(article.publishedAt).toLocaleDateString("ar-SA-u-ca-gregory", {
                    month: "short",
                    day: "numeric",
                  })
                : "";

              return (
                <Link key={article.id} href={targetPath}>
                  <div className="group flex items-center gap-3.5 rounded-xl border border-border/50 bg-muted/15 p-3 transition-colors hover:bg-muted/35 cursor-pointer">
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums ${
                        index < 3
                          ? "bg-primary text-primary-foreground"
                          : "bg-primary/10 text-primary"
                      }`}
                    >
                      {index + 1}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                        {article.title}
                      </h4>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="text-[11px] font-normal">
                          {article.category === "Uncategorized" ? "عام" : article.category}
                        </Badge>
                        {formattedDate && (
                          <>
                            <span>•</span>
                            <span>{formattedDate}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-3 text-sm">
                      <div className="flex items-center gap-1.5 rounded-lg bg-background/80 px-2.5 py-1 border border-border/40">
                        <Eye className="h-3.5 w-3.5 text-blue-500" />
                        <span className="font-bold tabular-nums">
                          {(article.views || 0).toLocaleString("en-US")}
                        </span>
                      </div>

                      {article.change > 0 && (
                        <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <TrendingUp className="h-3.5 w-3.5" />
                          <span className="text-xs font-semibold tabular-nums">+{article.change}%</span>
                        </div>
                      )}
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
