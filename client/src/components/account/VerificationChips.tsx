// شرائح توثيق البريد والجوال لصفوف قوائم الإدارة (الكتّاب، المراسلون، المنسوبون).
// أخضر = موثّق، كهرماني = موجود غير موثّق، رمادي = غير مُضاف.
// تُستخدم مع VerificationSummary لعدّ الموثّقين أعلى القائمة.

import { BadgeCheck, Mail, Phone } from "lucide-react";
import { hasRealEmail } from "@shared/authEmail";
import { cn } from "@/lib/utils";

export type VerifiableUser = {
  email?: string | null;
  emailVerified?: boolean | null;
  phoneNumber?: string | null;
  phoneVerified?: boolean | null;
};

type ChipState = "verified" | "unverified" | "missing";

function emailState(u: VerifiableUser): ChipState {
  if (!hasRealEmail(u.email)) return "missing";
  return u.emailVerified ? "verified" : "unverified";
}

function phoneState(u: VerifiableUser): ChipState {
  if (!u.phoneNumber) return "missing";
  return u.phoneVerified ? "verified" : "unverified";
}

const CHIP_CLASS: Record<ChipState, string> = {
  verified: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  unverified: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  missing: "border-border bg-muted/40 text-muted-foreground",
};

const EMAIL_TITLE: Record<ChipState, string> = {
  verified: "البريد موثّق",
  unverified: "البريد مُضاف لكنه غير موثّق",
  missing: "لا يوجد بريد إلكتروني حقيقي",
};

const PHONE_TITLE: Record<ChipState, string> = {
  verified: "الجوال موثّق — يستطيع الدخول بالجوال",
  unverified: "الجوال مُضاف لكنه غير موثّق",
  missing: "لم يُضف رقم جوال بعد",
};

const LABEL: Record<ChipState, string> = {
  verified: "موثّق",
  unverified: "غير موثّق",
  missing: "غير مُضاف",
};

function Chip({
  icon,
  state,
  title,
  testId,
}: {
  icon: React.ReactNode;
  state: ChipState;
  title: string;
  testId?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4",
        CHIP_CLASS[state],
      )}
      data-testid={testId}
      data-state={state}
    >
      {icon}
      {state === "verified" ? <BadgeCheck className="h-3 w-3" /> : null}
      {LABEL[state]}
    </span>
  );
}

export function VerificationChips({ user, idForTest }: { user: VerifiableUser; idForTest?: string }) {
  const e = emailState(user);
  const p = phoneState(user);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Chip icon={<Mail className="h-3 w-3" />} state={e} title={EMAIL_TITLE[e]} testId={idForTest ? `chip-email-${idForTest}` : undefined} />
      <Chip icon={<Phone className="h-3 w-3" />} state={p} title={PHONE_TITLE[p]} testId={idForTest ? `chip-phone-${idForTest}` : undefined} />
    </span>
  );
}

/** سطر عدّ مختصر: «الجوال موثّق 12/24 · البريد موثّق 20/24». */
export function VerificationSummary({ users, className }: { users: VerifiableUser[]; className?: string }) {
  const total = users.length;
  if (total === 0) return null;
  const phone = users.filter((u) => phoneState(u) === "verified").length;
  const email = users.filter((u) => emailState(u) === "verified").length;
  const fmt = (n: number) => n.toLocaleString("en-US");
  return (
    <p className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground", className)} data-testid="text-verification-summary">
      <span className="inline-flex items-center gap-1">
        <Phone className="h-3.5 w-3.5" />
        الجوال موثّق <b className="tabular-nums text-foreground">{fmt(phone)}/{fmt(total)}</b>
      </span>
      <span className="opacity-40">·</span>
      <span className="inline-flex items-center gap-1">
        <Mail className="h-3.5 w-3.5" />
        البريد موثّق <b className="tabular-nums text-foreground">{fmt(email)}/{fmt(total)}</b>
      </span>
      {phone < total && (
        <span className="text-amber-700 dark:text-amber-300">
          ({fmt(total - phone)} لم يوثّقوا جوالهم بعد)
        </span>
      )}
    </p>
  );
}
