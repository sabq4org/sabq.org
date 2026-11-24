// «حسابي» داخل «ملفي وخدماتي» (المرحلة 3): يحل محل صفحة «الملف الشخصي» للكاتب والمراسل.
// الصورة والاسم والبريد والجوال وكلمة المرور، ثم أدواري وسجل نشاطي صفوفًا تنفتح في مكانها.

import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, ChevronDown, Loader2, Lock } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneVerificationCard, formatSaudiPhoneForDisplay } from "@/components/account/PhoneVerificationCard";
import { WriterSurface } from "@/components/writer/WriterPageFrame";
import { formatWhen } from "@/components/writer/PublicBylineEditor";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getActionPresentation, getEntityTypeLabel } from "@/lib/activityUtils";
import { cn } from "@/lib/utils";
import { hasRealEmail } from "@shared/authEmail";

export type WriterAccountUser = {
  id: string;
  email?: string | null;
  emailVerified?: boolean | null;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumber?: string | null;
  phoneVerified?: boolean | null;
  profileImageUrl?: string | null;
  roleLabel?: string | null;
};

const CHIP = {
  ok: "bg-[#E8F6EF] text-[#13734E] dark:bg-emerald-950/40 dark:text-emerald-300",
  wait: "bg-[#FFF6E5] text-[#946000] dark:bg-amber-950/40 dark:text-amber-300",
  info: "bg-[#E6F4FD] text-[#0B6FA8] dark:bg-sky-950/40 dark:text-sky-300",
} as const;

function Chip({ tone, children }: { tone: keyof typeof CHIP; children: ReactNode }) {
  return <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", CHIP[tone])}>{children}</span>;
}

export function writerDisplayName(user: WriterAccountUser | null | undefined): string {
  const name = [user?.firstName, user?.lastName].filter((p) => p && p.trim()).join(" ").trim();
  return name || "حسابي";
}

function initials(user: WriterAccountUser): string {
  const first = user.firstName?.trim()?.[0];
  const last = user.lastName?.trim()?.[0];
  if (first && last) return `${first}${last}`;
  return first || user.email?.[0]?.toUpperCase() || "س";
}

