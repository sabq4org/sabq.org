// ----------------------------------------------------------------------------
// بطاقة توثيق الجوال — المكوّن الوحيد الذي يُضيف/يغيّر رقم جوال الحساب.
//
// القاعدة: لا يُحفظ رقم إلا بعد رمز SMS يثبت الملكية (POST /api/account/phone/*).
// تُستخدم في: إعدادات الحساب، ملف المنسوب (self)، الملف الشخصي في اللوحة،
// والملف الإنجليزي. أي شاشة تعرض حقل جوال خام تُخالف هذه القاعدة وتنتج
// «نجاح كاذب» (حادثة 2026-09-18: الخادم يُسقط الرقم بصمت والواجهة تقول حُفظ).
//
// الخطوات: idle → editing (إدخال الرقم) → code (6 خانات، إرسال تلقائي عند
// اكتمالها، عدّاد إعادة إرسال) → idle. الأخطاء تظهر داخل البطاقة لا في
// toast عابر، لأن رسائل التعارض (رقم على منسوب/قارئ آخر) تحتاج قراءة.
// ----------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, BadgeCheck, Info, Loader2, Phone, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type Locale = "ar" | "en";

const STRINGS = {
  ar: {
    title: "رقم الجوال",
    description: "يُستخدم للدخول برقم الجوال واستعادة الحساب. لا يُحفظ أي رقم قبل تأكيده برمز SMS.",
    none: "لا يوجد رقم",
    verified: "موثّق",
    unverified: "غير موثّق",
    add: "إضافة رقم",
    change: "تغيير الرقم",
    phoneLabel: "رقم الجوال",
    phonePlaceholder: "05XXXXXXXX",
    send: "إرسال الرمز",
    cancel: "إلغاء",
    sentTo: "أدخل الرمز المرسل إلى",
    verify: "تأكيد",
    resend: "إعادة الإرسال",
    resendIn: (s: number) => `إعادة الإرسال خلال ${s} ث`,
    editNumber: "تعديل الرقم",
    otpAria: "رمز التحقق المكوّن من 6 أرقام",
    digitAria: (i: number) => `الرقم ${i} من 6`,
    sentTitle: "تم إرسال الرمز",
    sentBody: "أدخل رمز التحقق المرسل إلى جوالك",
    verifiedTitle: "تم التوثيق",
    verifiedBody: "أصبح رقم جوالك موثّقًا ومرتبطًا بحسابك هذا",
    sendFailed: "تعذّر إرسال الرمز",
    verifyFailed: "الرمز غير صحيح أو منتهي",
    rateLimited: "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.",
    unverifiedHint: "رقمك الحالي غير موثّق. وثّقه الآن ليعمل الدخول بالجوال على هذا الحساب.",
  },
  en: {
    title: "Phone number",
    description: "Used to sign in by phone and recover your account. Nothing is saved until you confirm the SMS code.",
    none: "No number",
    verified: "Verified",
    unverified: "Unverified",
    add: "Add number",
    change: "Change number",
    phoneLabel: "Phone number",
    phonePlaceholder: "05XXXXXXXX",
    send: "Send code",
    cancel: "Cancel",
    sentTo: "Enter the code sent to",
    verify: "Confirm",
    resend: "Resend",
    resendIn: (s: number) => `Resend in ${s}s`,
    editNumber: "Edit number",
    otpAria: "6-digit verification code",
    digitAria: (i: number) => `Digit ${i} of 6`,
    sentTitle: "Code sent",
    sentBody: "Enter the verification code sent to your phone",
    verifiedTitle: "Verified",
    verifiedBody: "Your phone number is now verified and linked to this account",
    sendFailed: "Could not send the code",
    verifyFailed: "The code is wrong or expired",
    rateLimited: "Too many attempts. Wait a moment and try again.",
    unverifiedHint: "Your current number is not verified. Verify it so phone sign-in opens this account.",
  },
} satisfies Record<Locale, unknown>;

/** صيغة العرض المحلية 05XXXXXXXX من أي صيغة مخزّنة. */
export function formatSaudiPhoneForDisplay(value?: string | null): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  const last9 = digits.slice(-9);
  return last9.startsWith("5") ? `0${last9}` : value;
}

function errorText(err: unknown, fallback: string, rateLimited: string): string {
  const msg = err instanceof Error ? err.message : "";
  if (!msg) return fallback;
  if (msg === "RATE_LIMITED") return rateLimited;
  // apiRequest يرمي `${status}: ${body}` حين لا تحمل الاستجابة message
  if (/^\d{3}:\s/.test(msg)) return fallback;
  return msg;
}

type SendResponse = {
  message?: string;
  retryAfterSeconds?: number;
  willTransfer?: boolean;
  notice?: string;
};

