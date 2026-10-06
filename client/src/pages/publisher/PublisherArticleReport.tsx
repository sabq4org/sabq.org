import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { ArrowRight, ExternalLink, Eye, Receipt, Route as RouteIcon, TrendingUp } from "lucide-react";
import { usePublisherAccess } from "@/hooks/usePublisherAccess";
import { PublisherLayout } from "@/components/publisher/PublisherLayout";
import { PlacementChips, UsualComparison, type ArticlePlacements, type VsUsual } from "@/components/publisher/ArticleInsights";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ArticleReport {
  article: {
    id: string;
    title: string;
    status: string;
    englishSlug: string | null;
    imageUrl: string | null;
    views: number | null;
    categoryName: string | null;
    createdAt: string;
    publisherSubmittedAt: string | null;
    publisherApprovedAt: string | null;
    publisherStatus: string | null;
    publisherReviewNotes: string | null;
    scheduledAt: string | null;
    publishedAt: string | null;
    authorName: string | null;
  };
  vsUsual: VsUsual | null;
  usualMedian: number | null;
  placements: ArticlePlacements | null;
  ledger: Array<{ actionType: string; creditsChanged: number; notes: string | null; createdAt: string }>;
}

const LEDGER_LABELS: Record<string, string> = {
  credit_used: "خُصم من الباقة",
  credit_settled: "تسوية دفترية بلا خصم",
  credit_refunded: "استُرجع الرصيد",
};

export default function PublisherArticleReport() {
  usePublisherAccess();
  const [, params] = useRoute("/dashboard/publisher/articles/:id/report");
  const id = params?.id ?? "";

  const { data, isLoading, error } = useQuery<ArticleReport>({
    queryKey: [`/api/publisher/portal/articles/${id}/report`],
    enabled: !!id,
  });

  const back = (
    <Link href="/dashboard/publisher/articles">
      <Button variant="ghost" size="sm" className="gap-1.5">
        <ArrowRight className="h-4 w-4" />
        كل الأخبار
      </Button>
    </Link>
  );

  if (isLoading) {
    return (
      <PublisherLayout>
        <div className="space-y-4" dir="rtl">
          <Skeleton className="h-10 w-2/3" />
          <div className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        </div>
      </PublisherLayout>
    );
  }

  if (error || !data) {
    return (
      <PublisherLayout>
        <div className="space-y-4" dir="rtl">
          {back}
          <p className="rounded-xl border border-dashed py-12 text-center text-muted-foreground">
            لم نجد هذا الخبر في حساب وكالتكم.
          </p>
        </div>
      </PublisherLayout>
    );
  }

  const { article, vsUsual, usualMedian, placements } = data;
  const ledger = Array.isArray(data.ledger) ? data.ledger : [];
  const viewHref = article.englishSlug ? `/article/${article.englishSlug}` : `/article/${article.id}`;

  const journey: Array<{ label: string; at: string | null }> = [
    { label: "أُنشئ", at: article.createdAt },
    { label: "أُرسل للمراجعة", at: article.publisherSubmittedAt },
    { label: "اعتمده المحرر", at: article.publisherApprovedAt },
    { label: "نُشر", at: article.publishedAt },
    { label: "تنبيه للقراء", at: placements?.push?.sentAt ?? null },
    { label: "نُشر على X", at: placements?.x?.publishedAt ?? null },
  ].filter((step, i) => i === 0 || i === 3 || step.at);

  const hasPlacement = !!placements && (placements.featured || placements.breaking || !!placements.push || !!placements.x);

  return (
    <PublisherLayout>
      <div className="w-full space-y-6" dir="rtl">
        <div className="space-y-2">
          {back}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <h1 className="text-2xl font-bold leading-snug" data-testid="text-report-title">
                {article.title}
              </h1>
              <p className="text-sm text-muted-foreground">
                {[article.categoryName, article.authorName ? `كتبه ${article.authorName}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            {article.status === "published" ? (
              <Button variant="outline" size="sm" className="shrink-0 gap-1.5" asChild>
                <a href={viewHref} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  فتح الخبر في سبق
                </a>
              </Button>
            ) : (
              <Badge variant="secondary">لم يُنشر بعد</Badge>
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Eye className="h-4 w-4" />
                القراءات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tabular-nums" data-testid="text-report-views">
                {formatNumber(article.views ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                مقارنة بالمعتاد في القسم
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <UsualComparison value={vsUsual} status={article.status} className="text-sm" />
              <p className="text-xs text-muted-foreground">
                {usualMedian
                  ? `المعتاد في ${article.categoryName ?? "القسم"} سبق: ${formatNumber(usualMedian)} قراءة (الوسيط لآخر 90 يومًا).`
                  : "لا يوجد معتاد موثوق لهذا القسم بعد."}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Receipt className="h-4 w-4" />
                قيد الرصيد
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {ledger.length === 0 ? (
                <p className="text-muted-foreground">{article.status === "published" ? "لا يوجد قيد" : "يُقيَّد عند النشر"}</p>
              ) : (
                ledger.map((entry, i) => (
                  <p key={i}>
                    <span className="font-medium">{LEDGER_LABELS[entry.actionType] ?? entry.actionType}</span>
                    <span className="text-muted-foreground"> · {formatDateTime(entry.createdAt)}</span>
                  </p>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <RouteIcon className="h-4 w-4" />
                رحلة الخبر
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3" data-testid="article-journey">
                {journey.map((step) => (
                  <li key={step.label} className="flex items-start gap-3 text-sm">
                    <span
                      aria-hidden
                      className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", step.at ? "bg-emerald-500" : "bg-muted-foreground/30")}
                    />
                    <span className="w-32 shrink-0 font-medium">{step.label}</span>
                    <span className="text-muted-foreground">{step.at ? formatDateTime(step.at) : "لم يحدث بعد"}</span>
                  </li>
                ))}
              </ol>
              {article.publisherReviewNotes && article.status !== "published" ? (
                <p className="mt-4 rounded-lg bg-orange-50 p-3 text-sm text-orange-900 dark:bg-orange-950/30 dark:text-orange-200">
                  ملاحظة المحرر: {article.publisherReviewNotes}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">أين ظهر الخبر</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {hasPlacement ? (
                <PlacementChips value={placements} />
              ) : (
                <p className="text-muted-foreground">
                  {article.status === "published" ? "نُشر في قسمه وفي آخر الأخبار." : "يظهر بعد النشر."}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                نعرض ما سجله سبق فعلًا لهذا الخبر: التمييز في الرئيسية، والعاجل، وتنبيه القراء، والنشر على X.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </PublisherLayout>
  );
}
