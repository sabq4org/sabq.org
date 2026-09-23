// فريق سبق الذكي — دليل الفريق (بطاقات + هيكل شجري بمبدّل عرض واحد).
// النموذج البصري المعتمد: بطاقات موظفين بنقطة حالة حية + شريط مؤشرات
// القسم + شجرة تنظيمية قمتها بشرية دائمًا. كل رقم مشتق من البوابة —
// موظف metricsSource=pending يعرض «قيد الربط» لا أصفارًا (قاعدة المصداقية).

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, Network, Users } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  DEPARTMENT_COLORS,
  formatCostUsd,
  formatOps,
  type AiStaffEntry,
  type AiStaffTeamPayload,
} from "./shared";

/** صورة الموظف مع حرف احتياطي بلون إدارته إن غابت الصورة */
export function StaffAvatar({
  member,
  sizeClass,
}: {
  member: Pick<AiStaffEntry, "nameAr" | "avatarUrl" | "departmentKey">;
  sizeClass: string;
}) {
  const [broken, setBroken] = useState(false);
  const color = DEPARTMENT_COLORS[member.departmentKey] ?? "#0E76B8";
  return (
    <div
      className={cn("rounded-full overflow-hidden flex items-center justify-center shrink-0", sizeClass)}
      style={{ backgroundColor: color }}
    >
      {member.avatarUrl && !broken ? (
        <img
          src={member.avatarUrl}
          alt={member.nameAr}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="text-white font-bold text-lg leading-none">{member.nameAr.slice(0, 1)}</span>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: AiStaffEntry["status"] }) {
  return (
    <span
      className={cn(
        "inline-block w-2.5 h-2.5 rounded-full",
        status === "active" ? "bg-emerald-500" : "bg-amber-500",
      )}
      title={status === "active" ? "على رأس العمل" : "موقوف مؤقتًا"}
    />
  );
}

function StaffCard({ member }: { member: AiStaffEntry }) {
  return (
    <Link href={`/dashboard/ai/staff/${member.slug}`}>
      <Card className="cursor-pointer transition-shadow hover:shadow-md h-full" data-testid={`ai-staff-card-${member.slug}`}>
        <CardContent className="pt-5 pb-4 text-center relative">
          <span className="absolute top-3 start-3">
            <StatusDot status={member.status} />
          </span>
          <div className="flex justify-center mb-2.5">
            <StaffAvatar member={member} sizeClass="w-[72px] h-[72px] border-2 border-border" />
          </div>
          <div className="font-bold text-base">{member.nameAr}</div>
          <div className="text-xs text-muted-foreground mb-2">{member.titleAr}</div>
          <span
            className="inline-block text-[11px] rounded-full px-2.5 py-0.5 mb-2.5 text-white/95"
            style={{ backgroundColor: DEPARTMENT_COLORS[member.departmentKey] ?? "#0E76B8" }}
          >
            {member.employeeCode}
          </span>
          <div className="flex justify-center gap-4 text-[11px] text-muted-foreground border-t pt-2">
            {member.kpis ? (
              <>
                <span>
                  اليوم <b className="text-foreground tabular-nums">{formatOps(member.kpis.todayOps)}</b>
                </span>
                <span>
                  نجاح{" "}
                  <b className="text-foreground tabular-nums">
                    {member.kpis.todaySuccessRate === null ? "—" : `${member.kpis.todaySuccessRate}%`}
                  </b>
                </span>
              </>
            ) : (
              <span>المؤشرات قيد الربط</span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/** الهيكل الشجري: رئيس التحرير (بشري) ← الإدارات ← الموظفون. يُرسم من
 * departmentKey فلا يحتاج تخطيطًا يدويًا عند استحداث موظف أو إدارة. */
function OrgTree({ payload }: { payload: AiStaffTeamPayload }) {
  return (
    <div className="overflow-x-auto pb-4" data-testid="ai-staff-tree">
      <div className="min-w-[960px] pt-2">
        {/* القمة البشرية — تجسيد قاعدة «AI لا ينشر» */}
        <div className="w-[240px] mx-auto rounded-xl border-2 border-sky-400 bg-[#0E2233] text-center px-4 py-3">
          <div className="font-bold text-white">رئيس التحرير</div>
          <div className="text-[11px] text-slate-400">يعتمد كل ما ينتجه الفريق</div>
          <span className="inline-block mt-1.5 text-[10px] font-bold bg-white text-[#0E2233] rounded-full px-3 py-px">
            بشري — قمة الهرم
          </span>
        </div>
        <div className="w-0.5 h-6 bg-border mx-auto" />
        <ul className="flex list-none m-0 p-0">
          {payload.departments.map((dept, i) => {
            const members = payload.staff.filter((s) => s.departmentKey === dept.key);
            if (members.length === 0) return null;
            const first = i === 0;
            const last = i === payload.departments.length - 1;
            return (
              <li key={dept.key} className="flex-1 min-w-[150px] relative flex flex-col items-center pt-6 px-1.5">
                {/* موصلات: نصفا الخط الأفقي + النازل من المنتصف (يمين/يسار فيزيائيان — متماثلان في RTL) */}
                {!last && <span aria-hidden className="absolute top-0 left-0 w-1/2 border-t-2 border-border" />}
                {!first && <span aria-hidden className="absolute top-0 right-0 w-1/2 border-t-2 border-border" />}
                <span aria-hidden className="absolute top-0 left-1/2 h-6 border-l-2 border-border" />
                <div
                  className="w-full max-w-[158px] rounded-lg border bg-card text-center px-2.5 py-2"
                  style={{ borderTop: `3px solid ${DEPARTMENT_COLORS[dept.key] ?? "#4CBCFD"}` }}
                >
                  <div className="font-bold text-sm">{dept.labelAr}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {members.length === 1 ? "موظف واحد" : `${members.length} موظفين`} · {dept.noteAr}
                  </div>
                </div>
                {members.map((m) => (
                  <span key={m.slug} className="flex flex-col items-center">
                    <span aria-hidden className="w-0.5 h-3.5 bg-border" />
                    <Link href={`/dashboard/ai/staff/${m.slug}`}>
                      <span
                        className="flex items-center gap-2 rounded-full border bg-card ps-3 pe-2.5 py-1 whitespace-nowrap cursor-pointer hover:shadow-sm"
                        data-testid={`ai-staff-tree-${m.slug}`}
                      >
                        <StaffAvatar member={m} sizeClass="w-8 h-8" />
                        <span className="text-start">
                          <span className="block text-xs font-bold leading-tight">{m.nameAr}</span>
                          <span className="block text-[10px] text-muted-foreground leading-tight">{m.titleAr}</span>
                        </span>
                        <StatusDot status={m.status} />
                      </span>
                    </Link>
                  </span>
                ))}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default function AiStaffPage() {
  const [view, setView] = useState<"cards" | "tree">("cards");
  const [deptFilter, setDeptFilter] = useState<string | null>(null);

  const { data: teamRaw, isLoading } = useQuery<AiStaffTeamPayload>({
    queryKey: ["/api/admin/ai-staff"],
    refetchInterval: 30_000,
  });
  const team = teamRaw ?? null;

  const visibleStaff = useMemo(() => {
    const staff = Array.isArray(team?.staff) ? team.staff : [];
    return deptFilter ? staff.filter((s) => s.departmentKey === deptFilter) : staff;
  }, [team, deptFilter]);

  return (
    <DashboardLayout>
      <div dir="rtl" className="mx-auto max-w-[1400px] space-y-5 px-4 pb-10 sm:px-6">
        <DashboardPageHeader
          icon={Users}
          title="فريق سبق الذكي"
          description="موظفو سبق الرقميون — تحت إشراف رئيس التحرير، ولا يُنشر لهم حرف قبل اعتماد بشري"
        />

        {/* شريط مؤشرات القسم — كل رقم من البوابة */}
        {isLoading || !team ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="ai-staff-totals">
            <Card>
              <CardContent className="py-3.5">
                <div className="text-xl font-bold tabular-nums text-primary">{formatOps(team.totals.todayOps)}</div>
                <div className="text-xs text-muted-foreground">أعمال اليوم</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3.5">
                <div className="text-xl font-bold tabular-nums text-primary">
                  {team.totals.todaySuccessRate === null ? "—" : `${team.totals.todaySuccessRate}%`}
                </div>
                <div className="text-xs text-muted-foreground">نسبة النجاح اليوم</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3.5">
                <div className="text-xl font-bold tabular-nums text-primary">{formatCostUsd(team.totals.monthCostUsd)}</div>
                <div className="text-xs text-muted-foreground">تكلفة الشهر الحالي</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3.5">
                <div className="text-xl font-bold tabular-nums text-primary">
                  {team.totals.activeCount}/{team.totals.totalCount}
                </div>
                <div className="text-xs text-muted-foreground">على رأس العمل</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* فلاتر الإدارات + مبدّل العرض */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setDeptFilter(null)}
              className={cn(
                "text-xs rounded-full border px-3 py-1",
                deptFilter === null ? "bg-primary text-primary-foreground border-primary font-bold" : "bg-card text-muted-foreground",
              )}
            >
              الكل
            </button>
            {(team?.departments ?? []).map((d) => (
              <button
                key={d.key}
                onClick={() => setDeptFilter(d.key === deptFilter ? null : d.key)}
                className={cn(
                  "text-xs rounded-full border px-3 py-1",
                  deptFilter === d.key ? "bg-primary text-primary-foreground border-primary font-bold" : "bg-card text-muted-foreground",
                )}
              >
                {d.labelAr}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border overflow-hidden text-xs" role="tablist" aria-label="طريقة العرض">
            <button
              role="tab"
              aria-selected={view === "cards"}
              onClick={() => setView("cards")}
              className={cn("px-3.5 py-1.5 flex items-center gap-1.5", view === "cards" ? "bg-primary text-primary-foreground font-bold" : "bg-card text-muted-foreground")}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> بطاقات
            </button>
            <button
              role="tab"
              aria-selected={view === "tree"}
              onClick={() => setView("tree")}
              className={cn("px-3.5 py-1.5 flex items-center gap-1.5", view === "tree" ? "bg-primary text-primary-foreground font-bold" : "bg-card text-muted-foreground")}
            >
              <Network className="w-3.5 h-3.5" /> شجرة
            </button>
          </div>
        </div>

        {isLoading || !team ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-xl" />
            ))}
          </div>
        ) : view === "tree" ? (
          <OrgTree payload={team} />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {visibleStaff.map((m) => (
              <StaffCard key={m.slug} member={m} />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
