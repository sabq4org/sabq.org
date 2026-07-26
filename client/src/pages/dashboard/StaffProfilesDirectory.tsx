// دليل المنسوبين — /dashboard/staff-profiles
// بهوية لوحة التحكم (DashboardPageShell / Header / شريط إحصاء / فلاتر بطاقات).

import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { StaffProfileForm } from "@/components/staff/StaffProfileForm";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Briefcase,
  ClipboardCheck,
  ExternalLink,
  IdCard,
  Loader2,
  Mic2,
  Pencil,
  PenLine,
  Search,
  UserRound,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type ReviewStatus = "draft" | "pending_review" | "approved" | "needs_correction";

type StaffRow = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  profileImageUrl: string | null;
  legacyRole: string;
  employeeNumber: string | null;
  employmentType: string | null;
  completionPercent: number | null;
  profileReviewStatus: ReviewStatus | null;
  departmentName: string | null;
  jobTitleName: string | null;
  hasProfile: boolean;
  pressCardValidUntil: string | null;
  mediaLicenseExpiresAt: string | null;
};

const REVIEW_BADGE: Record<ReviewStatus, { label: string; className: string }> = {
  draft: { label: "مسودة", className: "border-muted-foreground/30 text-muted-foreground" },
  pending_review: {
    label: "قيد المراجعة",
    className: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  approved: {
    label: "معتمد",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  needs_correction: {
    label: "يحتاج تصحيحاً",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
};

const ALL = "__all__";

const EMPLOYMENT_META: Record<
  string,
  { label: string; icon: LucideIcon; className: string; ring: string; fill: string }
> = {
  employee: {
    label: "موظف",
    icon: Briefcase,
    className: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    ring: "border-sky-200/70 dark:border-sky-900/40",
    fill: "from-sky-500/10",
  },
  collaborator: {
    label: "متعاون",
    icon: Users,
    className: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    ring: "border-violet-200/70 dark:border-violet-900/40",
    fill: "from-violet-500/10",
  },
  field_reporter: {
    label: "مراسل صحفي",
    icon: Mic2,
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    ring: "border-emerald-200/70 dark:border-emerald-900/40",
    fill: "from-emerald-500/10",
  },
  opinion_writer: {
    label: "كاتب رأي",
    icon: PenLine,
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    ring: "border-amber-200/70 dark:border-amber-900/40",
    fill: "from-amber-500/10",
  },
};

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86400000);
}

function hasExpiringAlert(row: StaffRow): boolean {
  for (const iso of [row.pressCardValidUntil, row.mediaLicenseExpiresAt]) {
    const d = daysUntil(iso);
    if (d !== null && d <= 30) return true;
  }
  return false;
}

function expiryBadge(label: string, iso: string | null) {
  const days = daysUntil(iso);
  if (days === null) return null;
  if (days < 0) {
    return (
      <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-[10px] text-red-600">
        {label} منتهية
      </Badge>
    );
  }
  if (days <= 30) {
    return (
      <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300">
        {label} · {days}ي
      </Badge>
    );
  }
  return null;
}

function completionTone(percent: number): string {
  if (percent >= 80) return "bg-emerald-500";
  if (percent >= 40) return "bg-primary";
  if (percent > 0) return "bg-amber-500";
  return "bg-transparent";
}

function displayName(row: StaffRow): string {
  return [row.firstName, row.lastName].filter(Boolean).join(" ") || row.email;
}

export default function StaffProfilesDirectory() {
  const [location] = useLocation();
  const initialReview = (() => {
    const q = new URLSearchParams(location.split("?")[1] || "");
    const review = q.get("review");
    if (review === "pending_review" || review === "approved" || review === "needs_correction" || review === "draft") {
      return review;
    }
    // افتراضياً: افتح طابور المراجعة — هذا الغرض الأساسي للإدارة هنا
    return "pending_review";
  })();

  const [q, setQ] = useState("");
  const [departmentId, setDepartmentId] = useState(ALL);
  const [employmentType, setEmploymentType] = useState(ALL);
  const [reviewFilter, setReviewFilter] = useState<string>(initialReview);
  const [quickEditUserId, setQuickEditUserId] = useState<string | null>(null);

  // النوع يُفلتر محلياً حتى تبقى أعداد بطاقات الأنواع صحيحة مع البحث/الإدارة.
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (departmentId !== ALL) params.set("departmentId", departmentId);
  const listKey = `/api/staff-profiles${params.toString() ? `?${params}` : ""}`;

  const { data: listRaw, isLoading } = useQuery({ queryKey: [listKey] });
  const { data: lookupsRaw } = useQuery({ queryKey: ["/api/staff-profiles/lookups"] });
  const allItems = ((listRaw as { items?: StaffRow[] } | undefined)?.items ?? []) as StaffRow[];
  const lookups = (lookupsRaw ?? null) as { departments: { id: string; nameAr: string }[] } | null;

  const items = useMemo(() => {
    let rows = allItems;
    if (employmentType !== ALL) rows = rows.filter((r) => r.employmentType === employmentType);
    if (reviewFilter !== ALL) {
      rows = rows.filter((r) => (r.profileReviewStatus ?? "draft") === reviewFilter);
    }
    return rows;
  }, [allItems, employmentType, reviewFilter]);

  const stats = useMemo(() => {
    const byType = Object.fromEntries(
      Object.keys(EMPLOYMENT_META).map((k) => [k, allItems.filter((r) => r.employmentType === k).length]),
    ) as Record<string, number>;
    return {
      total: items.length,
      withProfile: items.filter((r) => r.hasProfile).length,
      complete: items.filter((r) => (r.completionPercent ?? 0) >= 80).length,
      pendingReview: allItems.filter((r) => r.profileReviewStatus === "pending_review").length,
      alerts: items.filter(hasExpiringAlert).length,
      byType,
      pool: allItems.length,
    };
  }, [allItems, items]);

  return (
    <DashboardLayout>
      <DashboardPageShell maxWidthClassName="max-w-[1400px]" contentClassName="px-4 pb-16 sm:px-6">
        <DashboardPageHeader
          icon={IdCard}
          title="مراجعة ملفات المنسوبين"
          description="طابور اعتماد بيانات الكتّاب والمراسلين قبل إصدار شهادة التعريف — افتح الملف، صحّح إن لزم، ثم اعتمد"
          titleTestId="text-staff-profiles-title"
        />

        {stats.pendingReview > 0 && reviewFilter !== "pending_review" && (
          <button
            type="button"
            onClick={() => setReviewFilter("pending_review")}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-sky-300/70 bg-sky-50/80 px-4 py-3 text-start transition hover:bg-sky-50 dark:border-sky-900/50 dark:bg-sky-950/30"
            data-testid="banner-pending-review-queue"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-sky-900 dark:text-sky-100">
              <ClipboardCheck className="h-4 w-4" />
              {stats.pendingReview} ملف بانتظار مراجعتك واعتمادك
            </span>
            <span className="text-xs text-sky-700 dark:text-sky-300">عرض الطابور ←</span>
          </button>
        )}

        {reviewFilter === "pending_review" && (
          <div
            className="rounded-2xl border border-sky-200/80 bg-sky-50/50 px-4 py-3 text-sm text-sky-950 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-100"
            data-testid="panel-review-queue-help"
          >
            <p className="font-semibold">كيف تعتمد الملف؟</p>
            <p className="mt-1 text-xs leading-relaxed text-sky-900/80 dark:text-sky-200/90">
              اضغط فتح الملف → راجع المسمى الوظيفي وتاريخ الالتحاق والبيانات → عدّل إن لزم → زر «اعتماد الملف».
              بعدها يستطيع المنسوب إصدار شهادة التعريف وتنزيلها.
            </p>
            {stats.pendingReview === 0 && !isLoading && (
              <p className="mt-2 text-xs text-muted-foreground">لا ملفات قيد المراجعة حالياً.</p>
            )}
          </div>
        )}

        {/* شريط الحالة */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            { label: "الإجمالي", value: stats.total, tone: "text-foreground", icon: Users },
            { label: "لديهم ملف", value: stats.withProfile, tone: "text-sky-700 dark:text-sky-300", icon: UserRound },
            { label: "مكتمل ≥ 80٪", value: stats.complete, tone: "text-emerald-700 dark:text-emerald-300", icon: IdCard },
            {
              label: "قيد المراجعة",
              value: stats.pendingReview,
              tone: "text-sky-700 dark:text-sky-300",
              icon: Search,
              onClick: () => setReviewFilter(reviewFilter === "pending_review" ? ALL : "pending_review"),
            },
            { label: "تنبيهات قريبة", value: stats.alerts, tone: "text-amber-700 dark:text-amber-300", icon: AlertTriangle },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={"onClick" in item ? item.onClick : undefined}
                className={cn(
                  "rounded-xl border bg-card px-3 py-2.5 text-start",
                  "onClick" in item && item.onClick && "hover:bg-muted/40",
                  "onClick" in item &&
                    reviewFilter === "pending_review" &&
                    item.label === "قيد المراجعة" &&
                    "ring-2 ring-primary/40",
                )}
                data-testid={item.label === "قيد المراجعة" ? "stat-pending-review" : undefined}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">{item.label}</p>
                  <Icon className="h-3.5 w-3.5 text-muted-foreground/70" aria-hidden />
                </div>
                <p className={cn("mt-0.5 text-xl font-bold tabular-nums tracking-tight", item.tone)}>
                  {isLoading ? "—" : item.value}
                </p>
              </button>
            );
          })}
        </div>

        {/* بطاقات الأنواع — فلتر سريع بهوية سبق */}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {Object.entries(EMPLOYMENT_META).map(([key, meta]) => {
            const Icon = meta.icon;
            const count = stats.byType[key] ?? 0;
            const selected = employmentType === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setEmploymentType(selected ? ALL : key)}
                className={cn(
                  "rounded-2xl border bg-gradient-to-bl to-card p-3.5 text-start transition-all",
                  meta.ring,
                  meta.fill,
                  selected && "ring-2 ring-primary/40",
                  !selected && "hover:bg-muted/30",
                )}
                data-testid={`staff-type-${key}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium", meta.className)}>
                    <Icon className="h-3.5 w-3.5" />
                    {meta.label}
                  </span>
                  <span className="text-2xl font-bold tabular-nums">{isLoading ? "—" : count}</span>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {selected ? "فلتر نشط — اضغط لإلغاء التحديد" : "عرض هذا النوع فقط"}
                </p>
              </button>
            );
          })}
        </div>

        {/* فلاتر مضغوطة */}
        <div className="space-y-3 rounded-2xl border bg-card p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو البريد أو الرقم الوظيفي…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-10 pr-9"
                data-testid="input-staff-search"
              />
            </div>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger className="h-10 w-44">
                <SelectValue placeholder="كل الإدارات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>كل الإدارات</SelectItem>
                {(lookups?.departments ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.nameAr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={reviewFilter} onValueChange={setReviewFilter}>
              <SelectTrigger className="h-10 w-44" data-testid="select-review-filter">
                <SelectValue placeholder="حالة المراجعة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>كل حالات المراجعة</SelectItem>
                <SelectItem value="pending_review">قيد المراجعة</SelectItem>
                <SelectItem value="approved">معتمد</SelectItem>
                <SelectItem value="needs_correction">يحتاج تصحيحاً</SelectItem>
                <SelectItem value="draft">مسودة</SelectItem>
              </SelectContent>
            </Select>
            {(q || departmentId !== ALL || employmentType !== ALL || reviewFilter !== ALL) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => {
                  setQ("");
                  setDepartmentId(ALL);
                  setEmploymentType(ALL);
                  setReviewFilter(ALL);
                }}
              >
                مسح الفلاتر
              </Button>
            )}
            <span className="ms-auto text-xs tabular-nums text-muted-foreground">
              {isLoading
                ? "…"
                : employmentType === ALL
                  ? `${stats.total} منسوب`
                  : `${stats.total} من ${stats.pool}`}
            </span>
          </div>
        </div>

        {/* القائمة */}
        <div className="overflow-hidden rounded-2xl border bg-card">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                <IdCard className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold">لا نتائج مطابقة</p>
              <p className="text-xs text-muted-foreground">جرّب تعديل البحث أو الفلاتر</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((row) => {
                const meta = row.employmentType ? EMPLOYMENT_META[row.employmentType] : null;
                const TypeIcon = meta?.icon ?? UserRound;
                const percent = row.completionPercent ?? 0;
                const alerts = [
                  expiryBadge("البطاقة", row.pressCardValidUntil),
                  expiryBadge("الترخيص", row.mediaLicenseExpiresAt),
                ].filter(Boolean);

                return (
                  <li
                    key={row.userId}
                    className="flex flex-col gap-3 px-3 py-3.5 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-4 sm:px-4"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      {row.profileImageUrl ? (
                        <img
                          src={row.profileImageUrl}
                          alt=""
                          className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-primary/15"
                        />
                      ) : (
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                          {displayName(row).slice(0, 1)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold">{displayName(row)}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span className="truncate" dir="ltr">{row.email}</span>
                          {row.employeeNumber && (
                            <>
                              <span className="opacity-40">·</span>
                              <span className="font-mono tabular-nums" dir="ltr">{row.employeeNumber}</span>
                            </>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {meta ? (
                            <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium", meta.className)}>
                              <TypeIcon className="h-3 w-3" />
                              {meta.label}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">بلا نوع</span>
                          )}
                          {row.hasProfile && (() => {
                            const status = (row.profileReviewStatus ?? "draft") as ReviewStatus;
                            const badge = REVIEW_BADGE[status];
                            return (
                              <Badge variant="outline" className={cn("text-[10px]", badge.className)}>
                                {badge.label}
                              </Badge>
                            );
                          })()}
                          {(row.jobTitleName || row.departmentName) && (
                            <span className="truncate text-[11px] text-muted-foreground">
                              {[row.jobTitleName, row.departmentName].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-3 sm:gap-4">
                      <div className="min-w-[7.5rem]">
                        {row.hasProfile ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="text-muted-foreground">اكتمال</span>
                              <span className={cn("font-bold tabular-nums", percent === 0 && "text-muted-foreground")}>
                                {percent}%
                              </span>
                            </div>
                            <Progress
                              value={percent}
                              className="h-1.5 bg-muted"
                              indicatorClassName={completionTone(percent)}
                            />
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">بلا ملف</Badge>
                        )}
                      </div>

                      <div className="flex min-w-[5.5rem] flex-wrap gap-1">
                        {alerts.length > 0 ? alerts : (
                          <span className="text-[11px] text-muted-foreground/45">—</span>
                        )}
                      </div>

                      <div className="flex items-center gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 text-muted-foreground"
                          onClick={() => setQuickEditUserId(row.userId)}
                          title="تعديل سريع"
                          data-testid={`staff-quick-edit-${row.userId}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Link href={`/dashboard/staff-profiles/${row.userId}`}>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9 text-muted-foreground"
                            title="فتح الملف"
                            data-testid={`staff-open-${row.userId}`}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Dialog open={quickEditUserId !== null} onOpenChange={(open) => !open && setQuickEditUserId(null)}>
          <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle>تعديل سريع — ملف المنسوب</DialogTitle>
            </DialogHeader>
            {quickEditUserId && (
              <StaffProfileForm userId={quickEditUserId} mode="dialog" onSaved={() => setQuickEditUserId(null)} />
            )}
          </DialogContent>
        </Dialog>
      </DashboardPageShell>
    </DashboardLayout>
  );
}
