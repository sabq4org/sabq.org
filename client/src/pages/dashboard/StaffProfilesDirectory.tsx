// دليل المنسوبين — /dashboard/staff-profiles
// جدول بالبحث والفلاتر ونسب الاكتمال؛ فتح الملف صفحةً أو بوب أب للتعديل السريع.

import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
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
  field_reporter: "مراسل ميداني",
  opinion_writer: "كاتب رأي",
};

const ALL = "__all__";

function expiryBadge(label: string, iso: string | null) {
  if (!iso) return null;
  const days = Math.floor((new Date(iso).getTime() - Date.now()) / 86400000);
  if (days < 0) return <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-red-600 text-[10px]">{label} منتهية</Badge>;
  if (days <= 30) return <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 text-[10px]">{label} تنتهي خلال {days} يوماً</Badge>;
  return null;
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
      <div dir="rtl" className="space-y-4 p-1">
        <div className="flex flex-wrap items-center gap-3">
          <IdCard className="h-6 w-6 text-sky-500" />
          <div>
            <h1 className="text-xl font-black">المنسوبون</h1>
            <p className="text-xs text-muted-foreground">ملف المنسوب الموحد — المصدر المرجعي للبطاقة الصحفية وكل الأسطح</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="بحث بالاسم أو البريد أو الرقم الوظيفي…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger className="w-44"><SelectValue placeholder="كل الإدارات" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>كل الإدارات</SelectItem>
              {(lookups?.departments ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.nameAr}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={employmentType} onValueChange={setEmploymentType}>
            <SelectTrigger className="w-40"><SelectValue placeholder="كل الأنواع" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>كل الأنواع</SelectItem>
              {Object.entries(EMPLOYMENT_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-xl border bg-card">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">المنسوب</TableHead>
                  <TableHead className="text-right">الرقم</TableHead>
                  <TableHead className="text-right">المسمى / الإدارة</TableHead>
                  <TableHead className="text-right">النوع</TableHead>
                  <TableHead className="text-right w-40">اكتمال الملف</TableHead>
                  <TableHead className="text-right">تنبيهات</TableHead>
                  <TableHead className="text-left">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {row.profileImageUrl ? (
                          <img src={row.profileImageUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <div className="grid h-8 w-8 place-items-center rounded-full bg-sky-500/15 text-xs font-black text-sky-600">
                            {(row.firstName ?? row.email).slice(0, 1)}
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-bold">{[row.firstName, row.lastName].filter(Boolean).join(" ") || row.email}</div>
                          <div className="text-[11px] text-muted-foreground" dir="ltr">{row.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs" dir="ltr">{row.employeeNumber ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      <div className="font-semibold">{row.jobTitleName ?? "—"}</div>
                      <div className="text-muted-foreground">{row.departmentName ?? "—"}</div>
                    </TableCell>
                    <TableCell className="text-xs">{EMPLOYMENT_LABELS[row.employmentType ?? ""] ?? "—"}</TableCell>
                    <TableCell>
                      {row.hasProfile ? (
                        <div className="flex items-center gap-2">
                          <Progress value={row.completionPercent ?? 0} className="h-2 w-20" />
                          <span className="text-xs font-bold tabular-nums">{row.completionPercent ?? 0}%</span>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">بلا ملف</Badge>
                      )}
                    </TableCell>
                    <TableCell className="space-x-1 space-x-reverse">
                      {expiryBadge("البطاقة", row.pressCardValidUntil)}
                      {expiryBadge("الترخيص", row.mediaLicenseExpiresAt)}
                    </TableCell>
                    <TableCell className="text-left">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setQuickEditUserId(row.userId)} title="تعديل سريع">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Link href={`/dashboard/staff-profiles/${row.userId}`}>
                          <Button size="sm" variant="ghost" title="فتح الملف">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">لا نتائج مطابقة</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>

        <Dialog open={quickEditUserId !== null} onOpenChange={(open) => !open && setQuickEditUserId(null)}>
          <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto" dir="rtl">
            <DialogHeader><DialogTitle>تعديل سريع — ملف المنسوب</DialogTitle></DialogHeader>
            {quickEditUserId && (
              <StaffProfileForm userId={quickEditUserId} mode="dialog" onSaved={() => setQuickEditUserId(null)} />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
