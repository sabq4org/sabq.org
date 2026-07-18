import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { AdminPublisherNav } from "@/components/admin/publishers/AdminPublisherNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePublisherDialog } from "@/components/admin/publishers/CreatePublisherDialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDateShort, formatNumber, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Plus,
  Search,
  Building2,
  Calendar,
  Zap,
  FileText,
  Loader2,
  BellRing,
  CheckCircle,
  Infinity as InfinityIcon,
} from "lucide-react";

interface RichPublisher {
  id: string;
  agencyName: string;
  logoUrl: string | null;
  contactPerson: string;
  isActive: boolean;
  autoPublish: boolean;
  publishingEndsAt: string | null;
  createdAt: string;
  activeCredit: {
    packageName: string;
    isUnlimited: boolean;
    totalCredits: number;
    usedCredits: number;
    remainingCredits: number;
    expiryDate: string | null;
  } | null;
  totalArticles: number;
  publishedArticles: number;
  lastActivityAt: string | null;
  openRequests: number;
}

interface OpenRequest {
  id: string;
  type: string;
  message: string | null;
  createdAt: string;
  publisherId: string;
  agencyName: string;
  logoUrl: string | null;
}

const REQUEST_LABELS: Record<string, string> = {
  renewal: "تجديد الباقة",
  window_extension: "تمديد فترة النشر",
  other: "طلب آخر",
};

const daysUntil = (date: string | null) =>
  date ? Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000) : null;

function expiryChip(label: string, date: string | null) {
  const days = daysUntil(date);
  if (days === null || !date) return null;
  const tone =
    days < 0 || days <= 7
      ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-800"
      : days <= 30
        ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800"
        : "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800";
  const text =
    days < 0
      ? `${label}: منتهية`
      : `${label}: ${formatDateShort(date)} · ${formatNumber(days)} يوم`;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium", tone)}>
      <Calendar className="h-3 w-3" />
      {text}
    </span>
  );
}