/** الصورة والاسم والصفة في رأس الصفحة. */
export function WriterIdentityStrip({ user, title, roleLabel }: { user: WriterAccountUser; title: string | null; roleLabel: string }) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "اختر صورة", description: "الملف المختار ليس صورة", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "الصورة كبيرة", description: "الحد الأعلى 5 ميجابايت", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("entityType", "profile-avatar");
      const uploaded = (await apiRequest("/api/media/upload", { method: "POST", body: form, isFormData: true })) as { url: string };
      await apiRequest("/api/profile/image", { method: "PUT", body: JSON.stringify({ profileImageUrl: uploaded.url }) });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "تم تحديث صورتك" });
    } catch (error) {
      toast({
        title: "تعذر حفظ الصورة",
        description: error instanceof Error ? error.message : "حاول مرة أخرى",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <WriterSurface className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-7" >
      <div className="flex items-center gap-4 sm:flex-1 sm:gap-6">
        <div className="relative h-[72px] w-[72px] shrink-0 sm:h-[84px] sm:w-[84px]">
          <Avatar className="h-full w-full">
            {user.profileImageUrl && <AvatarImage src={user.profileImageUrl} alt={writerDisplayName(user)} className="object-cover" />}
            <AvatarFallback className="bg-[#DDEFFC] text-2xl font-bold text-[#0B6FA8]">{initials(user)}</AvatarFallback>
          </Avatar>
          <label
            className="absolute bottom-0 left-0 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-card shadow-[0_1px_6px_rgba(27,43,58,0.18)]"
            aria-label="تغيير الصورة"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin text-[#1E9BE6]" /> : <Camera className="h-4 w-4 text-[#1E9BE6]" />}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onFile} disabled={uploading} data-testid="input-writer-avatar" />
          </label>
        </div>
        <div className="min-w-0 space-y-1">
          <p className="truncate text-[22px] font-bold" data-testid="text-writer-name">{writerDisplayName(user)}</p>
          {title && <p className="text-[15px] text-[#55667A] dark:text-muted-foreground">{title}</p>}
          <div className="flex flex-wrap gap-2 pt-0.5">
            <Chip tone="info">{roleLabel}</Chip>
          </div>
        </div>
      </div>
      <p className="text-[13px] text-[#617183] dark:text-muted-foreground sm:max-w-[220px] sm:text-start">
        الصورة تظهر بجانب اسمك في كل مقال. اضغط على الكاميرا لتغييرها.
      </p>
    </WriterSurface>
  );
}

type RowProps = {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  trailing?: ReactNode;
  open?: boolean;
  onToggle?: () => void;
  toggleLabel?: string;
  testId: string;
  children?: ReactNode;
};

function AccountRow({ label, value, sub, trailing, open, onToggle, toggleLabel, testId, children }: RowProps) {
  return (
    <div data-testid={testId}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 sm:flex-nowrap sm:px-6">
        <span className="w-full text-sm text-[#55667A] dark:text-muted-foreground sm:w-[130px] sm:shrink-0">{label}</span>
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="block break-words text-[15px] font-medium">{value}</span>
          {sub && <span className="block text-xs leading-5 text-[#617183] dark:text-muted-foreground">{sub}</span>}
        </span>
        {trailing}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="flex min-h-[44px] shrink-0 items-center gap-1 text-sm font-medium text-[#0B6FA8]"
          >
            {open ? "إغلاق" : toggleLabel}
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </button>
        )}
      </div>
      {open && children && <div className="px-5 pb-5 sm:px-6">{children}</div>}
    </div>
  );
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: () =>
      apiRequest("/api/account/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      }),
    onSuccess: () => {
      toast({ title: "تم تغيير كلمة المرور" });
      onDone();
    },
    onError: (err: Error) => setError(err.message || "تحقق من كلمة المرور الحالية"),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return setError("كلمة المرور الجديدة 8 أحرف على الأقل");
    if (next !== confirm) return setError("التأكيد لا يطابق الكلمة الجديدة");
    setError(null);
    change.mutate();
  };

  return (
    <form onSubmit={submit} className="grid max-w-[520px] gap-3" data-testid="form-writer-password">
      <Input type="password" autoComplete="current-password" placeholder="كلمة المرور الحالية" value={current} onChange={(e) => setCurrent(e.target.value)} className="h-11 rounded-full px-4" />
      <Input type="password" autoComplete="new-password" placeholder="كلمة المرور الجديدة" value={next} onChange={(e) => setNext(e.target.value)} className="h-11 rounded-full px-4" />
      <Input type="password" autoComplete="new-password" placeholder="تأكيد كلمة المرور الجديدة" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-11 rounded-full px-4" />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div>
        <Button type="submit" disabled={change.isPending || !current || !next} className="h-11 rounded-full bg-[#1E9BE6] px-6 hover:bg-[#1789CF]">
          {change.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          حفظ كلمة المرور
        </Button>
      </div>
    </form>
  );
}

/** مجموعة «حسابي»: بيانات الدخول والتواصل، لا تظهر للقراء. */
export function WriterAccountGroup({ user }: { user: WriterAccountUser }) {
  const { toast } = useToast();
  const [open, setOpen] = useState<"phone" | "password" | null>(null);
  const toggle = (k: "phone" | "password") => setOpen((cur) => (cur === k ? null : k));
  const realEmail = hasRealEmail(user.email ?? null);

  const resend = useMutation({
    mutationFn: () => apiRequest("/api/auth/resend-verification", { method: "POST" }),
    onSuccess: () => toast({ title: "أرسلنا رابط التوثيق", description: "افتح بريدك لإكمال التوثيق" }),
    onError: (e: Error) => toast({ title: "تعذر الإرسال", description: e.message, variant: "destructive" }),
  });

  return (
    <div id="account" className="scroll-mt-24 space-y-2.5">
      <div className="space-y-0.5">
        <h2 className="text-[17px] font-bold">حسابي</h2>
        <p className="text-[13px] text-[#617183] dark:text-muted-foreground">بيانات الدخول والتواصل. لا تظهر للقراء.</p>
      </div>
      <WriterSurface className="divide-y divide-[#EEF2F6] dark:divide-border">
        <AccountRow
          testId="account-row-name"
          label="الاسم"
          value={writerDisplayName(user)}
          sub="لتعديل الاسم راسل إدارة التحرير من «استفساراتي»."
          trailing={
            <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-[#617183] dark:text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              ثابت
            </span>
          }
        />
        <AccountRow
          testId="account-row-email"
          label="البريد"
          value={realEmail ? <span dir="ltr">{user.email}</span> : "لا يوجد بريد"}
          trailing={
            realEmail ? (
              user.emailVerified ? (
                <Chip tone="ok">موثّق</Chip>
              ) : (
                <span className="flex shrink-0 items-center gap-3">
                  <Chip tone="wait">غير موثّق</Chip>
                  <button type="button" onClick={() => resend.mutate()} disabled={resend.isPending} className="min-h-[44px] text-sm font-medium text-[#0B6FA8]">
                    أرسل رابط التوثيق
                  </button>
                </span>
              )
            ) : null
          }
        />
        <AccountRow
          testId="account-row-phone"
          label="الجوال"
          value={user.phoneNumber ? <span dir="ltr">{formatSaudiPhoneForDisplay(user.phoneNumber)}</span> : "لم يُضف بعد"}
          sub="نستخدمه للتنبيهات العاجلة عن مقالك فقط."
          trailing={user.phoneNumber ? <Chip tone={user.phoneVerified ? "ok" : "wait"}>{user.phoneVerified ? "موثّق" : "غير موثّق"}</Chip> : null}
          open={open === "phone"}
          onToggle={() => toggle("phone")}
          toggleLabel={user.phoneNumber ? (user.phoneVerified ? "تغيير" : "وثّق الآن") : "أضف رقمك"}
        >
          <PhoneVerificationCard
            variant="inline"
            phoneNumber={user.phoneNumber}
            phoneVerified={user.phoneVerified}
            testIdPrefix="writer-phone"
            onVerified={() => setOpen(null)}
          />
        </AccountRow>
        <AccountRow
          testId="account-row-password"
          label="كلمة المرور"
          value="••••••••"
          open={open === "password"}
          onToggle={() => toggle("password")}
          toggleLabel="تغيير"
        >
          <PasswordForm onDone={() => setOpen(null)} />
        </AccountRow>
      </WriterSurface>
    </div>
  );
}

type RolesResponse = {
  rbacRoles?: Array<{ roleId: string; roleName: string; roleDescription: string | null; assignedAt: string }>;
};

const ROLE_LABEL: Record<string, string> = {
  opinion_author: "كاتب رأي",
  reporter: "مراسل",
  angle_writer: "كاتب زاوية",
  reader: "قارئ",
};
const ROLE_DESC: Record<string, string> = {
  opinion_author: "تكتب مقالاتك وترسلها للمراجعة. النشر والجدولة بيد إدارة الرأي.",
  reporter: "تكتب أخبارك وترسلها للمراجعة. النشر بيد المحرر.",
};

export function roleLabelAr(name: string): string {
  return ROLE_LABEL[name] ?? name;
}

/** محتوى صف «أدواري». */
export function WriterRolesBody() {
  const { data } = useQuery<RolesResponse>({ queryKey: ["/api/profile/roles"] });
  const roles = (Array.isArray(data?.rbacRoles) ? data!.rbacRoles! : []).filter((r) => r.roleName !== "reader");
  if (roles.length === 0) return <p className="text-sm text-[#617183]">لا أدوار مسجلة.</p>;
  return (
    <ul className="space-y-3" data-testid="list-writer-roles">
      {roles.map((r) => (
        <li key={r.roleId} className="rounded-2xl bg-[#F4F7FB] px-4 py-3 dark:bg-muted/40">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold">{roleLabelAr(r.roleName)}</span>
            <span className="text-xs text-[#617183]">منذ {formatWhen(r.assignedAt).split("،")[0] || "—"}</span>
          </div>
          {(ROLE_DESC[r.roleName] || r.roleDescription) && (
            <p className="mt-1 text-sm leading-6 text-[#55667A] dark:text-muted-foreground">{ROLE_DESC[r.roleName] || r.roleDescription}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

type ActivityResponse = {
  logs?: Array<{ id: string; action: string; entityType: string; entityTitle: string | null; createdAt: string }>;
  totalPages?: number;
};

/** محتوى صف «سجل نشاطي»: آخر 15 عملية مع «المزيد». */
export function WriterActivityBody() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery<ActivityResponse>({
    queryKey: [`/api/profile/activity?page=${page}&limit=15`],
  });
  const logs = Array.isArray(data?.logs) ? data!.logs! : [];
  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-[#1E9BE6]" />;
  if (logs.length === 0) return <p className="text-sm text-[#617183]">لا نشاط بعد.</p>;
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-[#EEF2F6] rounded-2xl bg-[#F9FBFD] dark:divide-border dark:bg-muted/30" data-testid="list-writer-activity">
        {logs.map((log) => {
          const p = getActionPresentation(log.action, log.entityType);
          return (
            <li key={log.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
              <span className="text-sm font-medium">{p.label}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-[#55667A] dark:text-muted-foreground">
                {log.entityTitle || getEntityTypeLabel(log.entityType)}
              </span>
              <span className="text-xs text-[#617183]">{formatWhen(log.createdAt)}</span>
            </li>
          );
        })}
      </ul>
      {(data?.totalPages ?? 1) > 1 && (
        <div className="flex gap-4 text-sm font-medium text-[#0B6FA8]">
          {page > 1 && <button type="button" onClick={() => setPage(page - 1)} className="min-h-[44px]">الأحدث</button>}
          {page < (data?.totalPages ?? 1) && <button type="button" onClick={() => setPage(page + 1)} className="min-h-[44px]">الأقدم</button>}
        </div>
      )}
    </div>
  );
}
