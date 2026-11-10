import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { AlertCircle } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { hasPermission, useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { API, type PreviewResponse, type UserProfile } from "./types";
import { errorMessage, formatMonthYear, initialOf, isStaleVersionError, relativeTimeAr, statusText, statusTone } from "./format";
import { NoAccess, StatusTag } from "./ui";
import { PermissionTracks } from "./PermissionTracks";
import { InfoSection, RolesSection, SecuritySection, Section, StatusSection } from "./ProfileSections";
import { ReviewDialog, SaveBar } from "./SaveReview";
import { ResetPasswordDialog, invalidateUserQueries } from "./UserActionDialogs";
import {
  baseDraft,
  blockingIssues,
  buildPayload,
  changedOverrideCodes,
  changedRoleIds,
  countDirty,
  summarize,
  type Draft,
} from "./profileState";

const SECTIONS = [
  { id: "s-pub", label: "النشر والتحرير", key: "pub" },
  { id: "s-roles", label: "الأدوار", key: "roles" },
  { id: "s-status", label: "حالة الحساب", key: "status" },
  { id: "s-info", label: "البيانات", key: "info" },
  { id: "s-security", label: "الأمان", key: "security" },
] as const;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** يحذّر عند مغادرة الصفحة وفيها تغييرات: إغلاق التبويب أو الضغط على أي رابط داخلي. */
function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || e.defaultPrevented) return;
      const href = a.getAttribute("href") || "";
      if (!href.startsWith("/") || href.startsWith("//")) return;
      if (href.split("#")[0] === window.location.pathname) return;
      if (!window.confirm("لديك تغييرات لم تُحفظ. هل تريد مغادرة الصفحة وتجاهلها؟")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
}

