import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, CalendarClock, Eye, MessageSquare, ThumbsUp, X } from "lucide-react";

const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

type WriterSummary = {
  id: string;
  name: string;
  email: string | null;
  profileImageUrl: string | null;
  jobTitle: string | null;
  gender: string | null;
  schedule: { weekday: number; publishTime: string; active: boolean; notes: string | null } | null;
  publishedCount: number;
  pendingCount: number;
  totalViews: number;
  lastArticle: { id: string; title: string; slug: string | null; publishedAt: string } | null;
  nextScheduled: { id: string; title: string; scheduledAt: string } | null;
  nextSlot: string | null;
  commitment: "ok" | "due_soon" | "late" | "awaiting_first" | "unassigned";
};

type WriterArticlesResponse = {
  writer: { id: string; name: string; profileImageUrl: string | null } | null;
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
  pagination: { page: number; limit: number; total: number };
};

const COMMITMENT_BADGE: Record<
  WriterSummary["commitment"],
  { label: string; labelF?: string; className: string }
> = {
  ok: {
    label: "ملتزم",
    labelF: "ملتزمة",
    className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  },
  due_soon: {
    label: "موعده قريب ولم يرسل",
    labelF: "موعدها قريب ولم ترسل",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  },
  late: {
    label: "متأخر عن موعده",
    labelF: "متأخرة عن موعدها",
    className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  },
  awaiting_first: {
    label: "بانتظار أول مقالة",
    className: "bg-muted text-muted-foreground",
  },
  unassigned: {
    label: "بلا يوم محدد",
    className: "bg-muted text-muted-foreground",
  },
};

function formatDate(iso: string | null | undefined, withTime = true) {
  if (!iso) return "—";
  try {
    return format(new Date(iso), withTime ? "EEEE d MMMM yyyy — h:mm a" : "EEEE d MMMM yyyy", {
      locale: ar,
    });
  } catch {
    return "—";
  }
}

function ArticleStatusBadge({ status, reviewStatus }: { status: string; reviewStatus: string | null }) {
  if (status === "published")
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">منشورة</Badge>;
  if (status === "scheduled")
    return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">مجدولة</Badge>;
  if (reviewStatus === "pending_review")
    return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">بانتظار المراجعة</Badge>;
  if (reviewStatus === "needs_changes")
    return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">تحتاج تعديلات</Badge>;
  if (reviewStatus === "rejected")
    return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">مرفوضة</Badge>;
  return <Badge variant="outline">مسودة</Badge>;
}

