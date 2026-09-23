// فريق سبق الذكي — بطاقة هوية الموظف: الهوية، المؤشرات، «العقل» (أدواته
// ونماذجها من البوابة)، وسجل أعمال حقيقي من ai_usage_logs — لا نص توليدي.
// التكليف بمهمة يأتي في المرحلة الثانية — لا أزرار ميتة قبلها.

import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Users } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { StaffAvatar } from "./index";
import {
  formatCostUsd,
  formatOps,
  timeAgoAr,
  TRIGGER_MODE_LABELS,
  WORK_STATUS_META,
  type AiStaffProfilePayload,
} from "./shared";

function KpiTile({ value, label }: { value: string; label: string }) {
  return (
    <Card>
      <CardContent className="py-3.5">
        <div className="text-lg font-bold tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

export default function AiStaffProfilePage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";

  const { data: profileRaw, isLoading, isError } = useQuery<AiStaffProfilePayload>({
    queryKey: [`/api/admin/ai-staff/${slug}`],
    enabled: slug.length > 0,
    refetchInterval: 30_000,
  });
  const profile = profileRaw ?? null;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div dir="rtl" className="mx-auto max-w-[1100px] space-y-4 px-4 sm:px-6">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  if (isError || !profile) {
    return (
      <DashboardLayout>
        <Card className="max-w-lg mx-auto mt-16" dir="rtl">
          <CardContent className="py-10 text-center space-y-3">
            <Users className="w-10 h-10 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">لا يوجد موظف بهذا المعرف</p>
            <Link href="/dashboard/ai/staff" className="text-sm text-primary underline">
              العودة لدليل الفريق
            </Link>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const { member, managerName, tools, recentWork } = profile;
  const work = Array.isArray(recentWork) ? recentWork : [];

  return (
    <DashboardLayout>
      <div dir="rtl" className="mx-auto max-w-[1100px] space-y-4 px-4 pb-10 sm:px-6">
        <Link
          href="/dashboard/ai/staff"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="w-3.5 h-3.5" /> فريق سبق الذكي
        </Link>

        {/* بطاقة الهوية */}
        <Card data-testid="ai-staff-identity">
          <CardContent className="pt-5 pb-5 flex items-center gap-5 flex-wrap">
            <StaffAvatar member={member} sizeClass="w-[104px] h-[104px] border-[3px] border-sky-400" />
            <div className="flex-1 min-w-[220px]">
              <h1 className="text-2xl font-bold">{member.nameAr}</h1>
              <p className="text-sm text-muted-foreground">
                {member.titleAr} · يتبع: {managerName ?? "رئيس التحرير (بشري)"}
              </p>
              <div className="flex gap-2 flex-wrap mt-2.5">
                <Badge variant="outline" className="tabular-nums" dir="ltr">
                  {member.employeeCode}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    member.status === "active"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900"
                      : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
                  )}
                >
                  {member.status === "active" ? "● على رأس العمل" : "● موقوف مؤقتًا"}
                </Badge>
                <Badge variant="outline">
                  {TRIGGER_MODE_LABELS[member.triggerMode] ?? member.triggerMode}: {member.scheduleNoteAr}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* المؤشرات */}
        {member.kpis ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3" data-testid="ai-staff-kpis">
            <KpiTile value={formatOps(member.kpis.todayOps)} label="أعمال اليوم" />
            <KpiTile value={formatOps(member.kpis.monthOps)} label="هذا الشهر" />
            <KpiTile
              value={member.kpis.todaySuccessRate === null ? "—" : `${member.kpis.todaySuccessRate}%`}
              label="نسبة النجاح اليوم"
            />
            <KpiTile
              value={member.kpis.monthP95LatencyMs === null ? "—" : `${(member.kpis.monthP95LatencyMs / 1000).toFixed(1)}s`}
              label="الكمون p95 (الشهر)"
            />
            <KpiTile value={formatCostUsd(member.kpis.monthCostUsd)} label="تكلفة الشهر" />
          </div>
        ) : (
          <Card>
            <CardContent className="py-4 text-sm text-muted-foreground">
              نظام هذا الموظف لا يمر ببوابة الذكاء بمفتاح مستقل بعد — مؤشراته الدقيقة تُربط في مرحلة لاحقة، ولا نعرض
              أرقامًا تقديرية.
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-5 gap-4 items-start">
          {/* الوصف الوظيفي + العقل */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-primary">الوصف الوظيفي</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">{member.bioAr}</p>
              {tools.length > 0 && (
                <div>
                  <div className="text-sm font-bold text-primary mb-2">العقل — أدواته في البوابة</div>
                  <ul className="space-y-1.5">
                    {tools.map((t) => (
                      <li key={t.featureKey} className="flex items-center justify-between gap-2 text-xs border-b last:border-b-0 pb-1.5 last:pb-0">
                        <span className={cn(!t.isEnabled && "text-muted-foreground line-through")}>{t.displayName}</span>
                        <span className="text-muted-foreground tabular-nums" dir="ltr">
                          {t.primaryModel}
                          {t.fallbackCount > 0 ? ` +${t.fallbackCount}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* سجل الأعمال */}
          <Card className="md:col-span-3" data-testid="ai-staff-work-log">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-primary">سجل الأعمال — مباشر من البوابة</CardTitle>
            </CardHeader>
            <CardContent>
              {work.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">لا أعمال مسجلة بعد في نافذة السجل (آخر 90 يومًا).</p>
              ) : (
                <ul className="divide-y">
                  {work.map((w, i) => {
                    const meta = WORK_STATUS_META[w.status];
                    return (
                      <li key={`${w.createdAt}-${i}`} className="py-2.5 flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground whitespace-nowrap w-20 shrink-0">{timeAgoAr(w.createdAt)}</span>
                        <span className="flex-1 min-w-0">
                          <span className="font-medium">{w.featureName}</span>
                          {w.taskType && <span className="text-muted-foreground"> · {w.taskType}</span>}
                        </span>
                        <span className="text-muted-foreground tabular-nums hidden sm:inline" dir="ltr">
                          {(w.latencyMs / 1000).toFixed(1)}s
                        </span>
                        {meta && (
                          <Badge variant="outline" className={cn("shrink-0", meta.className)}>
                            {meta.label}
                          </Badge>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
