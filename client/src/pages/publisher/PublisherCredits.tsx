import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublisherAccess } from "@/hooks/usePublisherAccess";
import { PublisherLayout } from "@/components/publisher/PublisherLayout";
import {
  PublisherRequestDialog,
  REQUEST_TYPE_LABELS,
} from "@/components/publisher/PublisherRequestDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CreditCard,
  Calendar,
  TrendingUp,
  TrendingDown,
  Package,
  Ban,
  CheckCircle2,
  Clock3,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateShort, formatNumber, formatTime } from "@/lib/format";

interface CreditLog {
  id: string;
  actionType: string;
  creditsBefore: number;
  creditsAfter: number;
  creditsChanged: number;
  notes: string | null;
  createdAt: string;
  article: {
    id: string;
    title: string;
  } | null;
  creditPackage: {
    packageName: string;
    isUnlimited?: boolean;
  };
}

interface PublisherRequest {
  id: string;
  type: string;
  message: string | null;
  status: string;
  createdAt: string;
  handledAt: string | null;
}

const REQUEST_STATUS_META: Record<string, { label: string; className: string }> = {
  open: {
    label: "قيد المعالجة",
    className: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  },
  closed: {
    label: "مقبول",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  },
  rejected: {
    label: "غير مقبول",
    className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  },
};

interface CreditPackage {
  id: string;
  packageName: string;
  totalCredits: number;
  usedCredits: number;
  publishedCount?: number;
  remainingCredits: number;
  isUnlimited: boolean;
  period: string;
  startDate: string;
  countingFrom?: string;
  expiryDate: string | null;
  isActive: boolean;
  status: "active" | "inactive" | "expired";
  notes: string | null;
  createdAt: string;
}

const periodLabel: Record<string, string> = {
  monthly: "شهرية",
  quarterly: "ربع سنوية",
  yearly: "سنوية",
  "one-time": "مرة واحدة",
};

function statusMeta(status: CreditPackage["status"]) {
  if (status === "active") {
    return {
      label: "نشطة",
      className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
      icon: CheckCircle2,
    };
  }
  if (status === "expired") {
    return {
      label: "منتهية",
      className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
      icon: Clock3,
    };
  }
  return {
    label: "معطّلة",
    className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
    icon: Ban,
  };
}

