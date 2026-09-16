import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { AdminPublisherNav } from "@/components/admin/publishers/AdminPublisherNav";
import { PublisherRequestsPanel } from "@/components/admin/publishers/PublisherRequestsPanel";
import {
  HEALTH_FILTERS,
  getHealthMeta,
  matchesHealthFilter,
} from "@/components/admin/publishers/publisherHealth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePublisherDialog } from "@/components/admin/publishers/CreatePublisherDialog";
import { formatDateShort, formatNumber, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Plus,
  Search,
  Building2,
  Calendar,
  Zap,
  FileText,
  BellRing,
  AlertTriangle,
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
  health: string;
  activeCredit: {
    packageName: string;
    isUnlimited: boolean;
    totalCredits: number;
    usedCredits: number;
    remainingCredits: number;
    expiryDate: string | null;
  } | null;
  lastPackage: {
    packageName: string;
    expiryDate: string | null;
    cancelled: boolean;
  } | null;
  totalArticles: number;
  publishedArticles: number;
  lastActivityAt: string | null;
  openRequests: number;
}

interface PublishersSummary {
  total: number;
  active: number;
  suspended: number;
  noValidPackage: number;
  windowEnded: number;
  needsAttention: number;
  expiringSoon: number;
  openRequests: number;
}

const daysUntil = (date: string | null) =>
  date ? Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000) : null;

/**
 * شارة التاريخ لا تُلوَّن بعدد الأيام وحده: وكالة موقوفة أو منتهية النافذة
 * كانت تعرض «الباقة: بعد ٣٠٠ يوم» بالأخضر وكأن كل شيء بخير.
 */
function ExpiryChip({ label, date, operational }: { label: string; date: string | null; operational: boolean }) {
  const days = daysUntil(date);
  if (days === null || !date) return null;

  const tone = !operational
    ? "border-border bg-muted text-muted-foreground"
    : days <= 7
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
      : days <= 30
        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200";

  const text = days < 0
    ? `${label}: انتهت ${formatDateShort(date)}`
    : `${label}: ${formatDateShort(date)} · ${formatNumber(days)} يوم`;

  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium", tone)}>
      <Calendar className="h-3 w-3" aria-hidden="true" />
      {text}
    </span>
  );
}

interface SummaryTileProps {
  label: string;
  value: number;
  tone?: string;
  active?: boolean;
  onClick?: () => void;
  testId: string;
}

function SummaryTile({ label, value, tone, active, onClick, testId }: SummaryTileProps) {
  return (
    <Card
      className={cn(
        "border-border/60 shadow-none transition-colors",
        onClick && "cursor-pointer hover:border-primary/40",
        active && "border-primary/60 bg-primary/5",
      )}
      onClick={onClick}
      data-testid={testId}
    >
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-2xl font-bold tracking-tight tabular-nums", tone ?? "text-foreground")}>
          {formatNumber(value)}
        </p>
      </CardContent>
    </Card>
  );
}