export default function OpinionWritersPage() {
  const { toast } = useToast();
  const [selectedWriterId, setSelectedWriterId] = useState<string | null>(null);

  const { data: writersData, isLoading } = useQuery<{ writers: WriterSummary[] }>({
    queryKey: ["/api/admin/opinion-writers"],
  });
  const writers = Array.isArray(writersData?.writers) ? writersData.writers : [];

  const { data: writerArticles, isLoading: articlesLoading } = useQuery<WriterArticlesResponse>({
    queryKey: [`/api/admin/opinion-writers/${selectedWriterId}/articles`],
    enabled: Boolean(selectedWriterId),
  });

  const scheduleMutation = useMutation({
    mutationFn: async ({
      writerId,
      weekday,
      publishTime,
      active,
    }: {
      writerId: string;
      weekday: number;
      publishTime?: string;
      active?: boolean;
    }) =>
      apiRequest(`/api/admin/opinion-writers/${writerId}/schedule`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekday, publishTime, active }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/opinion-writers"] });
      toast({ title: "تم حفظ يوم النشر" });
    },
    onError: () => {
      toast({ title: "تعذر حفظ يوم النشر", variant: "destructive" });
    },
  });

  const kpis = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    return {
      total: writers.length,
      publishedThisWeek: writers.filter(
        (w) => w.lastArticle && new Date(w.lastArticle.publishedAt).getTime() >= weekAgo,
      ).length,
      dueSoon: writers.filter((w) => w.commitment === "due_soon").length,
      late: writers.filter((w) => w.commitment === "late").length,
    };
  }, [writers]);

  const byWeekday = useMemo(() => {
    const map: WriterSummary[][] = Array.from({ length: 7 }, () => []);
    for (const w of writers) {
      if (w.schedule?.active) map[w.schedule.weekday].push(w);
    }
    return map;
  }, [writers]);

  const todayWeekday = new Date().getDay();

  const handleDayChange = (writer: WriterSummary, value: string) => {
    if (value === "none") {
      if (writer.schedule) {
        scheduleMutation.mutate({
          writerId: writer.id,
          weekday: writer.schedule.weekday,
          active: false,
        });
      }
      return;
    }
    scheduleMutation.mutate({
      writerId: writer.id,
      weekday: parseInt(value),
      publishTime: writer.schedule?.publishTime ?? "06:00",
      active: true,
    });
  };

  const handleTimeChange = (writer: WriterSummary, publishTime: string) => {
    if (!writer.schedule?.active || !publishTime) return;
    if (publishTime === writer.schedule.publishTime) return;
    scheduleMutation.mutate({
      writerId: writer.id,
      weekday: writer.schedule.weekday,
      publishTime,
      active: true,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 md:p-6" dir="rtl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarClock className="h-6 w-6 text-primary" />
            كتّاب الرأي
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            يوم النشر المخصص لكل كاتب، حالة الالتزام، والإحصائيات الكاملة
          </p>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-extrabold tabular-nums">{kpis.total}</div>
              <div className="text-sm text-muted-foreground">كاتباً نشطاً</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-extrabold tabular-nums">{kpis.publishedThisWeek}</div>
              <div className="text-sm text-muted-foreground">نشروا خلال آخر ٧ أيام</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-extrabold tabular-nums text-amber-600 dark:text-amber-400">
                {kpis.dueSoon}
              </div>
              <div className="text-sm text-muted-foreground">موعدهم قريب ولم يرسلوا</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-extrabold tabular-nums text-red-600 dark:text-red-400">
                {kpis.late}
              </div>
              <div className="text-sm text-muted-foreground">متأخرون عن مواعيدهم</div>
            </CardContent>
          </Card>
        </div>

        {/* Weekly distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">توزيع الكتّاب على أيام الأسبوع</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2 overflow-x-auto min-w-[640px] lg:min-w-0">
              {WEEKDAYS.map((day, i) => (
                <div key={day} className={i === todayWeekday ? "rounded-lg bg-primary/5 p-1" : "p-1"}>
                  <div
                    className={`text-xs font-bold pb-1 mb-2 border-b-2 ${
                      i === todayWeekday
                        ? "text-primary border-primary"
                        : "text-muted-foreground border-border"
                    }`}
                  >
                    {day}
                    {i === todayWeekday && " (اليوم)"}
                  </div>
                  {byWeekday[i].length === 0 ? (
                    <div className="text-xs text-muted-foreground italic">شاغر</div>
                  ) : (
                    byWeekday[i].map((w) => (
                      <div
                        key={w.id}
                        className="text-xs bg-muted rounded-md px-2 py-1 mb-1 truncate"
                        title={w.name}
                      >
                        {w.name}
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Writers table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">جدول الكتّاب</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : writers.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                لا يوجد كتّاب رأي بعد
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[860px]">
                  <thead>
                    <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                      <th className="text-right font-bold px-4 py-3">الكاتب</th>
                      <th className="text-right font-bold px-4 py-3">اليوم المخصص</th>
                      <th className="text-right font-bold px-4 py-3">وقت النشر</th>
                      <th className="text-right font-bold px-4 py-3">المقالات المنشورة</th>
                      <th className="text-right font-bold px-4 py-3">آخر مقالة</th>
                      <th className="text-right font-bold px-4 py-3">الحالة</th>
                      <th className="text-right font-bold px-4 py-3">المشاهدات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {writers.map((writer) => {
                      const badge = COMMITMENT_BADGE[writer.commitment];
                      const badgeLabel =
                        writer.gender === "female" && badge.labelF ? badge.labelF : badge.label;
                      return (
                        <tr
                          key={writer.id}
                          className={`border-b last:border-0 ${
                            selectedWriterId === writer.id ? "bg-primary/5" : ""
                          }`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9">
                                <AvatarImage src={writer.profileImageUrl ?? undefined} />
                                <AvatarFallback>{writer.name.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <div className="font-bold whitespace-nowrap">{writer.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {writer.jobTitle ||
                                    (writer.gender === "female" ? "كاتبة رأي" : "كاتب رأي")}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Select
                              value={
                                writer.schedule?.active
                                  ? String(writer.schedule.weekday)
                                  : "none"
                              }
                              onValueChange={(v) => handleDayChange(writer, v)}
                              disabled={scheduleMutation.isPending}
                            >
                              <SelectTrigger className="w-[130px] h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">بدون يوم</SelectItem>
                                {WEEKDAYS.map((day, i) => (
                                  <SelectItem key={i} value={String(i)}>
                                    {day}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-4 py-3">
                            <Input
                              type="time"
                              className="w-[110px] h-9"
                              defaultValue={writer.schedule?.publishTime ?? "06:00"}
                              disabled={!writer.schedule?.active || scheduleMutation.isPending}
                              onBlur={(e) => handleTimeChange(writer, e.target.value)}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <Button
                              variant="ghost"
                              className="px-0 font-extrabold tabular-nums text-primary underline underline-offset-4 hover:text-primary/80"
                              onClick={() =>
                                setSelectedWriterId(
                                  selectedWriterId === writer.id ? null : writer.id,
                                )
                              }
                            >
                              {writer.publishedCount} مقالة
                            </Button>
                            {writer.pendingCount > 0 && (
                              <div className="text-xs text-amber-600 dark:text-amber-400">
                                {writer.pendingCount} بانتظار المراجعة
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 max-w-[220px]">
                            {writer.lastArticle ? (
                              <>
                                <div className="font-medium text-xs truncate" title={writer.lastArticle.title}>
                                  {writer.lastArticle.title}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {formatDate(writer.lastArticle.publishedAt)}
                                </div>
                              </>
                            ) : (
                              <span className="text-muted-foreground text-xs">لا يوجد</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={badge.className}>{badgeLabel}</Badge>
                            {writer.nextScheduled && (
                              <div className="text-xs text-muted-foreground mt-1">
                                مجدولة: {formatDate(writer.nextScheduled.scheduledAt, false)}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 tabular-nums font-medium">
                            {writer.totalViews.toLocaleString("en-US")}
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

        {/* Writer articles drill-down */}
        {selectedWriterId && (
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">
                مقالات {writerArticles?.writer?.name ?? "الكاتب"}
                {writerArticles && (
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    ({writerArticles.totals.totalArticles})
                  </span>
                )}
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setSelectedWriterId(null)}>
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
                  {writerArticles && (
                    <div className="flex flex-wrap gap-x-6 gap-y-2 px-4 py-3 border-b text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Eye className="h-4 w-4" />
                        <b className="text-foreground tabular-nums">
                          {writerArticles.totals.totalViews.toLocaleString("en-US")}
                        </b>{" "}
                        مشاهدة
                      </span>
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="h-4 w-4" />
                        <b className="text-foreground tabular-nums">
                          {writerArticles.totals.totalLikes.toLocaleString("en-US")}
                        </b>{" "}
                        إعجاباً
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-4 w-4" />
                        <b className="text-foreground tabular-nums">
                          {writerArticles.totals.totalComments.toLocaleString("en-US")}
                        </b>{" "}
                        تعليقاً
                      </span>
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[720px]">
                      <thead>
                        <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                          <th className="text-right font-bold px-4 py-3">العنوان</th>
                          <th className="text-right font-bold px-4 py-3">الحالة</th>
                          <th className="text-right font-bold px-4 py-3">التاريخ</th>
                          <th className="text-right font-bold px-4 py-3">المشاهدات</th>
                          <th className="text-right font-bold px-4 py-3">الإعجابات</th>
                          <th className="text-right font-bold px-4 py-3">التعليقات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(writerArticles?.articles ?? []).map((a) => (
                          <tr key={a.id} className="border-b last:border-0">
                            <td className="px-4 py-3 max-w-[300px]">
                              {a.status === "published" && a.slug ? (
                                <a
                                  href={`/opinion/${a.slug}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-medium hover:underline truncate block"
                                  title={a.title}
                                >
                                  {a.title}
                                </a>
                              ) : (
                                <span className="font-medium truncate block" title={a.title}>
                                  {a.title}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <ArticleStatusBadge status={a.status} reviewStatus={a.reviewStatus} />
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
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
