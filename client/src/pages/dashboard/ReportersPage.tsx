import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { apiUrl } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Loader2,
  Mic,
  Eye,
  MessageSquare,
  ThumbsUp,
  X,
  BadgeCheck,
  Search,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ReporterSummary = {
  id: string;
  name: string;
  email: string | null;
  profileImageUrl: string | null;
  jobTitle: string | null;
  city: string | null;
  publishedCount: number;
  pendingCount: number;
  totalViews: number;
  lastArticle: { id: string; title: string; slug: string | null; publishedAt: string } | null;
  lastLoginAt: string | null;
  mediaLicense: {
    hasLicense: boolean;
    expired: boolean;
    expiringSoon: boolean;
    number: string | null;
    submittedAt: string | null;
    expiresAt: string | null;
    hasFile: boolean;
  };
};

type LicenseFilter = "all" | "licensed" | "expired" | "missing";

type ReporterArticlesResponse = {
  reporter: { id: string; name: string; profileImageUrl: string | null } | null;
  articles: Array<{
    id: string;
    title: string;
    slug: string | null;
    status: string;
    reviewStatus: string | null;
    publishedAt: string | null;
    scheduledAt: string | null;
    createdAt: string | null;
    views: number;
    likes: number;
    comments: number;
  }>;
  totals: { totalArticles: number; totalViews: number; totalLikes: number; totalComments: number };
};

function formatDate(iso: string | null | undefined, withTime = true) {
  if (!iso) return "—";
  try {
    return format(new Date(iso), withTime ? "EEEE d MMMM yyyy — h:mm a" : "d/M/yyyy", {
      locale: ar,
    });
  } catch {
    return "—";
  }
}

function ArticleStatusBadge({ status, reviewStatus }: { status: string; reviewStatus: string | null }) {
  if (status === "published")
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">منشور</Badge>;
  if (status === "scheduled")
    return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">مجدول</Badge>;
  if (reviewStatus === "pending_review")
    return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">بانتظار المراجعة</Badge>;
  if (reviewStatus === "needs_changes")
    return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">تحتاج تعديلات</Badge>;
  if (reviewStatus === "rejected")
    return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">مرفوض</Badge>;
  return <Badge variant="outline">مسودة</Badge>;
}

