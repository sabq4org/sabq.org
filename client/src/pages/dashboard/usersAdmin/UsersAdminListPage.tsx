import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { AlertCircle, Search, UserPlus, Users } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { AddUserDialog } from "@/components/AddUserDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { hasAnyPermission, hasPermission, useAuth } from "@/hooks/useAuth";
import { PUBLISH_LEVELS, PUBLISH_LEVEL_LABELS_AR, type PublishLevel } from "@shared/userAdmin";
import { API, type AdminRole, type ListResponse, type SummaryResponse, type UserKind } from "./types";
import { ACCOUNT_STATUS_LABELS } from "./format";
import { Field, NoAccess } from "./ui";
import { LIST_GRID, UserListRow, type RowActions } from "./UserListRow";
import { PermanentDeleteDialog, ResetPasswordDialog, StatusActionDialog, type StatusActionKind } from "./UserActionDialogs";

const PAGE_SIZE = 25;
const ALL = "__all";
const KINDS: Array<{ value: UserKind; label: string }> = [
  { value: "staff", label: "المنسوبون" },
  { value: "readers", label: "القرّاء" },
  { value: "all", label: "الكل" },
];
const SORTS = [
  { value: "activity", label: "آخر نشاط" },
  { value: "newest", label: "الأحدث تسجيلًا" },
  { value: "name", label: "الاسم" },
];
const VERIFY_OPTIONS = [
  { value: "email_verified", label: "بريد موثّق" },
  { value: "email_unverified", label: "بريد غير موثّق" },
  { value: "phone_verified", label: "جوال موثّق" },
  { value: "phone_unverified", label: "جوال غير موثّق" },
  { value: "two_factor", label: "تحقق ثنائي مفعّل" },
  { value: "no_email", label: "بلا بريد" },
];
const STATUSES = ["active", "pending", "restricted", "suspended", "banned", "locked"] as const;

function asKind(v: string | null, fallback: UserKind): UserKind {
  return v === "staff" || v === "readers" || v === "all" ? v : fallback;
}