export default function PublisherCredits() {
  usePublisherAccess();
  const [page, setPage] = useState(1);
  const [requestOpen, setRequestOpen] = useState(false);
  const limit = 20;

  const { data: packagesData, isLoading: packagesLoading } = useQuery<{ packages: CreditPackage[] }>({
    queryKey: ["/api/publisher/portal/credit-packages"],
  });

  const { data: requestsData } = useQuery<{ requests: PublisherRequest[] }>({
    queryKey: ["/api/publisher/portal/requests"],
  });
  const requests = Array.isArray(requestsData?.requests) ? requestsData!.requests : [];
  const hasOpenRequest = requests.some((request) => request.status === "open");

  const { data: dataRaw, isLoading: logsLoading } = useQuery<{ logs: CreditLog[]; total: number }>({
    queryKey: ["/api/publisher/portal/credit-logs", { page, limit }],
  });

  const packages = Array.isArray(packagesData?.packages) ? packagesData!.packages : [];
  const logs = Array.isArray(dataRaw?.logs) ? dataRaw!.logs : [];
  const total = Number(dataRaw?.total) || 0;
  const activePackage = packages.find((p) => p.status === "active") ?? null;

  const getActionBadge = (actionType: string) => {
    const configs: Record<
      string,
      { variant: "default" | "secondary" | "destructive" | "outline"; label: string; icon: any }
    > = {
      credit_added: { variant: "default", label: "إضافة رصيد", icon: TrendingUp },
      credit_used: { variant: "secondary", label: "استخدام رصيد", icon: TrendingDown },
      credit_refunded: { variant: "outline", label: "استرجاع رصيد", icon: TrendingUp },
      package_expired: { variant: "destructive", label: "انتهت صلاحية الباقة", icon: Package },
    };

    const config = configs[actionType] || {
      variant: "secondary" as const,
      label: actionType,
      icon: CreditCard,
    };
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1" data-testid={`badge-action-${actionType}`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const totalPages = Math.ceil(total / limit) || 1;
  const creditPercent =
    activePackage && !activePackage.isUnlimited && activePackage.totalCredits > 0
      ? Math.round((activePackage.remainingCredits / activePackage.totalCredits) * 100)
      : 0;

  const activeUsed = activePackage?.usedCredits ?? 0;
  const activeCountingFrom = activePackage?.countingFrom || activePackage?.startDate;

  return (
    <PublisherLayout>
      <div className="w-full space-y-6" dir="rtl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">
              الرصيد والباقات
            </h1>
            <p className="mt-1 text-muted-foreground">
              باقات وكالتكم كما تظهر لدى الإدارة، مع عدّاد المنشور الفعلي للباقة المفتوحة
            </p>
          </div>
          <Button
            className="shrink-0 gap-2"
            onClick={() => setRequestOpen(true)}
            disabled={hasOpenRequest}
            data-testid="button-request-renewal"
          >
            <Send className="h-4 w-4" />
            {hasOpenRequest ? "طلبكم قيد المعالجة" : "طلب تجديد الباقة"}
          </Button>
        </div>

        {packagesLoading ? (
          <Skeleton className="h-36 w-full rounded-xl" />
        ) : activePackage ? (
          <Card
            className="overflow-hidden border-border/60 shadow-sm"
            data-testid="card-active-package"
          >
            <CardContent className="pt-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-300">
                    <Package className="h-3.5 w-3.5" />
                    الباقة النشطة حالياً
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight">{activePackage.packageName}</h2>
                  <p className="text-sm text-muted-foreground">
                    {periodLabel[activePackage.period] || activePackage.period}
                    {" · "}
                    من {formatDateShort(activePackage.startDate)}
                    {activePackage.expiryDate ? ` حتى ${formatDateShort(activePackage.expiryDate)}` : ""}
                  </p>
                  {activePackage.isUnlimited && activeCountingFrom ? (
                    <p className="text-xs text-muted-foreground">
                      يُحتسب المنشور منذ {formatDateShort(activeCountingFrom)}
                      {activeCountingFrom !== activePackage.startDate
                        ? " (بداية فترة النشر المفتوح للوكالة)"
                        : ""}
                    </p>
                  ) : null}
                </div>
                <div className="min-w-[240px] rounded-2xl border bg-muted/30 px-5 py-4 text-center">
                  {activePackage.isUnlimited ? (
                    <>
                      <div className="text-3xl font-bold">
                        مفتوحة <span className="text-muted-foreground">∞</span>
                      </div>
                      <p
                        className="mt-2 text-base font-semibold text-foreground"
                        data-testid="text-open-published-count"
                      >
                        نُشر منها {formatNumber(activeUsed)} مادة
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="text-3xl font-bold tabular-nums">
                        {activePackage.remainingCredits}
                        <span className="text-base font-normal text-muted-foreground">
                          {" "}
                          / {activePackage.totalCredits}
                        </span>
                      </div>
                      <Progress value={creditPercent} className="mt-3 h-1.5" />
                      <p className="mt-1 text-xs text-muted-foreground">
                        الرصيد المتبقي · مستخدم {activeUsed}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed" data-testid="card-no-active-package">
            <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
              <Ban className="h-5 w-5" />
              لا توجد باقة نشطة حالياً — ستظهر هنا فور تفعيلها من الإدارة.
            </CardContent>
          </Card>
        )}

        <Card data-testid="card-all-packages">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-5 w-5" />
              باقات الوكالة
            </CardTitle>
          </CardHeader>
          <CardContent>
            {packagesLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : packages.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">لا توجد باقات مسجّلة</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {packages.map((pkg) => {
                  const meta = statusMeta(pkg.status);
                  const StatusIcon = meta.icon;
                  const isFakeOpenName = !pkg.isUnlimited && /مفتوح/.test(pkg.packageName);
                  return (
                    <div
                      key={pkg.id}
                      className={cn(
                        "rounded-xl border p-4",
                        pkg.status === "active"
                          ? "border-teal-200 bg-teal-50/40 dark:border-teal-900 dark:bg-teal-950/20"
                          : "bg-muted/20",
                      )}
                      data-testid={`package-card-${pkg.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold leading-snug">{pkg.packageName}</p>
                        <Badge variant="outline" className={cn("shrink-0 gap-1 border-0", meta.className)}>
                          <StatusIcon className="h-3 w-3" />
                          {meta.label}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {pkg.isUnlimited ? (
                          <span className="font-medium text-foreground">
                            مفتوحة ∞ · نُشر {formatNumber(pkg.usedCredits)}
                          </span>
                        ) : (
                          <span className="tabular-nums">
                            متبقي {formatNumber(pkg.remainingCredits)} / {formatNumber(pkg.totalCredits)}
                            <span className="mx-1">·</span>
                            مستخدم {formatNumber(pkg.usedCredits)}
                          </span>
                        )}
                      </p>
                      {isFakeOpenName ? (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                          ليست باقة مفتوحة فعلياً — باقة محدودة برصيد عددي
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {periodLabel[pkg.period] || pkg.period}
                        {" · من "}
                        {formatDateShort(pkg.countingFrom || pkg.startDate)}
                        {pkg.expiryDate ? ` حتى ${formatDateShort(pkg.expiryDate)}` : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {requests.length > 0 && (
          <Card data-testid="card-publisher-requests">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Send className="h-5 w-5" />
                طلباتكم لدى الإدارة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {requests.map((request) => {
                  const meta = REQUEST_STATUS_META[request.status] ?? REQUEST_STATUS_META.open;
                  return (
                    <div
                      key={request.id}
                      className="flex flex-col gap-2 rounded-xl border bg-muted/20 p-3 sm:flex-row sm:items-center"
                      data-testid={`own-request-${request.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">
                          {REQUEST_TYPE_LABELS[request.type] ?? request.type}
                        </p>
                        {request.message ? (
                          <p className="mt-0.5 text-sm text-muted-foreground">{request.message}</p>
                        ) : null}
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          أُرسل {formatDateShort(request.createdAt)}
                          {request.handledAt ? ` · عولج ${formatDateShort(request.handledAt)}` : ""}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn("shrink-0 border-0", meta.className)}>
                        {meta.label}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <Card data-testid="card-credit-logs">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-5 w-5" />
              سجل العمليات
            </CardTitle>
          </CardHeader>
          <CardContent>
            {logsLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : logs.length === 0 ? (
              <div className="py-12 text-center" data-testid="text-no-logs">
                <CreditCard className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-lg font-medium">لا يوجد سجل</p>
                <p className="mt-1 text-muted-foreground">لم تُسجَّل عمليات على الرصيد بعد</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px] text-right">التاريخ</TableHead>
                        <TableHead className="w-[110px] text-right">العملية</TableHead>
                        <TableHead className="w-[70px] text-right">التغيير</TableHead>
                        <TableHead className="w-[70px] text-right">بعد</TableHead>
                        <TableHead className="w-[120px] text-right">الباقة</TableHead>
                        <TableHead className="min-w-[280px] text-right">المقال</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => {
                        const isOpenUse =
                          log.actionType === "credit_used" &&
                          (log.creditPackage?.isUnlimited || log.creditsChanged === 0);
                        return (
                          <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                            <TableCell className="align-top text-xs whitespace-nowrap">
                              <div>{formatDateShort(log.createdAt)}</div>
                              <div className="text-muted-foreground">
                                {formatTime(log.createdAt, { format24: true })}
                              </div>
                            </TableCell>
                            <TableCell className="align-top">{getActionBadge(log.actionType)}</TableCell>
                            <TableCell className="align-top">
                              <span
                                className={cn(
                                  "text-sm font-bold",
                                  log.creditsChanged > 0
                                    ? "text-green-600"
                                    : log.creditsChanged < 0
                                      ? "text-red-600"
                                      : "text-muted-foreground",
                                )}
                                data-testid={`text-change-${log.id}`}
                              >
                                {isOpenUse
                                  ? "∞"
                                  : log.creditsChanged > 0
                                    ? `+${log.creditsChanged}`
                                    : String(log.creditsChanged)}
                              </span>
                            </TableCell>
                            <TableCell className="align-top">
                              <span className="text-sm font-medium tabular-nums" data-testid={`text-after-${log.id}`}>
                                {isOpenUse ? "∞" : log.creditsAfter}
                              </span>
                            </TableCell>
                            <TableCell className="align-top text-xs leading-snug">
                              {log.creditPackage.packageName}
                            </TableCell>
                            <TableCell className="align-top">
                              {log.article ? (
                                <p className="text-sm leading-relaxed whitespace-normal break-words">
                                  {log.article.title}
                                </p>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {totalPages > 1 && (
                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-sm text-muted-foreground" data-testid="text-pagination-info">
                      صفحة {page} من {totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        data-testid="button-prev-page"
                      >
                        السابق
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        data-testid="button-next-page"
                      >
                        التالي
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <PublisherRequestDialog open={requestOpen} onOpenChange={setRequestOpen} defaultType="renewal" />
    </PublisherLayout>
  );
}
