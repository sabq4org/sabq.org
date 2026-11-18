// رابط تسجيل الناشرين العام (/publisher/register) — النموذج المعتمد 2026-11-18:
// https://claude.ai/artifact/JS7f3BUNPNyyz8eNxR8ShB
// الطلب يذهب لمراجعة فريق سبق؛ عند القبول تصل بيانات الدخول إلى بريد الدخول.
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import sabqLogo from "@assets/sabq-logo.png";
import { apiUrl } from "@/lib/queryClient";
import {
  PUBLISHER_LOGO_ACCEPT,
  publisherApplicationSchema,
  publisherLogoProblem,
} from "@shared/publisherApplications";
import { Check, CircleAlert, Loader2, Lock, Upload } from "lucide-react";

type Fields = {
  agencyName: string;
  agencyNameEn: string;
  contactPerson: string;
  contactPersonEn: string;
  email: string;
  phoneNumber: string;
  commercialRegistration: string;
  taxNumber: string;
  address: string;
  loginFirstName: string;
  loginLastName: string;
  loginEmail: string;
};

const EMPTY: Fields = {
  agencyName: "",
  agencyNameEn: "",
  contactPerson: "",
  contactPersonEn: "",
  email: "",
  phoneNumber: "",
  commercialRegistration: "",
  taxNumber: "",
  address: "",
  loginFirstName: "",
  loginLastName: "",
  loginEmail: "",
};

const REQUIRED: Array<keyof Fields> = [
  "agencyName",
  "contactPerson",
  "email",
  "phoneNumber",
  "loginFirstName",
  "loginLastName",
  "loginEmail",
];

type Done = { reference: string; email: string; loginEmail: string };

const inputCls =
  "h-[46px] w-full min-w-0 rounded-[14px] border border-[#DCE4EC] bg-white px-3.5 text-[15px] text-[#1B2B3A] outline-none transition focus:border-[#1E9BE6] focus:ring-4 focus:ring-[#1E9BE6]/15";