type VerifyResponse = {
  message?: string;
  phoneNumber?: string;
  transferred?: { fromUserId: string; retired: boolean } | null;
};

export type PhoneVerificationCardProps = {
  phoneNumber?: string | null;
  phoneVerified?: boolean | null;
  /** card: بطاقة كاملة بعنوان ووصف. inline: كتلة مجرّدة داخل نموذج آخر. */
  variant?: "card" | "inline";
  locale?: Locale;
  /** يُستدعى بعد نجاح التوثيق (إضافة إلى إبطال /api/auth/user المدمج). */
  onVerified?: (result: VerifyResponse) => void;
  testIdPrefix?: string;
  className?: string;
};

export function PhoneVerificationCard({
  phoneNumber,
  phoneVerified,
  variant = "card",
  locale = "ar",
  onVerified,
  testIdPrefix = "account-phone",
  className,
}: PhoneVerificationCardProps) {
  const t = STRINGS[locale];
  const { toast } = useToast();

  const [step, setStep] = useState<"idle" | "editing" | "code">("idle");
  const [draft, setDraft] = useState("");
  const [code, setCode] = useState("");
  const [resend, setResend] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  const draftDigits = draft.replace(/\D/g, "");
  const draftValid = draftDigits.length >= 9;
  const hasNumber = Boolean(phoneNumber);

  useEffect(() => {
    if (resend <= 0) return;
    const timer = setInterval(() => setResend((r) => (r <= 1 ? 0 : r - 1)), 1000);
    return () => clearInterval(timer);
  }, [resend > 0]);

  useEffect(() => {
    if (step === "editing") phoneInputRef.current?.focus();
    if (step === "code") otpRefs.current[0]?.focus();
  }, [step]);

  const sendCode = useMutation({
    mutationFn: async () =>
      apiRequest<SendResponse>("/api/account/phone/send", {
        method: "POST",
        body: JSON.stringify({ phone: draft }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (data) => {
      setError(null);
      setCode("");
      setNotice(data?.notice ?? null);
      setStep("code");
      setResend(Math.max(60, data?.retryAfterSeconds ?? 0));
      toast({ title: t.sentTitle, description: t.sentBody });
    },
    onError: (err: unknown) => {
      setError(errorText(err, t.sendFailed, t.rateLimited));
    },
  });

  const verifyCode = useMutation({
    mutationFn: async (value: string) =>
      apiRequest<VerifyResponse>("/api/account/phone/verify", {
        method: "POST",
        body: JSON.stringify({ phone: draft, code: value }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      onVerified?.(data ?? {});
      setStep("idle");
      setDraft("");
      setCode("");
      setNotice(null);
      setError(null);
      toast({ title: t.verifiedTitle, description: data?.message || t.verifiedBody });
    },
    onError: (err: unknown) => {
      setError(errorText(err, t.verifyFailed, t.rateLimited));
      setCode("");
      otpRefs.current[0]?.focus();
    },
  });

  // إرسال تلقائي عند اكتمال الخانات الست
  useEffect(() => {
    if (step === "code" && code.length === 6 && !verifyCode.isPending) {
      verifyCode.mutate(code);
    }
  }, [code, step]);

  const startEditing = () => {
    setDraft("");
    setCode("");
    setError(null);
    setNotice(null);
    setStep("editing");
  };

  const reset = () => {
    setStep("idle");
    setDraft("");
    setCode("");
    setError(null);
    setNotice(null);
  };

  const handleOtpChange = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
      setCode((prev) => prev.slice(0, index));
      return;
    }
    // لصق/تعبئة تلقائية للرمز كاملًا في أي خانة
    if (digits.length > 1) {
      const next = digits.slice(0, 6);
      setCode(next);
      otpRefs.current[Math.min(next.length, 5)]?.focus();
      return;
    }
    setCode((prev) => {
      const arr = prev.slice(0, 6).split("");
      arr[index] = digits;
      return arr.join("").slice(0, index + 1);
    });
    otpRefs.current[Math.min(index + 1, 5)]?.focus();
  };

  const handleOtpKey = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      e.preventDefault();
      setCode((prev) => prev.slice(0, index - 1));
      otpRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      otpRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const busy = sendCode.isPending || verifyCode.isPending;

  const body = (
    <div className={cn("space-y-3", variant === "inline" && className)}>
      {/* الحالة الحالية */}
      <div className="flex flex-wrap items-center gap-2">
        <span dir="ltr" className="text-sm font-medium tabular-nums" data-testid={`text-${testIdPrefix}-current`}>
          {hasNumber ? formatSaudiPhoneForDisplay(phoneNumber) : t.none}
        </span>
        {hasNumber ? (
          phoneVerified ? (
            <Badge
              variant="secondary"
              className="gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              data-testid={`badge-${testIdPrefix}-verified`}
            >
              <BadgeCheck className="h-3.5 w-3.5" /> {t.verified}
            </Badge>
          ) : (
            <Badge
              variant="secondary"
              className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
              data-testid={`badge-${testIdPrefix}-unverified`}
            >
              {t.unverified}
            </Badge>
          )
        ) : null}
        {step === "idle" && (
          <Button
            type="button"
            variant={hasNumber && phoneVerified ? "outline" : "default"}
            size="sm"
            className="ms-auto gap-1.5"
            onClick={startEditing}
            data-testid={`button-${testIdPrefix}-edit`}
          >
            <Phone className="h-3.5 w-3.5" />
            {hasNumber ? t.change : t.add}
          </Button>
        )}
      </div>

      {step === "idle" && hasNumber && !phoneVerified && (
        <p className="text-xs text-amber-700 dark:text-amber-300">{t.unverifiedHint}</p>
      )}

      {/* الخطوة 1: الرقم */}
      {step === "editing" && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <label htmlFor={`${testIdPrefix}-input`} className="text-sm font-medium">
            {t.phoneLabel}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id={`${testIdPrefix}-input`}
              ref={phoneInputRef}
              dir="ltr"
              className="min-w-[11rem] flex-1 text-left tracking-wider"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder={t.phonePlaceholder}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draftValid && !busy) {
                  e.preventDefault();
                  sendCode.mutate();
                }
              }}
              disabled={busy}
              data-testid={`input-${testIdPrefix}`}
            />
            <Button
              type="button"
              onClick={() => sendCode.mutate()}
              disabled={busy || !draftValid}
              className="gap-2"
              data-testid={`button-${testIdPrefix}-send`}
            >
              {sendCode.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
              {t.send}
            </Button>
            <Button type="button" variant="ghost" onClick={reset} disabled={busy} data-testid={`button-${testIdPrefix}-cancel`}>
              {t.cancel}
            </Button>
          </div>
        </div>
      )}

      {/* الخطوة 2: الرمز */}
      {step === "code" && (
        <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
          <p className="text-sm text-muted-foreground">
            {t.sentTo}{" "}
            <span dir="ltr" className="font-medium text-foreground">
              {formatSaudiPhoneForDisplay(draft)}
            </span>
            <button
              type="button"
              onClick={() => {
                setStep("editing");
                setCode("");
                setError(null);
              }}
              className="ms-2 text-xs text-primary hover:underline"
              data-testid={`button-${testIdPrefix}-edit-number`}
            >
              {t.editNumber}
            </button>
          </p>

          {notice && (
            <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 p-2.5 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <div dir="ltr" className="grid w-full max-w-[17rem] grid-cols-6 gap-1.5 sm:gap-2" aria-label={t.otpAria}>
              {Array.from({ length: 6 }).map((_, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    otpRefs.current[i] = el;
                  }}
                  inputMode="numeric"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  maxLength={i === 0 ? 6 : 1}
                  value={code[i] ?? ""}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKey(i, e)}
                  onFocus={(e) => e.target.select()}
                  disabled={verifyCode.isPending}
                  aria-label={t.digitAria(i + 1)}
                  data-testid={`input-${testIdPrefix}-otp-${i}`}
                  className="h-11 w-full min-w-0 rounded-lg border-2 border-input bg-background text-center text-lg font-bold outline-none transition focus:border-ring focus:ring-2 focus:ring-ring disabled:opacity-60 sm:h-12"
                />
              ))}
            </div>
            <Button
              type="button"
              onClick={() => verifyCode.mutate(code)}
              disabled={verifyCode.isPending || code.length !== 6}
              className="gap-2"
              data-testid={`button-${testIdPrefix}-verify`}
            >
              {verifyCode.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {t.verify}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            {resend > 0 ? (
              <span className="text-muted-foreground tabular-nums">{t.resendIn(resend)}</span>
            ) : (
              <button
                type="button"
                onClick={() => sendCode.mutate()}
                disabled={sendCode.isPending}
                className="font-medium text-primary hover:underline disabled:opacity-60"
                data-testid={`button-${testIdPrefix}-resend`}
              >
                {t.resend}
              </button>
            )}
            <button type="button" onClick={reset} className="text-muted-foreground hover:underline" disabled={busy}>
              {t.cancel}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-sm text-destructive"
          data-testid={`text-${testIdPrefix}-error`}
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );

  if (variant === "inline") return body;

  return (
    <Card className={className} data-testid={`card-${testIdPrefix}`}>
      <CardHeader>
        <CardTitle className="inline-flex items-center gap-2">
          <Phone className="h-5 w-5" />
          {t.title}
        </CardTitle>
        <CardDescription>{t.description}</CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