export default function ReportersPage() {
  const [selectedReporterId, setSelectedReporterId] = useState<string | null>(null);
  const [licenseFilter, setLicenseFilter] = useState<LicenseFilter>("all");
  const [search, setSearch] = useState("");

  const { data: reportersData, isLoading } = useQuery<{ reporters: ReporterSummary[] }>({
    queryKey: ["/api/admin/reporters"],
  });
  const reporters = Array.isArray(reportersData?.reporters) ? reportersData.reporters : [];

  const { data: reporterArticles, isLoading: articlesLoading } = useQuery<ReporterArticlesResponse>({
    queryKey: [`/api/admin/reporters/${selectedReporterId}/articles`],
    enabled: Boolean(selectedReporterId),
  });

  const kpis = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const licensed = reporters.filter((r) => r.mediaLicense?.hasLicense).length;
    const expiredLicense = reporters.filter((r) => r.mediaLicense?.expired).length;
    const expiringSoon = reporters.filter((r) => r.mediaLicense?.expiringSoon).length;
    const missingLicense = reporters.filter(
      (r) => !r.mediaLicense?.hasLicense && !r.mediaLicense?.expired,
    ).length;
    const activeWeek = reporters.filter((r) => {
      const lastArt = r.lastArticle ? new Date(r.lastArticle.publishedAt).getTime() : 0;
      const lastLogin = r.lastLoginAt ? new Date(r.lastLoginAt).getTime() : 0;
      return Math.max(lastArt, lastLogin) >= weekAgo;
    }).length;
    return {
      total: reporters.length,
      licensed,
      expiredLicense,
      expiringSoon,
      missingLicense,
      activeWeek,
    };
  }, [reporters]);

  const filteredReporters = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = reporters.filter((r) => {
      if (licenseFilter === "licensed" && !r.mediaLicense?.hasLicense) return false;
      if (
        licenseFilter === "expired" &&
        !r.mediaLicense?.expired &&
        !r.mediaLicense?.expiringSoon
      )
        return false;
      if (
        licenseFilter === "missing" &&
        (r.mediaLicense?.hasLicense || r.mediaLicense?.expired)
      )
        return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.email?.toLowerCase().includes(q) ?? false) ||
        (r.city?.toLowerCase().includes(q) ?? false) ||
        (r.mediaLicense?.number?.toLowerCase().includes(q) ?? false)
      );
    });

    const licenseRank = (r: ReporterSummary) => {
      if (r.mediaLicense?.expired) return 0;
      if (r.mediaLicense?.expiringSoon) return 1;
      if (!r.mediaLicense?.hasLicense) return 2;
      return 3;
    };
    const expiresMs = (r: ReporterSummary) => {
      const raw = r.mediaLicense?.expiresAt;
      if (!raw) return Number.POSITIVE_INFINITY;
      const t = new Date(raw).getTime();
      return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
    };

    return filtered.sort((a, b) => {
      const rankDiff = licenseRank(a) - licenseRank(b);
      if (rankDiff !== 0) return rankDiff;
      const expDiff = expiresMs(a) - expiresMs(b);
      if (expDiff !== 0) return expDiff;
      return a.name.localeCompare(b.name, "ar");
    });
  }, [reporters, licenseFilter, search]);

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 sm:p-6" dir="rtl">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Mic className="h-6 w-6 text-primary" />
            المراسلون
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            الترخيص المهني، المدينة، نشاط النشر، والإحصائيات
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-extrabold tabular-nums">{kpis.total}</div>
              <div className="text-sm text-muted-foreground">مراسل نشط</div>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer border-emerald-200/60 transition-shadow hover:shadow-md dark:border-emerald-900/40"
            onClick={() => setLicenseFilter("licensed")}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <BadgeCheck className="h-5 w-5 text-emerald-600" />
                <div className="text-2xl font-extrabold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {kpis.licensed}
                </div>
              </div>
              <div className="text-sm text-muted-foreground">ترخيص ساري</div>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer border-red-200/60 transition-shadow hover:shadow-md dark:border-red-900/40"
            onClick={() => setLicenseFilter("expired")}
          >
            <CardContent className="p-4">
              <div className="text-2xl font-extrabold tabular-nums text-red-600 dark:text-red-400">
                {kpis.expiredLicense + kpis.expiringSoon}
              </div>
              <div className="text-sm text-muted-foreground">منتهٍ / جدّد</div>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer border-amber-200/60 transition-shadow hover:shadow-md dark:border-amber-900/40"
            onClick={() => setLicenseFilter("missing")}
          >
            <CardContent className="p-4">
              <div className="text-2xl font-extrabold tabular-nums text-amber-600 dark:text-amber-400">
                {kpis.missingLicense}
              </div>
              <div className="text-sm text-muted-foreground">بدون ترخيص</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-extrabold tabular-nums">{kpis.activeWeek}</div>
              <div className="text-sm text-muted-foreground">نشطون آخر ٧ أيام</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="space-y-3 pb-3">
            <div className="relative max-w-md">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو البريد أو المدينة أو رقم الترخيص"
                className="pr-9"
                data-testid="input-reporters-search"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: "all" as const, label: "الكل" },
                  { id: "licensed" as const, label: `ساري (${kpis.licensed})` },
                  {
                    id: "expired" as const,
                    label: `منتهٍ/جدّد (${kpis.expiredLicense + kpis.expiringSoon})`,
                  },
                  { id: "missing" as const, label: `بدون ترخيص (${kpis.missingLicense})` },
                ] as const
              ).map((tab) => (
                <Button
                  key={tab.id}
                  size="sm"
                  variant={licenseFilter === tab.id ? "default" : "outline"}
                  onClick={() => setLicenseFilter(tab.id)}
                  data-testid={`filter-license-${tab.id}`}
                >
                  {tab.label}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredReporters.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">لا يوجد مراسلون</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                      <th className="px-4 py-3 text-right font-bold">المراسل</th>
                      <th className="px-4 py-3 text-right font-bold">الترخيص المهني</th>
                      <th className="px-4 py-3 text-right font-bold">المدينة</th>
                      <th className="px-4 py-3 text-right font-bold">منشورة</th>
                      <th className="px-4 py-3 text-right font-bold">آخر خبر</th>
                      <th className="px-4 py-3 text-right font-bold">آخر دخول</th>
                      <th className="px-4 py-3 text-right font-bold">المشاهدات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReporters.map((reporter) => {
                      const license = reporter.mediaLicense;
                      return (
                        <tr
                          key={reporter.id}
                          className={cn(
                            "border-b last:border-0",
                            selectedReporterId === reporter.id && "bg-primary/5",
                          )}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9">
                                <AvatarImage src={reporter.profileImageUrl ?? undefined} />
                                <AvatarFallback>{reporter.name.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <div className="whitespace-nowrap font-bold">{reporter.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {reporter.email || reporter.jobTitle || "مراسل"}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-middle">
                            {license?.hasLicense || license?.expired ? (
                              <div className="flex max-w-[11rem] flex-col gap-1">
                                <div className="flex items-center gap-1">
                                  {license.expired ? (
                                    <Badge className="gap-1 border-0 bg-rose-100 text-rose-900 hover:bg-rose-100">
                                      منتهٍ
                                    </Badge>
                                  ) : license.expiringSoon ? (
                                    <Badge
                                      className="gap-1 border-0 bg-red-600 text-white hover:bg-red-600"
                                      title="أقل من شهرين — يجب التجديد للاستمرار"
                                    >
                                      جدّد الترخيص
                                    </Badge>
                                  ) : (
                                    <Badge className="gap-1 bg-emerald-100 text-emerald-800">
                                      <BadgeCheck className="h-3 w-3" />
                                      مرخّص
                                    </Badge>
                                  )}
                                  {license.hasFile && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 shrink-0 text-muted-foreground"
                                      title="عرض ملف الترخيص"
                                      onClick={() =>
                                        window.open(
                                          apiUrl(
                                            `/api/admin/reporters/${reporter.id}/media-license-file`,
                                          ),
                                          "_blank",
                                          "noopener",
                                        )
                                      }
                                    >
                                      <FileText className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                                {license.expiresAt && (
                                  <div
                                    className={cn(
                                      "text-[11px] tabular-nums leading-none",
                                      license.expiringSoon || license.expired
                                        ? "font-semibold text-red-700"
                                        : "text-muted-foreground",
                                    )}
                                  >
                                    حتى{" "}
                                    {format(new Date(license.expiresAt), "d/M/yyyy", { locale: ar })}
                                  </div>
                                )}
                                {license.number && (
                                  <div
                                    className="truncate text-[11px] tabular-nums leading-none text-muted-foreground"
                                    dir="ltr"
                                    title={license.number}
                                  >
                                    {license.number}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <Badge className="gap-1 border-0 bg-amber-100 text-amber-900 hover:bg-amber-100">
                                غير مرخّص
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {reporter.city || <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <Button
                              variant="ghost"
                              className="px-0 font-extrabold tabular-nums text-primary underline underline-offset-4"
                              onClick={() =>
                                setSelectedReporterId(
                                  selectedReporterId === reporter.id ? null : reporter.id,
                                )
                              }
                            >
                              {reporter.publishedCount} خبر
                            </Button>
                            {reporter.pendingCount > 0 && (
                              <div className="text-xs text-amber-600 dark:text-amber-400">
                                {reporter.pendingCount} بانتظار المراجعة
                              </div>
                            )}
                          </td>
                          <td className="max-w-[220px] px-4 py-3">
                            {reporter.lastArticle ? (
                              <>
                                <div
                                  className="truncate text-xs font-medium"
                                  title={reporter.lastArticle.title}
                                >
                                  {reporter.lastArticle.title}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {formatDate(reporter.lastArticle.publishedAt, false)}
                                </div>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">لا يوجد</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {reporter.lastLoginAt
                              ? formatDate(reporter.lastLoginAt, false)
                              : "—"}
                          </td>
                          <td className="px-4 py-3 font-medium tabular-nums">
                            {reporter.totalViews.toLocaleString("en-US")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {selectedReporterId && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base">
                أخبار {reporterArticles?.reporter?.name ?? "المراسل"}
                {reporterArticles && (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    ({reporterArticles.totals.totalArticles})
                  </span>
                )}
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setSelectedReporterId(null)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {articlesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {reporterArticles && (
                    <div className="flex flex-wrap gap-x-6 gap-y-2 border-b px-4 py-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Eye className="h-4 w-4" />
                        <b className="tabular-nums text-foreground">
                          {reporterArticles.totals.totalViews.toLocaleString("en-US")}
                        </b>{" "}
                        مشاهدة
                      </span>
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="h-4 w-4" />
                        <b className="tabular-nums text-foreground">
                          {reporterArticles.totals.totalLikes.toLocaleString("en-US")}
                        </b>{" "}
                        إعجاباً
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-4 w-4" />
                        <b className="tabular-nums text-foreground">
                          {reporterArticles.totals.totalComments.toLocaleString("en-US")}
                        </b>{" "}
                        تعليقاً
                      </span>
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                          <th className="px-4 py-3 text-right font-bold">العنوان</th>
                          <th className="px-4 py-3 text-right font-bold">الحالة</th>
                          <th className="px-4 py-3 text-right font-bold">التاريخ</th>
                          <th className="px-4 py-3 text-right font-bold">المشاهدات</th>
                          <th className="px-4 py-3 text-right font-bold">الإعجابات</th>
                          <th className="px-4 py-3 text-right font-bold">التعليقات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(reporterArticles?.articles ?? []).map((a) => (
                          <tr key={a.id} className="border-b last:border-0">
                            <td className="max-w-[300px] px-4 py-3">
                              {a.status === "published" && a.slug ? (
                                <a
                                  href={`/article/${a.slug}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block truncate font-medium hover:underline"
                                  title={a.title}
                                >
                                  {a.title}
                                </a>
                              ) : (
                                <span className="block truncate font-medium" title={a.title}>
                                  {a.title}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <ArticleStatusBadge status={a.status} reviewStatus={a.reviewStatus} />
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                              {formatDate(a.publishedAt ?? a.scheduledAt ?? a.createdAt)}
                            </td>
                            <td className="px-4 py-3 tabular-nums">
                              {a.views.toLocaleString("en-US")}
                            </td>
                            <td className="px-4 py-3 tabular-nums">
                              {a.likes.toLocaleString("en-US")}
                            </td>
                            <td className="px-4 py-3 tabular-nums">
                              {a.comments.toLocaleString("en-US")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