const sectionCls = "flex flex-col gap-4 rounded-[22px] bg-white p-5 shadow-[0_2px_12px_rgba(27,43,58,.06)] sm:px-7 sm:py-6";

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium text-[#1B2B3A]">
      {label}
      {children}
      {error ? <span className="text-[13px] font-normal text-[#BF3038]">{error}</span> : null}
    </label>
  );
}

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function PublisherRegister() {
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Fields | "logo" | "consent", string>>>({});
  const [consent, setConsent] = useState(false);
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoDims, setLogoDims] = useState<string | null>(null);
  const [loginEmailTouched, setLoginEmailTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "تسجيل ناشر | سبق";
  }, []);

  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  const set = (key: keyof Fields) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setFields((prev) => {
      const next = { ...prev, [key]: value };
      // بريد الدخول يتبع البريد العام حتى يغيّره المتقدم.
      if (key === "email" && !loginEmailTouched) next.loginEmail = value;
      return next;
    });
    if (key === "loginEmail") setLoginEmailTouched(true);
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const pickLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;
    const problem = publisherLogoProblem(file);
    if (problem) {
      setErrors((prev) => ({ ...prev, logo: problem }));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth < 64 || img.naturalHeight < 64) {
        URL.revokeObjectURL(url);
        setErrors((prev) => ({ ...prev, logo: "الشعار صغير جدًا. ارفع صورة لا تقل عن 64×64 بكسل." }));
        return;
      }
      setLogo(file);
      setLogoPreview(url);
      setLogoDims(`${img.naturalWidth}×${img.naturalHeight}`);
      setErrors((prev) => ({ ...prev, logo: undefined }));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setErrors((prev) => ({ ...prev, logo: "تعذر قراءة الصورة. جرّب ملفًا آخر." }));
    };
    img.src = url;
  };

  const removeLogo = () => {
    setLogo(null);
    setLogoPreview(null);
    setLogoDims(null);
  };

  const filledRequired = useMemo(
    () => REQUIRED.filter((k) => fields[k].trim()).length + (logo ? 1 : 0),
    [fields, logo],
  );
  const requiredTotal = REQUIRED.length + 1;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const parsed = publisherApplicationSchema.safeParse({ ...fields, consent });
    const nextErrors: typeof errors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof typeof errors;
        if (key && !nextErrors[key]) nextErrors[key] = issue.message;
      }
    }
    for (const k of REQUIRED) if (!fields[k].trim()) nextErrors[k] = "هذا الحقل مطلوب";
    if (!logo) nextErrors.logo = errors.logo || "شعار الوكالة مطلوب";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      const first = document.querySelector("[data-field-error='true']");
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const body = new FormData();
    for (const [k, v] of Object.entries(fields)) if (v.trim()) body.append(k, v.trim());
    body.append("consent", "true");
    body.append("logo", logo as File);

    setSubmitting(true);
    try {
      const res = await fetch(apiUrl("/api/publisher-applications"), { method: "POST", body, credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.field) setErrors((prev) => ({ ...prev, [data.field]: data.message }));
        setFormError(data?.message || "تعذر إرسال الطلب. حاول مرة أخرى.");
        return;
      }
      setDone({ reference: data.reference, email: data.email, loginEmail: data.loginEmail });
      window.scrollTo({ top: 0 });
    } catch {
      setFormError("تعذر الاتصال. تحقق من الإنترنت وحاول مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  };

  const header = (
    <header className="flex h-14 items-center justify-between border-b border-[#EEF2F6] bg-white px-5 sm:h-[68px] sm:px-16">
      <a href="/" className="flex items-center gap-2.5 no-underline">
        <img src={sabqLogo} alt="سبق" className="h-8 w-auto sm:h-10" />
        <span className="hidden text-[13px] text-[#55667A] sm:inline">بوابة الناشرين</span>
      </a>
      <a href="/login" className="text-[13px] text-[#0B6FA8] no-underline hover:underline sm:text-sm">
        لديك حساب؟ سجّل الدخول
      </a>
    </header>
  );

  if (done) {
    return (
      <div dir="rtl" className="min-h-screen bg-[#F4F7FB] text-[#1B2B3A]">
        {header}
        <main className="mx-auto flex max-w-[460px] flex-col gap-4 px-5 pb-16 pt-10" data-testid="publisher-register-done">
          <div className="flex flex-col items-center gap-3 rounded-[22px] border border-white bg-gradient-to-br from-[#E2F2FD] to-[#EEF1FE] px-6 py-7 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-white shadow-[0_4px_12px_rgba(27,43,58,.06)]">
              <Check className="h-8 w-8 text-[#1E9BE6]" strokeWidth={2.6} />
            </div>
            <h1 className="m-0 text-2xl font-bold">وصلنا طلبك</h1>
            <p className="m-0 text-sm text-[#55667A]">
              أرسلنا تأكيدًا إلى <span dir="ltr">{done.email}</span>
            </p>
            <span className="rounded-full bg-white px-3.5 py-1.5 text-[13px] text-[#55667A]">
              رقم الطلب{" "}
              <span dir="ltr" className="font-semibold text-[#1B2B3A]">
                {done.reference}
              </span>
            </span>
          </div>
          <span className="px-1 text-[13px] text-[#55667A]">ماذا بعد؟</span>
          <ol className="m-0 list-none rounded-[22px] bg-white px-[18px] py-1 shadow-[0_2px_12px_rgba(27,43,58,.06)]">
            {[
              { n: 1, t: "استلمنا الطلب والشعار", s: "الآن", c: "bg-[#E8F6EF] text-[#13734E]" },
              { n: 2, t: "يراجعه فريق سبق", s: "خلال يومي عمل عادةً", c: "bg-[#FFF6E5] text-[#946000]" },
              { n: 3, t: "تصلك بيانات الدخول", s: done.loginEmail, c: "bg-[#E6F4FD] text-[#0B6FA8]" },
            ].map((step, i) => (
              <li key={step.n} className={`flex items-center gap-3 py-3.5 ${i < 2 ? "border-b border-[#EEF2F6]" : ""}`}>
                <span className={`flex h-[34px] w-[34px] items-center justify-center rounded-[11px] text-sm font-bold ${step.c}`}>
                  {step.n}
                </span>
                <span className="flex flex-col">
                  <span className="text-[15px] font-semibold">{step.t}</span>
                  <span className="text-xs text-[#617183]" dir={step.n === 3 ? "ltr" : undefined}>
                    {step.s}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <a href="/" className="mt-1.5 self-center text-sm text-[#0B6FA8] no-underline hover:underline">
            العودة إلى سبق
          </a>
        </main>
      </div>
    );
  }

  const err = (k: keyof typeof errors) => errors[k];
  const agencyLabel = fields.agencyName.trim() || "اسم وكالتك";

  return (
    <div dir="rtl" className="min-h-screen bg-[#F4F7FB] text-[#1B2B3A]">
      {header}
      <div className="mx-auto max-w-[1280px] px-4 pb-16 sm:px-16">
        <div className="flex flex-col gap-2 px-1 pt-6 sm:pt-11">
          <span className="text-[13px] text-[#55667A]">للوكالات والجهات الإعلامية</span>
          <h1 className="m-0 text-[26px] font-bold sm:text-[32px]">سجّل وكالتك ناشرًا في سبق</h1>
          <p className="m-0 max-w-[640px] text-sm text-[#55667A] sm:text-[15px]">
            املأ بيانات الوكالة وارفع شعارها. يراجع فريق سبق الطلب، وعند الموافقة تصلك بيانات الدخول إلى بريدك.
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            {["تقديم الطلب", "مراجعة فريق سبق", "بيانات الدخول في بريدك"].map((label, i) => (
              <span
                key={label}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm ${
                  i === 0
                    ? "bg-[#1E9BE6] font-semibold text-white shadow-[0_6px_16px_rgba(30,155,230,.3)]"
                    : "bg-white text-[#55667A] shadow-[0_2px_8px_rgba(27,43,58,.06)]"
                }`}
              >
                <span
                  className={`flex h-[22px] w-[22px] items-center justify-center rounded-full text-xs ${
                    i === 0 ? "bg-white/25" : "bg-[#E6F4FD] text-[#0B6FA8]"
                  }`}
                >
                  {i + 1}
                </span>
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-col items-start gap-7 lg:flex-row">
          <form onSubmit={submit} noValidate className="flex w-full min-w-0 flex-1 flex-col gap-[18px]" data-testid="publisher-register-form">
            <section className={sectionCls}>
              <h2 className="m-0 text-[17px] font-semibold">الوكالة</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div data-field-error={!!err("agencyName")}>
                  <Field label="اسم الوكالة (عربي) *" error={err("agencyName")}>
                    <input className={inputCls} value={fields.agencyName} onChange={set("agencyName")} name="agencyName" autoComplete="organization" data-testid="input-agency-name" />
                  </Field>
                </div>
                <Field label="اسم الوكالة (إنجليزي)" error={err("agencyNameEn")}>
                  <input className={`${inputCls} text-left`} dir="ltr" value={fields.agencyNameEn} onChange={set("agencyNameEn")} name="agencyNameEn" />
                </Field>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch" data-field-error={!!err("logo")}>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className={`flex h-[150px] w-full shrink-0 items-center justify-center overflow-hidden rounded-[18px] border-[1.5px] border-dashed bg-[#F5FAFE] sm:w-[150px] ${
                    err("logo") ? "border-[#E8A1A6]" : "border-[#9CCFEF]"
                  }`}
                  aria-label={logo ? "تغيير الشعار" : "اختيار شعار الوكالة"}
                  data-testid="button-logo-pick"
                >
                  {logoPreview ? (
                    <img src={logoPreview} alt="معاينة الشعار" className="max-h-[126px] max-w-[126px] object-contain" data-testid="img-logo-preview" />
                  ) : (
                    <span className="flex flex-col items-center gap-2 text-[#0B6FA8]">
                      <Upload className="h-9 w-9 text-[#1E9BE6]" strokeWidth={1.8} />
                      <span className="text-sm font-semibold">اختر الشعار</span>
                    </span>
                  )}
                </button>
                <div className="flex flex-1 flex-col justify-center gap-2">
                  <span className="text-sm font-medium">شعار الوكالة *</span>
                  {logo ? (
                    <span className="flex items-center gap-2 self-start rounded-full bg-[#E8F6EF] px-3 py-1.5 text-[13px] text-[#13734E]" dir="ltr">
                      <Check className="h-3.5 w-3.5" strokeWidth={2.6} />
                      {logo.name} · {formatSize(logo.size)}
                      {logoDims ? ` · ${logoDims}` : ""}
                    </span>
                  ) : null}
                  <span className="text-[13px] text-[#55667A]">JPG أو PNG أو WebP حتى 10 ميجا. الأفضل خلفية شفافة ومقاس مربع.</span>
                  {err("logo") ? (
                    <span className="flex items-start gap-2 rounded-[14px] bg-[#FDECEC] px-3 py-2.5 text-[13px] text-[#BF3038]" role="alert" data-testid="text-logo-error">
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      {err("logo")}
                    </span>
                  ) : null}
                  <div className="mt-1 flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="h-10 rounded-full bg-[#E6F4FD] px-[18px] text-sm font-semibold text-[#0B6FA8]"
                    >
                      {logo ? "تغيير الشعار" : "اختيار ملف"}
                    </button>
                    {logo ? (
                      <button type="button" onClick={removeLogo} className="h-10 rounded-full px-3 text-sm text-[#BF3038]">
                        إزالة
                      </button>
                    ) : null}
                  </div>
                  <input ref={fileRef} type="file" accept={PUBLISHER_LOGO_ACCEPT} className="hidden" onChange={pickLogo} data-testid="input-logo" />
                </div>
              </div>
            </section>

            <section className={sectionCls}>
              <h2 className="m-0 text-[17px] font-semibold">التواصل</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div data-field-error={!!err("contactPerson")}>
                  <Field label="الشخص المسؤول (عربي) *" error={err("contactPerson")}>
                    <input className={inputCls} value={fields.contactPerson} onChange={set("contactPerson")} name="contactPerson" autoComplete="name" />
                  </Field>
                </div>
                <Field label="الشخص المسؤول (إنجليزي)" error={err("contactPersonEn")}>
                  <input className={`${inputCls} text-left`} dir="ltr" value={fields.contactPersonEn} onChange={set("contactPersonEn")} name="contactPersonEn" />
                </Field>
                <div data-field-error={!!err("email")}>
                  <Field label="البريد الإلكتروني *" error={err("email")}>
                    <input className={`${inputCls} text-left`} dir="ltr" type="email" value={fields.email} onChange={set("email")} name="email" autoComplete="email" />
                  </Field>
                </div>
                <div data-field-error={!!err("phoneNumber")}>
                  <Field label="رقم الجوال *" error={err("phoneNumber")}>
                    <input className={`${inputCls} text-left`} dir="ltr" type="tel" inputMode="tel" placeholder="+966 5x xxx xxxx" value={fields.phoneNumber} onChange={set("phoneNumber")} name="phoneNumber" autoComplete="tel" />
                  </Field>
                </div>
              </div>
            </section>

            <section className={sectionCls}>
              <div className="flex items-baseline gap-2">
                <h2 className="m-0 text-[17px] font-semibold">البيانات التجارية</h2>
                <span className="text-[13px] text-[#55667A]">اختيارية</span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="السجل التجاري" error={err("commercialRegistration")}>
                  <input className={`${inputCls} text-left`} dir="ltr" inputMode="numeric" value={fields.commercialRegistration} onChange={set("commercialRegistration")} name="commercialRegistration" />
                </Field>
                <Field label="الرقم الضريبي" error={err("taxNumber")}>
                  <input className={`${inputCls} text-left`} dir="ltr" inputMode="numeric" value={fields.taxNumber} onChange={set("taxNumber")} name="taxNumber" />
                </Field>
              </div>
              <Field label="العنوان" error={err("address")}>
                <textarea className={`${inputCls} h-[76px] resize-none py-3`} value={fields.address} onChange={set("address")} name="address" />
              </Field>
            </section>

            <section className={sectionCls}>
              <div className="flex flex-col gap-1">
                <h2 className="m-0 text-[17px] font-semibold">حساب الدخول</h2>
                <span className="text-[13px] text-[#55667A]">الشخص الذي سيدخل لوحة الوكالة وينشر منها.</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
                <div data-field-error={!!err("loginFirstName")}>
                  <Field label="الاسم الأول *" error={err("loginFirstName")}>
                    <input className={inputCls} value={fields.loginFirstName} onChange={set("loginFirstName")} name="loginFirstName" autoComplete="given-name" />
                  </Field>
                </div>
                <div data-field-error={!!err("loginLastName")}>
                  <Field label="اسم العائلة *" error={err("loginLastName")}>
                    <input className={inputCls} value={fields.loginLastName} onChange={set("loginLastName")} name="loginLastName" autoComplete="family-name" />
                  </Field>
                </div>
              </div>
              <div data-field-error={!!err("loginEmail")}>
                <Field label="بريد تسجيل الدخول *" error={err("loginEmail")}>
                  <input className={`${inputCls} text-left`} dir="ltr" type="email" value={fields.loginEmail} onChange={set("loginEmail")} name="loginEmail" autoComplete="email" />
                </Field>
              </div>
              <div className="flex items-start gap-2.5 rounded-[14px] bg-[#E6F4FD] px-3.5 py-3 text-[13px] text-[#0B6FA8]">
                <Lock className="mt-0.5 h-[18px] w-[18px] shrink-0" />
                <span>لا حاجة لكلمة مرور الآن. بعد الموافقة تصلك كلمة مرور مؤقتة على هذا البريد، وتغيّرها عند أول دخول.</span>
              </div>
            </section>

            <div data-field-error={!!err("consent")} className="flex flex-col gap-1 px-1.5">
              <label className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => {
                    setConsent(e.target.checked);
                    setErrors((prev) => ({ ...prev, consent: undefined }));
                  }}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[#1E9BE6]"
                  data-testid="checkbox-consent"
                />
                أقر بصحة البيانات، وأوافق على معالجتها لغرض مراجعة الطلب.
              </label>
              {err("consent") ? <span className="text-[13px] text-[#BF3038]">{err("consent")}</span> : null}
            </div>

            {formError ? (
              <div role="alert" className="flex items-start gap-2 rounded-[14px] bg-[#FDECEC] px-3.5 py-3 text-sm text-[#BF3038]" data-testid="text-form-error">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {formError}
              </div>
            ) : null}

            <div className="flex flex-col items-stretch gap-3.5 px-1.5 sm:flex-row sm:items-center">
              <button
                type="submit"
                disabled={submitting}
                className="flex h-[52px] items-center justify-center gap-2 rounded-full bg-[#1E9BE6] px-[34px] text-base font-semibold text-white shadow-[0_8px_18px_rgba(30,155,230,.3)] disabled:opacity-70"
                data-testid="button-submit"
              >
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                {submitting ? "جارٍ رفع الشعار وإرسال الطلب" : "إرسال الطلب"}
              </button>
              <span className="text-center text-[13px] text-[#55667A]">الرد خلال يومي عمل عادةً</span>
            </div>
          </form>

          <aside className="hidden w-[340px] shrink-0 flex-col gap-3.5 lg:sticky lg:top-6 lg:flex">
            <span className="text-[13px] text-[#55667A]">هكذا تظهر وكالتك في سبق</span>
            <div className="flex flex-col gap-3.5 rounded-[22px] bg-white p-5 shadow-[0_2px_12px_rgba(27,43,58,.06)]">
              <div className="h-[150px] rounded-[14px] bg-gradient-to-br from-[#DDEBF5] to-[#EEF1FE]" />
              <span className="text-xs font-semibold text-[#0B6FA8]">خبر من وكالتك</span>
              <p className="m-0 text-base font-semibold leading-relaxed">عنوان الخبر الذي تنشره وكالتك يظهر هنا لقراء سبق</p>
              <div className="flex items-center gap-2.5 border-t border-[#EEF2F6] pt-3">
                {logoPreview ? (
                  <img src={logoPreview} alt="" className="h-[34px] w-[34px] rounded-full bg-white object-contain" />
                ) : (
                  <span className="h-[34px] w-[34px] rounded-full bg-[#E6F4FD]" />
                )}
                <span className="flex flex-col">
                  <span className="text-sm font-semibold" data-testid="text-preview-agency">{agencyLabel}</span>
                  <span className="text-xs text-[#617183]">ناشر في سبق</span>
                </span>
              </div>
            </div>
            <div className="rounded-[22px] bg-white px-[18px] py-1.5 shadow-[0_2px_12px_rgba(27,43,58,.06)]">
              <div className="flex justify-between border-b border-[#EEF2F6] py-3 text-sm">
                <span className="text-[#55667A]">الشعار</span>
                <span className={logo ? "font-semibold text-[#13734E]" : "text-[#946000]"}>{logo ? "جاهز" : "لم يُرفع بعد"}</span>
              </div>
              <div className="flex justify-between border-b border-[#EEF2F6] py-3 text-sm">
                <span className="text-[#55667A]">الحقول المطلوبة</span>
                <span className="font-semibold">
                  {filledRequired} من {requiredTotal}
                </span>
              </div>
              <div className="flex justify-between py-3 text-sm">
                <span className="text-[#55667A]">بعد الإرسال</span>
                <span>مراجعة فريق سبق</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
