// دليل المنسوبين — /dashboard/staff-profiles
// جدول بالبحث والفلاتر ونسب الاكتمال؛ فتح الملف صفحةً أو بوب أب للتعديل السريع.

import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardH1WithFavorite } from "@/components/dashboard/DashboardH1WithFavorite";
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { IdCard, Pencil, ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
  departmentName: string | null;
  jobTitleName: string | null;
  hasProfile: boolean;
  pressCardValidUntil: string | null;
  mediaLicenseExpiresAt: string | null;
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  employee: "موظف",
  collaborator: "متعاون",
  field_reporter: "مراسل صحفي",
  opinion_writer: "كاتب رأي",
};

const ALL = "__all__";

function completionTone(percent: number): string {
  if (percent >= 80) return "bg-emerald-500";
  if (percent >= 40) return "bg-sky-500";
  if (percent > 0) return "bg-amber-500";
  return "bg-transparent";
}

function expiryBadge(label: string, iso: string | null) {
  if (!iso) return null;
  const days = Math.floor((new Date(iso).getTime() - Date.now()) / 86400000);
  if (days < 0) {
    return (
      <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-red-600 text-[10px]">
        {label} منتهية
      </Badge>
    );
  }
  if (days <= 30) {
    return (
      <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 text-[10px]">
        {label} تنتهي خلال {days} يوماً
      </Badge>
    );
  }
  return null;
}

function CompletionCell({ percent, hasProfile }: { percent: number | null; hasProfile: boolean }) {
  if (!hasProfile) {
    return <Badge variant="outline" className="text-[10px] text-muted-foreground">بلا ملف</Badge>;
  }
  const value = percent ?? 0;
  return (
    <div className="flex min-w-[7.5rem] items-center gap-2">
      <Progress
        value={value}
        className="h-1.5 w-16 bg-muted"
        indicatorClassName={completionTone(value)}
      />
      <span
        className={cn(
          "w-8 text-left text-xs tabular-nums",
          value === 0 ? "text-muted-foreground" : "font-semibold text-foreground",
        )}
        dir="ltr"
      >
        {value}%
      </span>
    </div>
  );
}

export default function StaffProfilesDirectory() {
  const [q, setQ] = useState("");
  const [departmentId, setDepartmentId] = useState(ALL);
  const [employmentType, setEmploymentType] = useState(ALL);
  const [quickEditUserId, setQuickEditUserId] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (departmentId !== ALL) params.set("departmentId", departmentId);
  if (employmentType !== ALL) params.set("employmentType", employmentType);
  const listKey = `/api/staff-profiles${params.toString() ? `?${params}` : ""}`;

  const { data: listRaw, isLoading } = useQuery({ queryKey: [listKey] });
  const { data: lookupsRaw } = useQuery({ queryKey: ["/api/staff-profiles/lookups"] });
  const items = ((listRaw as { items?: StaffRow[] } | undefined)?.items ?? []) as StaffRow[];
  const lookups = (lookupsRaw ?? null) as { departments: { id: string; nameAr: string }[] } | null;

  return (
    <DashboardLayout>
      <div dir="rtl" className="space-y-5 p-1">
        <div className="flex flex-wrap items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-500/10 text-sky-600">
            <IdCard className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <DashboardH1WithFavorite className="text-xl font-bold tracking-tight">
              المنسوبون
            </DashboardH1WithFavorite>
            <p className="text-xs text-muted-foreground">
              ملف المنسوب الموحد — المصدر المرجعي للبطاقة الصحفية وكل الأسطح
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="بحث بالاسم أو البريد أو الرقم الوظيفي…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-9 max-w-sm"
          />
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue placeholder="كل الإدارات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>كل الإدارات</SelectItem>
              {(lookups?.departments ?? []).map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.nameAr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={employmentType} onValueChange={setEmploymentType}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue placeholder="كل الأنواع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>كل الأنواع</SelectItem>
              {Object.entries(EMPLOYMENT_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="ms-auto text-xs text-muted-foreground tabular-nums">
            {isLoading ? "…" : `${items.length} منسوب`}
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border bg-card">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[26%]">المنسوب</TableHead>
                  <TableHead className="w-[12%]">الرقم</TableHead>
                  <TableHead className="w-[18%]">المسمى / الإدارة</TableHead>
                  <TableHead className="w-[12%]">النوع</TableHead>
                  <TableHead className="w-[14%]">اكتمال الملف</TableHead>
                  <TableHead className="w-[12%]">تنبيهات</TableHead>
                  <TableHead className="w-[6%] text-left">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => {
                  const alerts = [
                    expiryBadge("البطاقة", row.pressCardValidUntil),
                    expiryBadge("الترخيص", row.mediaLicenseExpiresAt),
                  ].filter(Boolean);

                  return (
                    <TableRow key={row.userId}>
                      <TableCell className="py-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          {row.profileImageUrl ? (
                            <img
                              src={row.profileImageUrl}
                              alt=""
                              className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-border"
                            />
                          ) : (
                            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sky-500/10 text-xs font-semibold text-sky-600">
                              {(row.firstName ?? row.email).slice(0, 1)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">
                              {[row.firstName, row.lastName].filter(Boolean).join(" ") || row.email}
                            </div>
                            <div className="truncate text-[11px] text-muted-foreground" dir="ltr">
                              {row.email}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 font-mono text-xs text-muted-foreground" dir="ltr">
                        {row.employeeNumber ?? "—"}
                      </TableCell>
                      <TableCell className="py-3 text-xs">
                        <div className="truncate font-medium">{row.jobTitleName ?? "—"}</div>
                        <div className="truncate text-muted-foreground">{row.departmentName ?? "—"}</div>
                      </TableCell>
                      <TableCell className="py-3 text-xs text-muted-foreground">
                        {EMPLOYMENT_LABELS[row.employmentType ?? ""] ?? "—"}
                      </TableCell>
                      <TableCell className="py-3">
                        <CompletionCell percent={row.completionPercent} hasProfile={row.hasProfile} />
                      </TableCell>
                      <TableCell className="py-3">
                        {alerts.length > 0 ? (
                          <div className="flex flex-wrap gap-1">{alerts}</div>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-3 text-left">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground"
                            onClick={() => setQuickEditUserId(row.userId)}
                            title="تعديل سريع"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Link href={`/dashboard/staff-profiles/${row.userId}`}>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground"
                              title="فتح الملف"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                      لا نتائج مطابقة
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
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
      </div>
    </DashboardLayout>
  );
}
