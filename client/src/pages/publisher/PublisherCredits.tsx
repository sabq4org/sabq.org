import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublisherAccess } from "@/hooks/usePublisherAccess";
import { PublisherLayout } from "@/components/publisher/PublisherLayout";
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
  FileText,
  Package,
  Ban,
  CheckCircle2,
  Clock3,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

interface CreditPackage {
  id: string;
  packageName: string;
  totalCredits: number;
  usedCredits: number;
  remainingCredits: number;
  isUnlimited: boolean;
  period: string;
  startDate: string;
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

const formatDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-GB", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        calendar: "gregory",
      })
    : "—";

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
  const limit = 20;

  const { data: packagesData, isLoading: packagesLoading } = useQuery<{ packages: CreditPackage[] }>({
    queryKey: ["/api/publisher/portal/credit-packages"],
  });

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

  return (
    <PublisherLayout>
      <div className="w-full space-y-6" dir="rtl">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            الرصيد والباقات
          </h1>
          <p className="mt-1 text-muted-foreground">
            باقات وكالتكم كما تظهر لدى الإدارة، مع سجل كل عملية خصم أو إضافة
          </p>
        </div>

        {/* ملخص الباقة النشطة */}
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
                    من {formatDate(activePackage.startDate)}
                    {activePackage.expiryDate ? ` حتى ${formatDate(activePackage.expiryDate)}` : ""}
                  </p>
                </div>
                <div className="min-w-[220px] rounded-2xl border bg-muted/30 px-5 py-4 text-center">
                  {activePackage.isUnlimited ? (
                    <>
                      <div className="text-3xl font-bold">
                        مفتوحة <span className="text-muted-foreground">∞</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        نُشر منها {activePackage.usedCredits.toLocaleString("en-US")} مادة
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
                      <p className="mt-1 text-xs text-muted-foreground">الرصيد المتبقي</p>
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

        {/* كل الباقات بما فيها المعطّلة/المنتهية */}
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
                          <span className="inline-flex items-center gap-1 font-medium text-foreground">
                            مفتوحة ∞
                          </span>
                        ) : (
                          <span className="tabular-nums">
                            متبقي {pkg.remainingCredits} / {pkg.totalCredits}
                          </span>
                        )}
                        <span className="mx-1">·</span>
                        مستخدم {pkg.usedCredits}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {periodLabel[pkg.period] || pkg.period}
                        {pkg.expiryDate ? ` · حتى ${formatDate(pkg.expiryDate)}` : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* سجل العمليات */}
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
                        <TableHead className="text-right">التاريخ</TableHead>
                        <TableHead className="text-right">نوع العملية</TableHead>
                        <TableHead className="text-right">التغيير</TableHead>
                        <TableHead className="text-right">الرصيد بعد</TableHead>
                        <TableHead className="text-right">الباقة</TableHead>
                        <TableHead className="text-right">المقال</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => {
                        const unlimited = log.creditPackage?.isUnlimited || log.creditsChanged === 0;
                        return (
                          <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                            <TableCell>
                              <div className="flex items-center gap-1 text-sm">
                                <Calendar className="h-3 w-3 text-muted-foreground" />
                                <span>{formatDate(log.createdAt)}</span>
                                <span className="text-muted-foreground">
                                  {new Date(log.createdAt).toLocaleTimeString("en-GB", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    hour12: false,
                                  })}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>{getActionBadge(log.actionType)}</TableCell>
                            <TableCell>
                              <span
                                className={cn(
                                  "font-bold",
                                  log.creditsChanged > 0
                                    ? "text-green-600"
                                    : log.creditsChanged < 0
                                      ? "text-red-600"
                                      : "text-muted-foreground",
                                )}
                                data-testid={`text-change-${log.id}`}
                              >
                                {unlimited && log.actionType === "credit_used"
                                  ? "مفتوحة"
                                  : log.creditsChanged > 0
                                    ? `+${log.creditsChanged}`
                                    : String(log.creditsChanged)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="font-medium tabular-nums" data-testid={`text-after-${log.id}`}>
                                {unlimited && log.actionType === "credit_used" ? "∞" : log.creditsAfter}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Package className="h-3 w-3 text-muted-foreground" />
                                <span className="text-sm">{log.creditPackage.packageName}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {log.article ? (
                                <div className="flex items-center gap-1">
                                  <FileText className="h-3 w-3 text-muted-foreground" />
                                  <span
                                    className="max-w-[240px] truncate text-sm"
                                    title={log.article.title}
                                  >
                                    {log.article.title}
                                  </span>
                                </div>
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
    </PublisherLayout>
  );
}