export default function UserAdminProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user: actor, isLoading: authLoading } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();
  const canView = hasPermission(actor, "users.view");

  const profileQuery = useQuery<UserProfile | null>({
    queryKey: [`${API}/users/${id}`],
    enabled: canView && !!id,
    staleTime: 0,
    refetchOnMount: "always",
    retry: (n, e) => n < 2 && !/غير موجود/.test(String((e as Error)?.message)),
  });
  const profile = profileQuery.data ?? null;
  const base = useMemo(() => (profile ? baseDraft(profile) : null), [profile]);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [stale, setStale] = useState(false);
  const [active, setActive] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    setDraft(null);
    setReviewOpen(false);
  }, [profile?.version, profile?.user.id]);

  const cur = draft ?? base;
  const edit = useCallback((fn: (d: Draft) => Draft) => base && setDraft((prev) => fn(prev ?? base)), [base]);

  const rolesOrOverridesChanged =
    !!base && !!cur && (changedRoleIds(base.roleIds, cur.roleIds).length > 0 || changedOverrideCodes(base.overrides, cur.overrides).length > 0);
  const proposal = useDebounced(
    cur ? { roleIds: cur.roleIds, overrides: Object.entries(cur.overrides).map(([code, effect]) => ({ code, effect })) } : null,
    250,
  );
  const previewQuery = useQuery<PreviewResponse>({
    queryKey: [`${API}/users/${id}/preview`, "draft", JSON.stringify(proposal)],
    queryFn: () => apiRequest<PreviewResponse>(`${API}/users/${id}/preview`, { method: "POST", body: JSON.stringify(proposal) }),
    enabled: !!profile && !!proposal && rolesOrOverridesChanged,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  });
  const preview = rolesOrOverridesChanged ? previewQuery.data ?? null : null;
  // معاينة فاشلة أو متأخرة عن آخر تعديل: لا نعرض أثرًا قديمًا كأنه الحالي.
  const previewFailed = rolesOrOverridesChanged && previewQuery.isError;
  const previewPending = rolesOrOverridesChanged && (previewQuery.isFetching || JSON.stringify(proposal) !== JSON.stringify(cur ? { roleIds: cur.roleIds, overrides: Object.entries(cur.overrides).map(([code, effect]) => ({ code, effect })) } : null));
  const steps = preview?.steps ?? profile?.steps ?? [];

  const counts = profile && base && cur ? countDirty(profile, cur, base, steps) : { pub: 0, roles: 0, status: 0, info: 0, total: 0 };
  const issues = profile && cur ? blockingIssues(profile, cur) : [];
  useUnsavedGuard(counts.total > 0);

  const save = useMutation({
    mutationFn: (reason: string) => apiRequest<UserProfile>(`${API}/users/${id}`, { method: "PATCH", body: JSON.stringify(buildPayload(profile!, cur!, reason)) }),
    onSuccess: (fresh) => {
      queryClient.setQueryData([`${API}/users/${id}`], fresh);
      invalidateUserQueries();
      setDraft(null);
      setReviewOpen(false);
      setStale(false);
      toast({ title: "حُفظت التغييرات", description: profile?.user.name });
    },
    onError: (e) => {
      setReviewOpen(false);
      if (isStaleVersionError(e)) setStale(true);
      else toast({ title: "تعذّر الحفظ", description: errorMessage(e), variant: "destructive" });
    },
  });

  // مراقبة القسم الظاهر لتلوين الشريط الجانبي
  useEffect(() => {
    if (!profile) return;
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e);
    const obs = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting);
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [profile]);

  const wrap = (children: ReactNode) => (
    <DashboardLayout>
      <DashboardPageShell maxWidthClassName="max-w-[1200px]" contentClassName="overflow-x-hidden px-4 pb-24 pt-4 sm:px-6 space-y-5">
        {children}
      </DashboardPageShell>
    </DashboardLayout>
  );

  if (!authLoading && !canView) return wrap(<NoAccess />);

  if (profileQuery.isError) {
    const notFound = /غير موجود/.test(String((profileQuery.error as Error)?.message));
    return wrap(
      <div className="flex flex-col items-center gap-3 p-10 text-center" role="alert">
        <AlertCircle className="h-6 w-6 text-destructive" />
        <p>{notFound ? "المستخدم غير موجود." : "تعذّر تحميل ملف المستخدم. أعد المحاولة."}</p>
        <div className="flex gap-2">
          {!notFound && (
            <Button variant="outline" className="min-h-[44px] sm:min-h-9" onClick={() => profileQuery.refetch()}>
              إعادة المحاولة
            </Button>
          )}
          <Button asChild variant="outline" className="min-h-[44px] sm:min-h-9">
            <Link href="/dashboard/users">العودة إلى المستخدمين</Link>
          </Button>
        </div>
      </div>,
    );
  }

  if (!profile || !base || !cur) {
    return wrap(
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>,
    );
  }

  const u = profile.user;
  const a = profile.access;
  const rolesDisabled = !a.canChangeRoles;
  const superuser = profile.resolved.isSuperuser;
  const permsDisabled = rolesDisabled || superuser;
  const counters: Record<string, number> = { pub: counts.pub, roles: counts.roles, status: counts.status, info: counts.info, security: 0 };

  return wrap(
    <>
      <nav aria-label="مسار التنقل" className="text-xs">
        <Link href="/dashboard/users" className="text-primary hover:underline">
          المستخدمون
        </Link>
        <span className="mx-1.5 text-muted-foreground">/</span>
        <span>{u.name}</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="h-14 w-14">
            {u.profileImageUrl && <AvatarImage src={u.profileImageUrl} alt="" />}
            <AvatarFallback className="bg-primary/10 text-xl font-bold text-primary">{initialOf(u.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold" data-testid="profile-name">
              {u.name}
            </h1>
            <span dir="ltr" className="block truncate text-start text-sm text-muted-foreground" style={{ unicodeBidi: "isolate" }}>
              {u.email || u.phoneNumber || ""}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <StatusTag tone={statusTone(u.status)}>{statusText(u.status, u.suspendedUntil, u.bannedUntil)}</StatusTag>
          <span className="text-xs text-muted-foreground">
            آخر نشاط: {relativeTimeAr(u.lastActivityAt)}
            {u.createdAt ? ` · مسجّل منذ ${formatMonthYear(u.createdAt)}` : ""}
          </span>
        </div>
      </div>

      {stale && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm" role="alert">
          <span>عدّل شخص آخر هذا المستخدم بعد أن فتحت الصفحة. حدّث الملف ثم أعد التعديل؛ ستُفقد تغييراتك غير المحفوظة.</span>
          <Button
            className="min-h-[44px] sm:min-h-9"
            onClick={async () => {
              setStale(false);
              setDraft(null);
              await profileQuery.refetch();
            }}
          >
            تحديث الملف
          </Button>
        </div>
      )}

      <div className="space-y-2 rounded-lg border bg-muted/40 p-3.5" aria-live="polite">
        <span className="text-xs text-muted-foreground">باختصار</span>
        <p className="text-[15px] leading-8" data-testid="profile-summary">
          {superuser ? "الصلاحيات: كل الصلاحيات (حساب إداري)." : summarize(steps)}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-7 md:grid-cols-[200px_minmax(0,1fr)]">
        <nav
          aria-label="أقسام الملف"
          className="sticky top-0 z-10 -mx-4 flex gap-0.5 overflow-x-auto border-b bg-background px-4 py-1.5 md:top-4 md:mx-0 md:flex-col md:self-start md:border-b-0 md:bg-transparent md:p-0"
        >
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => {
                e.preventDefault();
                setActive(s.id);
                document.getElementById(s.id)?.scrollIntoView({ block: "start", behavior: "smooth" });
              }}
              className={cn(
                "flex min-h-[44px] items-center justify-between gap-2 whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium md:min-h-9",
                active === s.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {s.label}
              {counters[s.key] > 0 && <span className="rounded bg-warning/20 px-1.5 text-xs font-semibold tabular-nums text-foreground">{counters[s.key]}</span>}
            </a>
          ))}
        </nav>

        <div className="min-w-0 space-y-7">
          <Section
            id="s-pub"
            title="النشر والتحرير"
            description="كل سطر خطوة في رحلة المادة. «حسب الدور» يأخذ ما تقرره الأدوار؛ «منح» و«حجب» استثناء شخصي لهذا المستخدم فقط، ويُسجَّل في سجل التدقيق."
          >
            {superuser && (
              <p className="rounded border bg-muted/50 px-3 py-2 text-sm">هذا حساب إداري يملك كل الصلاحيات؛ لا تُطبَّق عليه الاستثناءات.</p>
            )}
            {!superuser && rolesDisabled && a.blockedReason && (
              <p className="rounded border border-warning/40 bg-warning/10 px-3 py-2 text-sm">{a.blockedReason}</p>
            )}
            {!superuser && rolesDisabled && !a.blockedReason && (
              <p className="rounded border bg-muted/50 px-3 py-2 text-sm">لا تملك صلاحية تغيير الأدوار والصلاحيات.</p>
            )}
            {profile.otherOverridesCount > 0 && (
              <p className="text-xs text-muted-foreground">للمستخدم {profile.otherOverridesCount} استثناءات أخرى خارج مسار الخبر لا تظهر هنا ولا تتأثر بالحفظ.</p>
            )}
            {previewFailed && (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-sm text-destructive">
                تعذّر حساب أثر التغييرات على الخطوات. ما يظهر أدناه قد لا يعكس تعديلك؛ أعد المحاولة قبل الحفظ.{" "}
                <button type="button" className="font-semibold underline" onClick={() => previewQuery.refetch()}>إعادة الحساب</button>
              </p>
            )}
            <PermissionTracks
              steps={steps}
              baseSteps={profile.steps}
              roles={profile.roles}
              overrides={cur.overrides}
              baseOverrides={base.overrides}
              disabled={permsDisabled}
              onChange={(code, choice) =>
                edit((d) => {
                  const next = { ...d.overrides };
                  if (choice === "role") delete next[code];
                  else next[code] = choice;
                  return { ...d, overrides: next };
                })
              }
            />
          </Section>

          <Section id="s-roles" title="الأدوار" description="يمكن إسناد أكثر من دور. تغيير الدور ينقل الخطوات أعلاه تلقائيًا، فترى أثره قبل الحفظ.">
            <RolesSection
              roles={profile.roles}
              roleIds={cur.roleIds}
              baseRoleIds={base.roleIds}
              disabled={rolesDisabled}
              blockedReason={a.blockedReason}
              onToggle={(rid, on) => edit((d) => ({ ...d, roleIds: on ? [...d.roleIds, rid] : d.roleIds.filter((x) => x !== rid) }))}
            />
          </Section>

          <Section id="s-status" title="حالة الحساب" description="الحالة تتحكم في الدخول فقط ولا تمس الأدوار. أي حالة غير «نشط» تُنهي الجلسات على الموقع والتطبيقات فورًا.">
            <StatusSection profile={profile} value={cur.status} disabled={!a.canChangeStatus} onChange={(s) => edit((d) => ({ ...d, status: s }))} />
          </Section>

          <Section id="s-info" title="البيانات">
            <InfoSection
              info={cur.info}
              email={u.email}
              disabled={!a.canEditProfile}
              canEditEmail={a.canEditEmail}
              onChange={(k, v) => edit((d) => ({ ...d, info: { ...d.info, [k]: v } }))}
            />
          </Section>

          <Section id="s-security" title="الأمان">
            <SecuritySection canReset={hasPermission(actor, "users.update")} isSelf={a.isSelf} onReset={() => setResetOpen(true)} />
          </Section>
        </div>
      </div>

      <SaveBar count={counts.total} issues={issues} onDiscard={() => setDraft(null)} onReview={() => setReviewOpen(true)} />
      <ReviewDialog
        previewState={previewFailed ? "failed" : previewPending ? "pending" : "ok"}
        open={reviewOpen}
        profile={profile}
        draft={cur}
        base={base}
        preview={preview}
        saving={save.isPending}
        onCancel={() => setReviewOpen(false)}
        onConfirm={(reason) => save.mutate(reason)}
      />
      <ResetPasswordDialog user={resetOpen ? { id: u.id, name: u.name } : null} onClose={() => setResetOpen(false)} />
    </>,
  );
}
