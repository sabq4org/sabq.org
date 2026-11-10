import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Plus, ShieldCheck } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { hasPermission, useAuth } from "@/hooks/useAuth";
import type { RoleStatus } from "@shared/userAdmin";
import { API, type AdminRole } from "./types";
import { NoAccess, StatusTag } from "./ui";
import { RolesMatrix } from "./RolesMatrix";
import { RolesTable, type RoleAction } from "./RolesTable";
import { RolePermissionsSheet } from "./RolePermissionsSheet";
import { CreateRoleDialog, DeleteRoleDialog, EditRoleMetaDialog, RoleStatusDialog } from "./RoleDialogs";

const EXPLAINERS = [
  { title: "تعليق حساب", body: "يمنع دخول مستخدم واحد دون المساس بأدواره. يعود كل شيء كما كان عند رفع التعليق." },
  { title: "سحب دور", body: "يزيل الدور من مستخدم واحد فتتغير خطواته في مسار الخبر فورًا. يبقى الدور لبقية حامليه." },
  { title: "تعطيل دور", body: "يوقف صلاحيات الدور عند كل حامليه دفعة واحدة، ويبقى الإسناد محفوظًا فيعود بالتفعيل." },
];

const DEFINITIONS: Array<{ tone: "ok" | "idle" | "warn" | "bad"; label: string; assign: boolean; works: boolean; undo: string }> = [
  { tone: "ok", label: "مفعّل", assign: true, works: true, undo: "" },
  { tone: "idle", label: "مغلق للإسناد", assign: false, works: true, undo: "فتح الإسناد" },
  { tone: "warn", label: "معطّل", assign: false, works: false, undo: "تفعيل، ويعود لحامليه كما كان" },
  { tone: "bad", label: "مؤرشف", assign: false, works: false, undo: "استعادة إلى «معطّل»" },
];

export default function RolesAdminPage() {
  const { user, isLoading: authLoading } = useAuth({ redirectToLogin: true });
  const allowed = hasPermission(user, "system.manage_roles");
  const rolesQuery = useQuery<AdminRole[]>({ queryKey: [`${API}/roles`], enabled: allowed, staleTime: 10_000 });
  const all = useMemo(() => (Array.isArray(rolesQuery.data) ? rolesQuery.data : []), [rolesQuery.data]);
  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [permRole, setPermRole] = useState<AdminRole | null>(null);
  const [metaRole, setMetaRole] = useState<AdminRole | null>(null);
  const [deleteRole, setDeleteRole] = useState<AdminRole | null>(null);
  const [statusTarget, setStatusTarget] = useState<{ role: AdminRole; to: RoleStatus } | null>(null);

  const archivedCount = all.filter((r) => r.status === "archived").length;
  const visible = showArchived ? all : all.filter((r) => r.status !== "archived");

  const onAction = (a: RoleAction) => {
    if (a.type === "permissions") setPermRole(a.role);
    else if (a.type === "meta") setMetaRole(a.role);
    else if (a.type === "delete") setDeleteRole(a.role);
    else if (a.type === "status") setStatusTarget({ role: a.role, to: a.to });
  };

  if (!authLoading && !allowed) {
    return (
      <DashboardLayout>
        <DashboardPageShell contentClassName="px-4 py-10">
          <NoAccess message="إدارة الأدوار متاحة لمن يملك صلاحية «إدارة الأدوار»." />
        </DashboardPageShell>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <DashboardPageShell maxWidthClassName="max-w-[1280px]" contentClassName="overflow-x-hidden px-4 pb-10 sm:px-6 space-y-5">
        <DashboardPageHeader
          icon={ShieldCheck}
          title="الأدوار"
          description="الدور قالب صلاحيات يُسند للمستخدمين. يُعرَّف ويُعطَّل هنا، ويُسند من ملف المستخدم."
          actions={
            <Button className="min-h-[44px] sm:min-h-9" onClick={() => setCreateOpen(true)} data-testid="button-new-role">
              <Plus className="h-4 w-4" />
              دور جديد
            </Button>
          }
        />

        {rolesQuery.isLoading && (
          <div className="space-y-3" aria-busy>
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        )}

        {rolesQuery.isError && (
          <div className="flex flex-col items-center gap-3 p-8 text-center" role="alert">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <p>تعذّر تحميل الأدوار. أعد المحاولة.</p>
            <Button variant="outline" className="min-h-[44px] sm:min-h-9" onClick={() => rolesQuery.refetch()}>
              إعادة المحاولة
            </Button>
          </div>
        )}

        {!rolesQuery.isLoading && !rolesQuery.isError && (
          <>
            <section className="space-y-2.5">
              <h2 className="text-sm font-semibold">من يفعل ماذا في مسار الخبر</h2>
              <RolesMatrix roles={all} />
            </section>

            <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {EXPLAINERS.map((e) => (
                <div key={e.title} className="space-y-1 rounded-lg border p-3.5">
                  <h3 className="text-sm font-semibold">{e.title}</h3>
                  <p className="text-[13px] text-muted-foreground">{e.body}</p>
                </div>
              ))}
            </section>

            <section className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">كل الأدوار</h2>
                {archivedCount > 0 && (
                  <Button variant="outline" size="sm" className="min-h-[44px] md:min-h-8" aria-pressed={showArchived} onClick={() => setShowArchived((v) => !v)}>
                    {showArchived ? "إخفاء المؤرشفة" : `عرض المؤرشفة (${archivedCount})`}
                  </Button>
                )}
              </div>
              <RolesTable roles={visible} onAction={onAction} />
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold">حالات الدور</h2>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-[12.5px] text-muted-foreground">
                      <th className="border-b px-3 py-2 text-start font-semibold">الحالة</th>
                      <th className="border-b px-3 py-2 text-start font-semibold">يُسند لجديد</th>
                      <th className="border-b px-3 py-2 text-start font-semibold">تعمل عند حامليه</th>
                      <th className="border-b px-3 py-2 text-start font-semibold">الرجوع عنها</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DEFINITIONS.map((d) => (
                      <tr key={d.label}>
                        <td className="border-b px-3 py-2 last:border-b-0">
                          <StatusTag tone={d.tone}>{d.label}</StatusTag>
                        </td>
                        <td className={`border-b px-3 py-2 font-semibold ${d.assign ? "text-success" : "text-destructive"}`}>{d.assign ? "نعم" : "لا"}</td>
                        <td className={`border-b px-3 py-2 font-semibold ${d.works ? "text-success" : "text-destructive"}`}>{d.works ? "نعم" : "لا"}</td>
                        <td className="border-b px-3 py-2 text-muted-foreground">{d.undo || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                الحذف النهائي فقط لدور لم يُسند قط. «مدير النظام» و«مسؤول» لا يُعطَّلان. التعطيل يعرض عدد المتأثرين ومن سيبقى بلا أي صلاحية تحرير قبل التأكيد.
              </p>
            </section>
          </>
        )}
      </DashboardPageShell>

      <CreateRoleDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <RolePermissionsSheet role={permRole} onClose={() => setPermRole(null)} />
      <EditRoleMetaDialog role={metaRole} onClose={() => setMetaRole(null)} />
      <DeleteRoleDialog role={deleteRole} onClose={() => setDeleteRole(null)} />
      <RoleStatusDialog target={statusTarget} onClose={() => setStatusTarget(null)} />
    </DashboardLayout>
  );
}