export default function AdminPublishers() {
  useRoleProtection("admin");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [page, setPage] = useState(1);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const isActiveParam = statusFilter === "all" ? undefined : statusFilter === "active";

  const { data: listData, isLoading } = useQuery<{
    publishers: RichPublisher[];
    total: number;
    limit: number;
  }>({
    queryKey: ["/api/admin/publishers/rich-list", { page, limit: 24, isActive: isActiveParam }],
  });
  const publishers = Array.isArray(listData?.publishers) ? listData!.publishers : [];
  const total = Number(listData?.total) || 0;
  const limit = Number(listData?.limit) || 24;

  const { data: requestsData } = useQuery<{ requests: OpenRequest[] }>({
    queryKey: ["/api/admin/publishers/requests"],
    refetchInterval: 120_000,
  });
  const openRequests = Array.isArray(requestsData?.requests) ? requestsData!.requests : [];

  const closeRequestMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest(`/api/admin/publishers/requests/${id}/close`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/publishers/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/publishers/rich-list"] });
      toast({ title: "أُغلق الطلب", description: "وأُبلغ صاحبه بالمعالجة" });
    },
    onError: (error: any) => {
      toast({ title: "خطأ", description: error.message || "فشل إغلاق الطلب", variant: "destructive" });
    },
  });

  const filtered = publishers.filter((p) =>
    search ? p.agencyName.toLowerCase().includes(search.toLowerCase()) : true,
  );
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const pageSummary = useMemo(() => {
    const active = publishers.filter((p) => p.isActive).length;
    const suspended = publishers.filter((p) => !p.isActive).length;
    const noPackage = publishers.filter((p) => !p.activeCredit).length;
    const withRequests = publishers.filter((p) => p.openRequests > 0).length;
    return { active, suspended, noPackage, withRequests };
  }, [publishers]);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1600px] space-y-5 pb-10" dir="rtl">
        <DashboardPageHeader
          icon={Building2}
          title="إدارة الناشرين"
          description="صحة الباقات، النشاط، والطلبات المفتوحة من الوكالات."
          titleTestId="text-page-title"
          actions={
            <Button onClick={() => setShowCreateDialog(true)} data-testid="button-add-publisher">
              <Plus className="ml-2 h-4 w-4" />
              إضافة ناشر جديد
            </Button>
          }
        />

        <AdminPublisherNav />

        {openRequests.length > 0 && (
          <section
            className="rounded-2xl border border-amber-200 bg-gradient-to-l from-amber-50/80 to-card p-4 dark:border-amber-900 dark:from-amber-950/30"
            data-testid="card-open-requests"
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-200">
                <BellRing className="h-4 w-4" />
              </span>
              <h2 className="font-bold">طلبات مفتوحة من الوكالات</h2>
              <Badge variant="secondary">{formatNumber(openRequests.length)}</Badge>
            </div>
            <div className="space-y-2">
              {openRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex flex-col gap-3 rounded-xl border border-amber-200/80 bg-background/80 p-3 sm:flex-row sm:items-center dark:border-amber-900/60"
                  data-testid={`request-row-${request.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{request.agencyName}</p>
                    <p className="text-sm text-muted-foreground">
                      {REQUEST_LABELS[request.type] ?? request.type}
                      {request.message ? ` · ${request.message}` : ""}
                      <span className="mr-2 text-xs">({formatRelativeTime(request.createdAt)})</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/dashboard/admin/publishers/${request.publisherId}`}>
                      <Button variant="outline" size="sm">فتح الوكالة</Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => closeRequestMutation.mutate(request.id)}
                      disabled={closeRequestMutation.isPending}
                      title="إغلاق الطلب"
                      data-testid={`button-close-request-${request.id}`}
                    >
                      {closeRequestMutation.isPending
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <CheckCircle className="h-4 w-4 text-emerald-600" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "إجمالي الوكالات", value: total, tone: "text-foreground" },
            { label: "نشطة (الصفحة)", value: pageSummary.active, tone: "text-emerald-700 dark:text-emerald-300" },
            { label: "معلقة (الصفحة)", value: pageSummary.suspended, tone: "text-red-700 dark:text-red-300" },
            { label: "طلبات مفتوحة", value: openRequests.length, tone: "text-amber-700 dark:text-amber-300" },
          ].map((item) => (
            <Card key={item.label} className="border-border/60 shadow-none">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className={cn("mt-1 text-2xl font-bold tracking-tight", item.tone)}>
                  {formatNumber(item.value)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="ابحث باسم الوكالة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border-0 bg-muted/40 pr-10 shadow-none focus-visible:ring-1"
              dir="rtl"
              data-testid="input-search"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v: "all" | "active" | "suspended") => {
              setStatusFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-44" data-testid="select-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="active">نشط</SelectItem>
              <SelectItem value="suspended">معلق</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">لا توجد نتائج</CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((publisher) => {
              const credit = publisher.activeCredit;
              const creditPercent =
                credit && !credit.isUnlimited && credit.totalCredits > 0
                  ? Math.round((credit.remainingCredits / credit.totalCredits) * 100)
                  : null;

              return (
                <Link key={publisher.id} href={`/dashboard/admin/publishers/${publisher.id}`}>
                  <Card
                    className={cn(
                      "group h-full cursor-pointer overflow-hidden border-border/70 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
                      !publisher.isActive && "border-red-200/80 dark:border-red-900/50",
                    )}
                    data-testid={`publisher-card-${publisher.id}`}
                  >
                    <CardContent className="flex h-full flex-col gap-3 p-4">
                      <div className="flex items-start gap-3">
                        {publisher.logoUrl ? (
                          <img
                            src={publisher.logoUrl}
                            alt={publisher.agencyName}
                            className="h-12 w-12 shrink-0 rounded-xl border bg-white object-contain p-0.5"
                          />
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-muted">
                            <Building2 className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold leading-tight">{publisher.agencyName}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {publisher.contactPerson}
                          </p>
                        </div>
                        <Badge
                          variant={publisher.isActive ? "secondary" : "destructive"}
                          className="shrink-0"
                        >
                          {publisher.isActive ? "نشط" : "معلقة"}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {publisher.autoPublish && (
                          <Badge
                            variant="outline"
                            className="gap-1 border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
                          >
                            <Zap className="h-3 w-3" />
                            نشر فوري
                          </Badge>
                        )}
                        {publisher.openRequests > 0 && (
                          <Badge
                            variant="outline"
                            className="gap-1 border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                          >
                            <BellRing className="h-3 w-3" />
                            {formatNumber(publisher.openRequests)} طلب
                          </Badge>
                        )}
                      </div>

                      {credit ? (
                        <div className="rounded-xl bg-muted/40 p-3">
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="truncate text-muted-foreground">{credit.packageName}</span>
                            <span className="inline-flex shrink-0 items-center gap-1 font-bold">
                              {credit.isUnlimited ? (
                                <>
                                  مفتوح
                                  <InfinityIcon className="h-3.5 w-3.5" />
                                </>
                              ) : (
                                `${formatNumber(credit.remainingCredits)} / ${formatNumber(credit.totalCredits)}`
                              )}
                            </span>
                          </div>
                          {creditPercent !== null && (
                            <Progress value={creditPercent} className="mt-2 h-1.5" />
                          )}
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "rounded-xl border px-3 py-2 text-sm",
                            publisher.isActive
                              ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
                              : "border-border bg-muted/50 text-muted-foreground",
                          )}
                        >
                          لا توجد باقة نشطة
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1.5">
                        {credit && expiryChip("الباقة", credit.expiryDate)}
                        {expiryChip("النافذة", publisher.publishingEndsAt)}
                      </div>

                      <div className="mt-auto flex items-center justify-between border-t pt-2.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {formatNumber(publisher.publishedArticles)} منشور من{" "}
                          {formatNumber(publisher.totalArticles)}
                        </span>
                        <span>
                          آخر نشاط:{" "}
                          {publisher.lastActivityAt
                            ? formatRelativeTime(publisher.lastActivityAt)
                            : "—"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              صفحة {formatNumber(page)} من {formatNumber(totalPages)} · إجمالي {formatNumber(total)} وكالة
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                السابق
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                التالي
              </Button>
            </div>
          </div>
        )}

        <CreatePublisherDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          mode="create"
        />
      </div>
    </DashboardLayout>
  );
}
