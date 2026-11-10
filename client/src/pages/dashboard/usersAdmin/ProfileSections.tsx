import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ROLE_STATUS_LABELS_AR } from "@shared/userAdmin";
import type { ProfileRole, UserProfile } from "./types";
import { changedRoleIds, phoneError, type InfoDraft, type StatusAction, type StatusUi } from "./profileState";
import { formatDate } from "./format";
import { Field, RoleStatusTag } from "./ui";
import { DurationSelect } from "./UserActionDialogs";

export function Section({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-3.5 border-t pt-7 first:border-t-0 first:pt-0" aria-labelledby={`${id}-h`}>
      <header className="space-y-0.5">
        <h2 id={`${id}-h`} className="text-[17px] font-bold">
          {title}
        </h2>
        {description && <p className="text-[12.5px] text-muted-foreground">{description}</p>}
      </header>
      {children}
    </section>
  );
}

export function RolesSection({
  roles,
  roleIds,
  baseRoleIds,
  disabled,
  blockedReason,
  onToggle,
}: {
  roles: ProfileRole[];
  roleIds: string[];
  baseRoleIds: string[];
  disabled: boolean;
  blockedReason: string | null;
  onToggle: (id: string, on: boolean) => void;
}) {
  const changed = new Set(changedRoleIds(baseRoleIds, roleIds));
  return (
    <div className="space-y-2.5">
      {disabled && blockedReason && <p className="rounded border border-warning/40 bg-warning/10 px-3 py-2 text-sm">{blockedReason}</p>}
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {roles.map((r) => {
          const on = roleIds.includes(r.id);
          const off = disabled || !!r.notAssignableReason;
          // دور مسند ومعطّل يمكن سحبه دائمًا حتى لو تعذّر إسناده من جديد
          const canUncheck = !disabled && r.assigned && on;
          const lockedOut = off && !canUncheck;
          return (
            <label
              key={r.id}
              className={cn(
                "flex min-h-[44px] items-start gap-2.5 rounded-lg border bg-card p-3",
                lockedOut ? "cursor-not-allowed bg-muted/50" : "cursor-pointer hover:border-foreground/30",
                on && "border-primary ring-1 ring-primary",
              )}
            >
              <input
                type="checkbox"
                className="mt-1.5 h-4 w-4 flex-none accent-[hsl(var(--primary))]"
                checked={on}
                disabled={lockedOut}
                onChange={(e) => onToggle(r.id, e.target.checked)}
              />
              <span className="min-w-0 space-y-0.5">
                <span className={cn("flex flex-wrap items-center gap-2 font-semibold", lockedOut && "text-muted-foreground")}>
                  {r.nameAr}
                  {r.status !== "active" && <RoleStatusTag status={r.status} />}
                  {changed.has(r.id) && (
                    <span className="rounded bg-warning/20 px-1.5 text-xs font-medium">{on ? "سيُسند" : "سيُسحب"}</span>
                  )}
                </span>
                {r.description && <span className="block text-[12.5px] text-muted-foreground">{r.description}</span>}
                {r.notAssignableReason && !disabled && <span className="block text-xs text-muted-foreground">{r.notAssignableReason}</span>}
                {r.assigned && (r.status === "disabled" || r.status === "archived") && (
                  <span className="block text-xs text-warning">الدور {ROLE_STATUS_LABELS_AR[r.status]}: صلاحياته متوقفة لهذا المستخدم</span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

const STATUS_OPTIONS: Array<{ value: StatusAction; title: string; desc: string }> = [
  { value: "active", title: "نشط", desc: "يدخل ويعمل بصلاحياته." },
  { value: "suspended", title: "معلّق مؤقتًا", desc: "يُمنع حتى تاريخ محدد ثم يعود تلقائيًا." },
  { value: "banned", title: "محظور", desc: "يُمنع حتى تُحدَّد مدة أو يُرفع الحظر يدويًا." },
];

export function StatusSection({
  profile,
  value,
  disabled,
  onChange,
}: {
  profile: UserProfile;
  value: StatusUi;
  disabled: boolean;
  onChange: (next: StatusUi) => void;
}) {
  const u = profile.user;
  return (
    <div className="space-y-3">
      {u.status === "suspended" && (
        <p className="rounded border bg-muted/50 px-3 py-2 text-sm">
          الحساب معلّق {u.suspendedUntil ? `حتى ${formatDate(u.suspendedUntil, true)}` : "حتى يُرفع يدويًا"}
          {u.suspensionReason ? `. السبب: ${u.suspensionReason}` : ""}
        </p>
      )}
      {u.status === "banned" && (
        <p className="rounded border bg-muted/50 px-3 py-2 text-sm">
          الحساب محظور {u.bannedUntil ? `حتى ${formatDate(u.bannedUntil, true)}` : "حتى يُرفع يدويًا"}
          {u.banReason ? `. السبب: ${u.banReason}` : ""}
        </p>
      )}
      {(u.status === "pending" || u.status === "locked") && (
        <p className="rounded border bg-muted/50 px-3 py-2 text-sm">
          {u.status === "pending" ? "الحساب بانتظار التفعيل." : "الحساب مقفل مؤقتًا بسبب محاولات دخول فاشلة."}
        </p>
      )}
      {disabled && profile.access.blockedReason && (
        <p className="rounded border border-warning/40 bg-warning/10 px-3 py-2 text-sm">{profile.access.blockedReason}</p>
      )}
      {disabled && !profile.access.blockedReason && <p className="text-sm text-muted-foreground">لا تملك صلاحية تغيير حالة الحساب.</p>}
      <div role="radiogroup" aria-label="حالة الحساب" className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
        {STATUS_OPTIONS.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex min-h-[44px] items-start gap-2.5 rounded-lg border bg-card p-3",
              disabled ? "cursor-not-allowed bg-muted/50" : "cursor-pointer hover:border-foreground/30",
              value.action === o.value && "border-primary ring-1 ring-primary",
            )}
          >
            <input
              type="radio"
              name="account-status"
              className="mt-1.5 h-4 w-4 flex-none accent-[hsl(var(--primary))]"
              checked={value.action === o.value}
              disabled={disabled}
              onChange={() => onChange({ ...value, action: o.value, touched: false })}
            />
            <span className="space-y-0.5">
              <span className="block font-semibold">{o.title}</span>
              <span className="block text-[12.5px] text-muted-foreground">{o.desc}</span>
            </span>
          </label>
        ))}
      </div>
      {value.action !== "active" && !disabled && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="المدة" htmlFor="st-duration">
            <DurationSelect id="st-duration" value={value.duration} onChange={(d) => onChange({ ...value, duration: d, touched: true })} />
          </Field>
          <Field label="السبب" htmlFor="st-reason" hint="5 أحرف على الأقل. يُسجَّل في سجل التدقيق.">
            <Input
              id="st-reason"
              value={value.reason}
              maxLength={500}
              onChange={(e) => onChange({ ...value, reason: e.target.value, touched: true })}
              className="min-h-[44px] sm:min-h-9"
            />
          </Field>
        </div>
      )}
    </div>
  );
}

export function InfoSection({
  info,
  email,
  disabled,
  canEditEmail,
  onChange,
}: {
  info: InfoDraft;
  email: string | null;
  disabled: boolean;
  canEditEmail: boolean;
  onChange: (key: keyof InfoDraft, value: string) => void;
}) {
  const text = (key: keyof InfoDraft, label: string, extra?: { dir?: "ltr"; error?: string | null; hint?: string }) => (
    <Field label={label} htmlFor={`info-${key}`} error={extra?.error} hint={extra?.hint}>
      <Input
        id={`info-${key}`}
        value={info[key]}
        dir={extra?.dir}
        disabled={disabled}
        aria-invalid={!!extra?.error}
        onChange={(e) => onChange(key, e.target.value)}
        className={cn("min-h-[44px] sm:min-h-9", extra?.error && "border-destructive")}
      />
    </Field>
  );
  return (
    <div className="space-y-3">
      {disabled && <p className="text-sm text-muted-foreground">لا تملك صلاحية تعديل بيانات المستخدمين.</p>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {text("firstName", "الاسم الأول")}
        {text("lastName", "اسم العائلة")}
        {text("firstNameEn", "الاسم الأول بالإنجليزية", { dir: "ltr" })}
        {text("lastNameEn", "اسم العائلة بالإنجليزية", { dir: "ltr" })}
        <Field label="البريد الإلكتروني" htmlFor="info-email" hint={canEditEmail ? "تغيير البريد غير متاح من هذه الشاشة بعد." : "يغيّره مدير النظام فقط."}>
          <Input id="info-email" value={email ?? ""} dir="ltr" disabled className="min-h-[44px] sm:min-h-9" />
        </Field>
        {text("phoneNumber", "الجوال", { dir: "ltr", error: phoneError(info.phoneNumber) })}
        {text("jobTitle", "المسمى الوظيفي")}
        {text("department", "القسم")}
      </div>
    </div>
  );
}

export function SecuritySection({ canReset, isSelf, onReset }: { canReset: boolean; isSelf: boolean; onReset: () => void }) {
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3.5">
        <div>
          <h3 className="text-sm font-semibold">كلمة المرور</h3>
          <p className="text-[12.5px] text-muted-foreground">
            {isSelf ? "لا يمكنك إعادة تعيين كلمة مرورك من هنا؛ استخدم صفحة حسابك." : "تعيين كلمة مرور جديدة ينهي كل جلساته الحالية."}
          </p>
        </div>
        <Button variant="outline" className="min-h-[44px] sm:min-h-9" disabled={!canReset || isSelf} onClick={onReset}>
          إعادة تعيين كلمة المرور
        </Button>
      </div>
    </div>
  );
}

