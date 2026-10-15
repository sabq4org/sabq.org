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
import { PublisherPageHeader } from "@/components/publisher/PublisherPageHeader";
import { PublisherRenewalCard } from "@/components/publisher/PublisherRenewalCard";
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
  adminNote: string | null;
}

const REQUEST_STATUS_META: Record<string, { label: string; className: string }> = {
  open: {
    label: "قيد المعالجة",
    className: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  },
  offered: {
    label: "وصل العرض",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  },
  accepted: {
    label: "بانتظار الدفع",
    className: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
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
  const hasOpenRequest = requests.some((request) => ["open", "offered", "accepted"].includes(request.status));

  const { data: statementData } = useQuery<{
    months: Array<{ month: string; published: number; charged: number; settled: number; missing: number }>;
  }>({ queryKey: ["/api/publisher/portal/statement"] });
  const statement = Array.isArray(statementData?.months) ? statementData!.months : [];

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
      credit_settled: { variant: "outline", label: "تسوية دفترية", icon: CreditCard },
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
  // الانتهاء مخزّن كبداية اليوم التالي بتوقيت الرياض، فآخر يوم = الانتهاء ناقص لحظة
  const timeline = (() => {
    if (!activePackage?.expiryDate) return null;
    const start = new Date(activePackage.startDate).getTime();
    const end = new Date(activePackage.expiryDate).getTime();
    if (!(end > start)) return null;
    const day = 86_400_000;
    const now = Date.now();
    const elapsed = Math.min(Math.max(now - start, 0), end - start);
    return {
      percent: Math.round((elapsed / (end - start)) * 100),
      elapsedDays: Math.floor(elapsed / day),
      remainingDays: Math.max(0, Math.ceil((end - now) / day)),
      lastDay: new Date(end - 1).toISOString(),
    };
  })();
  const activeCountingFrom = activePackage?.countingFrom || activePackage?.startDate;

  return (
    <PublisherLayout>
      <div className="w-full space-y-6" dir="rtl">
        <PublisherPageHeader
          icon={CreditCard}
          eyebrow="الباقة وكشف الحساب"
          title="باقتكم الحالية وما خُصم منها"
          description="كما تظهر لدى إدارة سبق، شهرًا بشهر."
          actions={
            <Button
              className="gap-2 rounded-xl shadow-sm"
              onClick={() => setRequestOpen(true)}
              disabled={hasOpenRequest}
              data-testid="button-request-renewal"
            >
              <Send className="h-4 w-4" />
              {hasOpenRequest ? "طلبكم قيد المعالجة" : "طلب تجديد الباقة"}
            </Button>
          }
        />

        <PublisherRenewalCard />

        {packagesLoading ? (
          <Skeleton className="h-36 w-full rounded-xl" />
        ) : activePackage ? (
          <Card className="overflow-hidden border-border/60 shadow-sm" data-testid="card-active-package">
            <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div className="space-y-2 p-5">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                  <CheckCircle2 className="h-3 w-3" />
                  نشطة
                </span>
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{activePackage.packageName}</h2>
                <p className="text-sm text-muted-foreground">
                  {activePackage.isUnlimited
                    ? "نشر بلا حد طوال مدة الباقة"
                    : `${periodLabel[activePackage.period] || activePackage.period} · ${formatNumber(activePackage.totalCredits)} خبر`}
                </p>
                {timeline ? (
                  <div className="space-y-1.5 pt-2" data-testid="package-timeline">
                    <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${timeline.percent}%` }} />
                    </div>
                    <div className="flex flex-wrap justify-between gap-x-3 text-xs tabular-nums text-muted-foreground">
                      <span>{formatDateShort(activePackage.startDate)}</span>
                      <span className="font-medium text-foreground">
                        مضى {formatNumber(timeline.elapsedDays)} يومًا · باقي {formatNumber(timeline.remainingDays)}
                      </span>
                      <span>{formatDateShort(timeline.lastDay)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">من {formatDateShort(activePackage.startDate)} · بلا تاريخ انتهاء</p>
                )}
              </div>
              <div className="space-y-1 border-t border-border/60 p-5 lg:border-s lg:border-t-0">
                {activePackage.isUnlimited ? (
                  <>
                    <span className="text-xs text-muted-foreground">نُشر خلال الباقة المفتوحة</span>
                    <div className="text-3xl font-bold tracking-tight tabular-nums" data-testid="text-open-published-count">
                      {formatNumber(activeUsed)} خبرًا
                    </div>
                    {activeCountingFrom ? (
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pt-2 text-sm">
                        <dt className="text-muted-foreground">يُحتسب منذ</dt>
                        <dd className="font-medium">{formatDateShort(activeCountingFrom)}</dd>
                        {activeCountingFrom !== activePackage.startDate ? (
                          <>
                            <dt className="text-muted-foreground">قبلها</dt>
                            <dd className="font-medium">باقة سابقة محدودة</dd>
                          </>
                        ) : null}
                      </dl>
                    ) : null}
                  </>
                ) : (
                  <>
                    <span className="text-xs text-muted-foreground">الرصيد المتبقي</span>
                    <div className="text-3xl font-bold tracking-tight tabular-nums">
                      {formatNumber(activePackage.remainingCredits)}
                      <span className="text-base font-normal text-muted-foreground"> / {formatNumber(activePackage.totalCredits)}</span>
                    </div>
                    <Progress value={creditPercent} className="mt-2 h-1.5" />
                    <p className="text-xs text-muted-foreground">مستخدم {formatNumber(activeUsed)}</p>
                  </>
                )}
              </div>
            </div>
          </Card>
        ) : (
          <Card className="border-dashed" data-testid="card-no-active-package">
            <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
              <Ban className="h-5 w-5" />
              لا توجد باقة نشطة حالياً — ستظهر هنا فور تفعيلها من الإدارة.
            </CardContent>
          </Card>
        )}

        {statement.length > 0 && (
          <Card className="overflow-hidden border-border/60 shadow-sm" data-testid="card-statement">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-5 py-3.5">
              <h3 className="flex items-center gap-2 font-semibold">
                <CreditCard className="h-4 w-4" />
                كشف الحساب الشهري
              </h3>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
                  قيد خصم
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-violet-500" />
                  تسوية
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="bg-muted/50 text-xs text-muted-foreground">
                    <th className="px-5 py-2.5 text-start font-medium">الشهر</th>
                    <th className="px-3 py-2.5 text-start font-medium">منشور</th>
                    <th className="px-3 py-2.5 text-start font-medium">قيد خصم</th>
                    <th className="px-3 py-2.5 text-start font-medium">تسوية</th>
                    <th className="px-3 py-2.5 text-start font-medium">التوزيع</th>
                    <th className="px-5 py-2.5 text-start font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {statement.map((row) => {
                    const base = Math.max(1, row.published);
                    return (
                      <tr key={row.month} data-testid={`statement-${row.month}`}>
                        <td className="whitespace-nowrap px-5 py-2.5 font-medium">
                          {new Date(`${row.month}-01T00:00:00Z`).toLocaleDateString("ar-SA-u-ca-gregory", {
                            month: "long",
                            year: "numeric",
                            timeZone: "UTC",
                          })}
                        </td>
                        <td className="px-3 py-2.5">{formatNumber(row.published)}</td>
                        <td className="px-3 py-2.5">{formatNumber(row.charged)}</td>
                        <td className="px-3 py-2.5">{formatNumber(row.settled)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex h-2 min-w-[90px] overflow-hidden rounded-full bg-muted" aria-hidden>
                            <span className="h-full bg-primary" style={{ width: `${(row.charged / base) * 100}%` }} />
                            <span className="h-full bg-violet-500" style={{ width: `${(row.settled / base) * 100}%` }} />
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-5 py-2.5">
                          {row.missing === 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                              <CheckCircle2 className="h-3 w-3" />
                              مطابق
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                              {formatNumber(row.missing)} بلا قيد
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">
              «تسوية» قيد دفتري بلا خصم سُجّل في 6 أكتوبر 2026 لأخبار نُشرت قبل توحيد الخصم. «مطابق» يعني أن لكل خبر منشور قيدًا
              واحدًا.
            </p>
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
                        {request.adminNote ? (
                          <p
                            className={cn(
                              "mt-1.5 rounded-lg border px-2.5 py-1.5 text-sm",
                              request.status === "rejected"
                                ? "border-red-200 bg-red-50/60 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100"
                                : "border-border bg-muted/40",
                            )}
                            data-testid={`request-admin-note-${request.id}`}
                          >
                            <span className="font-medium">ردّ الإدارة:</span> {request.adminNote}
                          </p>
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