export default function AdminPublishers() {
  useRoleProtection("admin");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [healthFilter, setHealthFilter] = useState("all");
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
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const { data: summary } = useQuery<PublishersSummary>({
    queryKey: ["/api/admin/publishers/summary"],
    refetchInterval: 120_000,
  });

  const needsAttention = summary?.needsAttention ?? 0;
  const operational = Math.max(0, (summary?.active ?? 0) - needsAttention);

  const filtered = publishers.filter((publisher) => {
    if (search && !publisher.agencyName.toLowerCase().includes(search.toLowerCase())) return false;
    return matchesHealthFilter(publisher.health, healthFilter);
  });

  const resetToFirstPage = () => setPage(1);

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

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryTile
            label="إجمالي الوكالات"
            value={summary?.total ?? total}
            testId="tile-total"
          />
          <SummaryTile
            label="تعمل الآن"
            value={operational}
            tone="text-emerald-700 dark:text-emerald-300"
            testId="tile-operational"
          />
          <SummaryTile
            label="تحتاج انتباه"
            value={needsAttention}
            tone="text-orange-700 dark:text-orange-300"
            active={healthFilter === "attention"}
            onClick={() => {
              setHealthFilter(healthFilter === "attention" ? "all" : "attention");
              setStatusFilter("all");
              resetToFirstPage();
            }}
            testId="tile-attention"
          />
          <SummaryTile
            label="طلبات مفتوحة"
            value={summary?.openRequests ?? 0}
            tone="text-amber-700 dark:text-amber-300"
            testId="tile-requests"
          />
        </div>

        {(summary?.expiringSoon ?? 0) > 0 && (
          <div
            className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
            data-testid="banner-expiring-soon"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {formatNumber(summary!.expiringSoon)} وكالة تنتهي باقتها أو نافذتها خلال أسبوع
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-amber-900 underline hover:bg-transparent dark:text-amber-100"
              onClick={() => {
                setHealthFilter("expiring_soon");
                setStatusFilter("all");
                resetToFirstPage();
              }}
            >
              عرضها
            </Button>
          </div>
        )}

        <PublisherRequestsPanel openCount={summary?.openRequests ?? 0} />

        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
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
            value={healthFilter}
            onValueChange={(value) => {
              setHealthFilter(value);
              resetToFirstPage();
            }}
          >
            <SelectTrigger className="w-full sm:w-48" data-testid="select-health-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HEALTH_FILTERS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(v: "all" | "active" | "suspended") => {
              setStatusFilter(v);
              resetToFirstPage();
            }}
          >
            <SelectTrigger className="w-full sm:w-40" data-testid="select-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="active">مفعّلة</SelectItem>
              <SelectItem value="suspended">موقوفة</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Building2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="font-medium">لا توجد وكالات مطابقة</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {search || healthFilter !== "all" || statusFilter !== "all"
                  ? "جرّب توسيع الفلاتر أو مسح البحث"
                  : "ابدأ بإضافة وكالة جديدة"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((publisher) => {
              const health = getHealthMeta(publisher.health);
              const credit = publisher.activeCredit;
              const creditPercent =
                credit && !credit.isUnlimited && credit.totalCredits > 0
                  ? Math.round((credit.remainingCredits / credit.totalCredits) * 100)
                  : null;

              return (
                <Link key={publisher.id} href={`/dashboard/admin/publishers/${publisher.id}`}>
                  <Card
                    className={cn(
                      "group relative h-full cursor-pointer overflow-hidden border-border/70 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
                      !health.operational && "bg-muted/20",
                    )}
                    data-testid={`publisher-card-${publisher.id}`}
                  >
                    <span
                      className={cn("absolute inset-y-0 right-0 w-1", health.accentClass)}
                      aria-hidden="true"
                    />
                    <CardContent className="flex h-full flex-col gap-3 p-4 pr-5">
                      <div className="flex items-start gap-3">
                        {publisher.logoUrl ? (
                          <img
                            src={publisher.logoUrl}
                            alt=""
                            className={cn(
                              "h-12 w-12 shrink-0 rounded-xl border bg-white object-contain p-0.5",
                              !health.operational && "opacity-60 grayscale",
                            )}
                          />
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-muted">
                            <Building2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold leading-tight">{publisher.agencyName}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {publisher.contactPerson}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn("shrink-0", health.badgeClass)}
                          data-testid={`publisher-health-${publisher.id}`}
                        >
                          {health.label}
                        </Badge>
                      </div>

                      {(publisher.autoPublish || publisher.openRequests > 0) && (
                        <div className="flex flex-wrap gap-1.5">
                          {publisher.autoPublish && (
                            <Badge
                              variant="outline"
                              className={cn(
                                "gap-1",
                                health.operational
                                  ? "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
                                  : "border-border bg-muted text-muted-foreground",
                              )}
                            >
                              <Zap className="h-3 w-3" aria-hidden="true" />
                              نشر فوري
                            </Badge>
                          )}
                          {publisher.openRequests > 0 && (
                            <Badge
                              variant="outline"
                              className="gap-1 border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                            >
                              <BellRing className="h-3 w-3" aria-hidden="true" />
                              {formatNumber(publisher.openRequests)} طلب
                            </Badge>
                          )}
                        </div>
                      )}

                      {credit ? (
                        <div className="rounded-xl bg-muted/40 p-3">
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="truncate text-muted-foreground">{credit.packageName}</span>
                            <span className="inline-flex shrink-0 items-center gap-1 font-bold tabular-nums">
                              {credit.isUnlimited ? (
                                <>
                                  مفتوح
                                  <InfinityIcon className="h-3.5 w-3.5" aria-hidden="true" />
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
                        <div className="rounded-xl border border-dashed px-3 py-2 text-sm text-muted-foreground">
                          {publisher.lastPackage
                            ? `${publisher.lastPackage.cancelled ? "أُلغيت" : "انتهت"} باقة «${publisher.lastPackage.packageName}»${
                                publisher.lastPackage.expiryDate
                                  ? ` — ${formatDateShort(publisher.lastPackage.expiryDate)}`
                                  : ""
                              }`
                            : "لم تُضف باقة لهذه الوكالة بعد"}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1.5">
                        {credit && (
                          <ExpiryChip label="الباقة" date={credit.expiryDate} operational={health.operational} />
                        )}
                        <ExpiryChip
                          label="النافذة"
                          date={publisher.publishingEndsAt}
                          operational={health.operational}
                        />
                      </div>

                      <div className="mt-auto flex items-center justify-between border-t pt-2.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <FileText className="h-3 w-3" aria-hidden="true" />
                          {formatNumber(publisher.publishedArticles)} منشور من{" "}
                          {formatNumber(publisher.totalArticles)}
                        </span>
                        <span>
                          آخر نشاط:{" "}
                          {publisher.lastActivityAt ? formatRelativeTime(publisher.lastActivityAt) : "—"}
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
