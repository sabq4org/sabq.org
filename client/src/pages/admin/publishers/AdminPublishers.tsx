import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
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
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

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

/** لون صحة تاريخ (باقة/نافذة): أحمر منتهٍ/أسبوع، كهرماني شهر، أخضر غير ذلك */
function expiryBadge(label: string, date: string | null) {
  const days = daysUntil(date);
  if (days === null) return null;
  const className = days < 0
    ? "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-200"
    : days <= 7
      ? "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-200"
      : days <= 30
        ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200"
        : "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-200";
  const text = days < 0
    ? `${label}: منتهية`
    : `${label}: ${format(new Date(date!), "dd/MM/yyyy")} (${days} يوم)`;
  return (
    <Badge variant="outline" className={`gap-1 ${className}`}>
      <Calendar className="h-3 w-3" />
      {text}
    </Badge>
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

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1600px] space-y-6 pb-10" dir="rtl">
        <DashboardPageHeader
          icon={Building2}
          title="إدارة الناشرين"
          description="بطاقات الوكالات: صحة الباقات، النشاط، والطلبات المفتوحة."
          titleTestId="text-page-title"
          actions={
            <Button onClick={() => setShowCreateDialog(true)} data-testid="button-add-publisher">
              <Plus className="ml-2 h-4 w-4" />
              إضافة ناشر جديد
            </Button>
          }
        />

        {/* الطلبات المفتوحة من الوكالات */}
        {openRequests.length > 0 && (
          <Card className="border-amber-300 dark:border-amber-800" data-testid="card-open-requests">
            <CardContent className="pt-6 space-y-3">
              <div className="flex items-center gap-2 font-bold">
                <BellRing className="h-5 w-5 text-amber-600" />
                طلبات مفتوحة من الوكالات
                <Badge variant="secondary">{openRequests.length}</Badge>
              </div>
              {openRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center gap-3 rounded-lg border bg-amber-50/50 p-3 dark:bg-amber-950/20"
                  data-testid={`request-row-${request.id}`}
                >
                  <div className="flex-1 min-w-0 text-sm">
                    <span className="font-bold">{request.agencyName}</span>
                    {" — "}
                    <span>{REQUEST_LABELS[request.type] ?? request.type}</span>
                    {request.message && <span className="text-muted-foreground"> · {request.message}</span>}
                    <span className="text-xs text-muted-foreground mr-2">
                      ({formatDistanceToNow(new Date(request.createdAt), { locale: ar, addSuffix: true })})
                    </span>
                  </div>
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
                      : <CheckCircle className="h-4 w-4 text-green-600" />}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* الفلاتر */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ابحث باسم الوكالة..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-10"
                dir="rtl"
                data-testid="input-search"
              />
            </div>
          </div>
          <div className="w-full md:w-48">
            <Select value={statusFilter} onValueChange={(v: "all" | "active" | "suspended") => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger data-testid="select-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="suspended">معلق</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* بطاقات الوكالات */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">لا توجد نتائج</CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((publisher) => {
              const credit = publisher.activeCredit;
              const creditPercent = credit && !credit.isUnlimited && credit.totalCredits > 0
                ? Math.round((credit.remainingCredits / credit.totalCredits) * 100)
                : null;
              return (
                <Link key={publisher.id} href={`/dashboard/admin/publishers/${publisher.id}`}>
                  <Card
                    className={`h-full cursor-pointer transition-shadow hover:shadow-md ${!publisher.isActive ? "opacity-70 border-red-300 dark:border-red-800" : ""}`}
                    data-testid={`publisher-card-${publisher.id}`}
                  >
                    <CardContent className="pt-6 space-y-3">
                      <div className="flex items-center gap-3">
                        {publisher.logoUrl ? (
                          <img
                            src={publisher.logoUrl}
                            alt={publisher.agencyName}
                            className="h-12 w-12 rounded-lg border bg-white object-contain p-0.5"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg border bg-muted">
                            <Building2 className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-bold truncate">{publisher.agencyName}</p>
                          <p className="text-xs text-muted-foreground truncate">{publisher.contactPerson}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {!publisher.isActive && <Badge variant="destructive">معلقة</Badge>}
                          {publisher.autoPublish && (
                            <Badge className="gap-1 bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200" variant="outline">
                              <Zap className="h-3 w-3" />
                              فوري
                            </Badge>
                          )}
                          {publisher.openRequests > 0 && (
                            <Badge className="gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" variant="outline">
                              <BellRing className="h-3 w-3" />
                              {publisher.openRequests} طلب
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* صحة الباقة */}
                      {credit ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground truncate">{credit.packageName}</span>
                            <span className="font-bold">
                              {credit.isUnlimited
                                ? "مفتوح ∞"
                                : `${credit.remainingCredits} / ${credit.totalCredits}`}
                            </span>
                          </div>
                          {creditPercent !== null && <Progress value={creditPercent} className="h-2" />}
                        </div>
                      ) : (
                        <Badge variant="destructive" className="w-fit">لا توجد باقة نشطة</Badge>
                      )}

                      {/* إنذارات الانتهاء الملونة */}
                      <div className="flex flex-wrap gap-1.5">
                        {credit && expiryBadge("الباقة", credit.expiryDate)}
                        {expiryBadge("النافذة", publisher.publishingEndsAt)}
                      </div>

                      {/* النشاط */}
                      <div className="flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {publisher.publishedArticles} منشور من {publisher.totalArticles}
                        </span>
                        <span>
                          آخر نشاط: {publisher.lastActivityAt
                            ? formatDistanceToNow(new Date(publisher.lastActivityAt), { locale: ar, addSuffix: true })
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
              صفحة {page} من {totalPages} · إجمالي {total} وكالة
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                السابق
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
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