export default function UsersAdminListPage({ defaultKind = "staff" }: { defaultKind?: UserKind }) {
  const { user, isLoading: authLoading } = useAuth({ redirectToLogin: true });
  const [path, navigate] = useLocation();
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);

  const kind = asKind(params.get("kind"), defaultKind);
  const q = params.get("q") ?? "";
  // فلتر الدور مخفي في عرض القرّاء، فلا يُرسل فيه (كفلتر النشر) وإلا أفرغ القائمة بشرط لا يُرى.
  const roleId = kind === "readers" ? "" : params.get("roleId") ?? "";
  const status = params.get("status") ?? "";
  const publish = kind === "staff" ? params.get("publish") ?? "" : "";
  const verify = params.get("verify") ?? "";
  const variant = kind === "readers" ? "contact" : "staff";
  const sort = params.get("sort") ?? "activity";
  const page = Math.max(1, Number(params.get("page")) || 1);

  const update = useCallback(
    (patch: Record<string, string | null>, keepPage = false) => {
      const next = new URLSearchParams(search);
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (!keepPage) next.delete("page");
      if (next.get("kind") === defaultKind) next.delete("kind");
      const qs = next.toString();
      navigate(qs ? `${path}?${qs}` : path, { replace: true });
    },
    [search, path, navigate, defaultKind],
  );

  const [qInput, setQInput] = useState(q);
  useEffect(() => setQInput(q), [q]);
  useEffect(() => {
    if (qInput === q) return;
    const t = setTimeout(() => update({ q: qInput.trim() || null }), 300);
    return () => clearTimeout(t);
  }, [qInput, q, update]);

  const canView = hasPermission(user, "users.view");
  const canRoles = hasPermission(user, "system.manage_roles");

  const listQuery = useQuery<ListResponse>({
    queryKey: [`${API}/users`, { kind, q, roleId, status, publish, verify, sort, page, pageSize: PAGE_SIZE }],
    enabled: canView,
    staleTime: 15_000,
  });
  const summaryQuery = useQuery<SummaryResponse>({ queryKey: [`${API}/summary`], enabled: canView, staleTime: 30_000 });
  const rolesQuery = useQuery<AdminRole[]>({ queryKey: [`${API}/roles`], enabled: canView && canRoles, staleTime: 60_000 });

  const roles = Array.isArray(rolesQuery.data) ? rolesQuery.data.filter((r) => r.status !== "archived") : [];
  const items = Array.isArray(listQuery.data?.items) ? listQuery.data!.items : [];
  const total = listQuery.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const summary = summaryQuery.data;

  const [addOpen, setAddOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<{ user: { id: string; name: string }; kind: StatusActionKind } | null>(null);
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const actions: RowActions = {
    onStatus: (u, k) => setStatusTarget({ user: { id: u.id, name: u.name }, kind: k }),
    onDelete: (u) => setDeleteTarget({ id: u.id, name: u.name }),
    onResetPassword: (u) => setResetTarget({ id: u.id, name: u.name }),
    canManageStatus: hasAnyPermission(user, "users.manage", "users.suspend", "users.ban"),
    canDelete: hasPermission(user, "users.delete"),
    canResetPassword: hasPermission(user, "users.update"),
  };

  const hasFilters = !!(q || roleId || status || publish || verify);
  const clearFilters = () => {
    setQInput("");
    update({ q: null, roleId: null, status: null, publish: null, verify: null });
  };

  const kpis: Array<{ key: string; label: string; value: number | undefined; pressed: boolean; onClick: () => void }> = [
    {
      key: "staff",
      label: "المنسوبون",
      value: summary?.staff,
      pressed: kind === "staff" && !publish && !status,
      onClick: () => update({ kind: "staff", publish: null, status: null }),
    },
    {
      key: "publishers",
      label: "ينشرون مباشرة",
      value: summary?.publishers,
      pressed: kind === "staff" && publish === "publishes",
      onClick: () => update({ kind: "staff", publish: "publishes", status: null }),
    },
    {
      key: "restricted",
      label: "معلّقون أو محظورون",
      value: summary?.restricted,
      pressed: kind === "staff" && status === "restricted",
      // الخادم يقبل حالة واحدة في الفلتر؛ نبدأ بالمعلّقين ويغيّرها المستخدم إلى «محظور».
      onClick: () => update({ kind: "staff", publish: null, status: "restricted" }),
    },
    {
      key: "readers",
      label: "القرّاء",
      value: summary?.readers,
      pressed: kind === "readers",
      onClick: () => update({ kind: "readers", publish: null, status: null }),
    },
  ];

  if (!authLoading && !canView) {
    return (
      <DashboardLayout>
        <DashboardPageShell contentClassName="px-4 py-10">
          <NoAccess />
        </DashboardPageShell>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <DashboardPageShell maxWidthClassName="max-w-[1280px]" contentClassName="overflow-x-hidden px-4 pb-10 sm:px-6 space-y-4">
        <DashboardPageHeader
          icon={Users}
          title="المستخدمون"
          description="من يدخل اللوحة، وماذا يستطيع أن يفعل بالخبر"
          actions={
            hasPermission(user, "users.create") ? (
              <Button className="min-h-[44px] sm:min-h-9" onClick={() => setAddOpen(true)} data-testid="button-add-user">
                <UserPlus className="h-4 w-4" />
                إضافة مستخدم
              </Button>
            ) : undefined
          }
        />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="users-kpis">
          {kpis.map((k) => (
            <button
              key={k.key}
              type="button"
              aria-pressed={k.pressed}
              onClick={k.onClick}
              className={`flex min-h-[64px] flex-col gap-0.5 rounded-lg border bg-card p-3 text-start transition-colors hover:border-foreground/30 ${
                k.pressed ? "border-primary ring-1 ring-primary" : ""
              }`}
            >
              {summaryQuery.isLoading ? (
                <Skeleton className="h-7 w-14" />
              ) : (
                <strong className="text-[22px] font-bold tabular-nums">{k.value == null ? "؟" : k.value.toLocaleString("en-US")}</strong>
              )}
              <span className="text-[12.5px] text-muted-foreground">{k.label}</span>
            </button>
          ))}
        </div>

        <div role="tablist" aria-label="نوع المستخدمين" className="flex gap-0.5 overflow-x-auto border-b">
          {KINDS.map((k) => (
            <button
              key={k.value}
              role="tab"
              type="button"
              aria-selected={kind === k.value}
              onClick={() => update({ kind: k.value, publish: null })}
              className={`min-h-[44px] whitespace-nowrap border-b-2 px-4 text-sm ${
                kind === k.value ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 items-end gap-2.5 md:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))]">
          <Field label="بحث" htmlFor="ua-q" className="col-span-2 md:col-span-1">
            <div className="relative">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="ua-q"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="الاسم أو البريد أو الجوال"
                className="min-h-[44px] ps-9 sm:min-h-9"
              />
            </div>
          </Field>
          {kind === "staff" && (
            <Field label="صلاحية النشر" htmlFor="ua-publish">
              <Select value={publish || ALL} onValueChange={(v) => update({ publish: v === ALL ? null : v })} dir="rtl">
                <SelectTrigger id="ua-publish" className="min-h-[44px] sm:min-h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>الكل</SelectItem>
                  {(PUBLISH_LEVELS as readonly PublishLevel[]).map((l) => (
                    <SelectItem key={l} value={l}>
                      {PUBLISH_LEVEL_LABELS_AR[l]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          {canRoles && roles.length > 0 && kind !== "readers" && (
            <Field label="الدور" htmlFor="ua-role">
              <Select value={roleId || ALL} onValueChange={(v) => update({ roleId: v === ALL ? null : v })} dir="rtl">
                <SelectTrigger id="ua-role" className="min-h-[44px] sm:min-h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>كل الأدوار</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.nameAr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="التوثيق" htmlFor="ua-verify">
            <Select value={verify || ALL} onValueChange={(v) => update({ verify: v === ALL ? null : v })} dir="rtl">
              <SelectTrigger id="ua-verify" className="min-h-[44px] sm:min-h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>الكل</SelectItem>
                {VERIFY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="حالة الحساب" htmlFor="ua-status">
            <Select value={status || ALL} onValueChange={(v) => update({ status: v === ALL ? null : v })} dir="rtl">
              <SelectTrigger id="ua-status" className="min-h-[44px] sm:min-h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>كل الحالات</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "restricted" ? "معلّق أو محظور" : ACCOUNT_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="الترتيب" htmlFor="ua-sort">
            <Select value={sort} onValueChange={(v) => update({ sort: v === "activity" ? null : v })} dir="rtl">
              <SelectTrigger id="ua-sort" className="min-h-[44px] sm:min-h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div role="table" aria-label="المستخدمون" className="overflow-hidden rounded-lg border bg-card">
          <div role="row" className={`${LIST_GRID} hidden border-b bg-muted/50 px-4 py-2 text-[12.5px] font-semibold text-muted-foreground md:grid`}>
            <span>المستخدم</span>
            <span>{variant === "contact" ? "البريد" : "الأدوار"}</span>
            <span>{variant === "contact" ? "الجوال" : "في مسار الخبر"}</span>
            <span>الحالة</span>
            <span>آخر نشاط</span>
            <span />
          </div>

          {listQuery.isLoading &&
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`${LIST_GRID} items-center border-b p-3.5 md:px-4 md:py-3`} aria-hidden>
                <div className="col-span-2 flex items-center gap-2.5 md:col-span-1">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="col-span-2 h-8 w-28 md:col-span-1" />
              </div>
            ))}

          {listQuery.isError && (
            <div className="flex flex-col items-center gap-3 p-8 text-center" role="alert">
              <AlertCircle className="h-6 w-6 text-destructive" />
              <p>تعذّر تحميل المستخدمين. تحقق من الاتصال ثم أعد المحاولة.</p>
              <Button variant="outline" className="min-h-[44px] sm:min-h-9" onClick={() => listQuery.refetch()}>
                إعادة المحاولة
              </Button>
            </div>
          )}

          {!listQuery.isLoading && !listQuery.isError && items.length === 0 && (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <p>{hasFilters ? "لا يوجد مستخدم يطابق هذه الفلاتر." : "لا يوجد مستخدمون في هذا العرض."}</p>
              {hasFilters && (
                <Button variant="outline" className="min-h-[44px] sm:min-h-9" onClick={clearFilters}>
                  مسح الفلاتر
                </Button>
              )}
            </div>
          )}

          {!listQuery.isError && items.map((u) => <UserListRow key={u.id} user={u} actions={actions} variant={variant} />)}

          {!listQuery.isError && total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2.5 border-t bg-muted/50 px-4 py-2.5">
              <span className="text-xs tabular-nums text-muted-foreground">
                {((page - 1) * PAGE_SIZE + 1).toLocaleString("en-US")}–{Math.min(page * PAGE_SIZE, total).toLocaleString("en-US")} من {total.toLocaleString("en-US")}
              </span>
              <div className="flex items-center gap-2.5">
                <Button variant="outline" className="min-h-[44px] sm:min-h-9" disabled={page <= 1} onClick={() => update({ page: String(page - 1) }, true)}>
                  السابق
                </Button>
                <span className="text-xs tabular-nums">
                  صفحة {page} من {pages}
                </span>
                <Button variant="outline" className="min-h-[44px] sm:min-h-9" disabled={page >= pages} onClick={() => update({ page: String(page + 1) }, true)}>
                  التالي
                </Button>
              </div>
            </div>
          )}
        </div>
      </DashboardPageShell>

      <AddUserDialog open={addOpen} onOpenChange={setAddOpen} />
      <StatusActionDialog user={statusTarget?.user ?? null} kind={statusTarget?.kind ?? null} onClose={() => setStatusTarget(null)} />
      <ResetPasswordDialog user={resetTarget} onClose={() => setResetTarget(null)} />
      <PermanentDeleteDialog user={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </DashboardLayout>
  );
}
