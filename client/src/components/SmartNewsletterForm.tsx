import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Check, Loader2, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { trackEvent } from "@/lib/analytics";

const formSchema = z.object({
  email: z.string().trim().email("أدخل بريدًا إلكترونيًا صحيحًا"),
  frequency: z.enum(["daily", "weekly"]),
  interests: z.array(z.string()),
});
type Frequency = "daily" | "weekly";
type Props = { variant?: "compact" | "full"; source?: string; className?: string };

export function SmartNewsletterForm({ variant = "full", source = "website", className = "" }: Props) {
  const impressionRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [interests, setInterests] = useState<string[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; nameAr: string }>>([]);
  const [showInterests, setShowInterests] = useState(false);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "pending" | "error">("idle");
  const [error, setError] = useState("");
  useEffect(() => {
    if (source === "newsletter-page" || typeof IntersectionObserver === "undefined") return;
    const node = impressionRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      trackEvent("newsletter_impression", "newsletter", source);
      observer.disconnect();
    }, { threshold: 0.25 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [source]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = formSchema.safeParse({ email, frequency, interests });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || "تحقق من البيانات"); return; }
    if (!consent) { setError("وافق على تلقي النشرة للمتابعة"); return; }
    setError(""); setStatus("loading");
    try {
      const result = await apiRequest<{ pendingConfirmation?: boolean }>("/api/smart-newsletter/subscribe", {
        method: "POST",
        body: JSON.stringify({ email: parsed.data.email, frequency, interests, source, language: "ar", consent: true }),
      });
      if (!result?.pendingConfirmation) throw new Error("تعذر إكمال الطلب");
      setStatus("pending");
      trackEvent("newsletter_signup_requested", "newsletter", `${source}:${frequency}`);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "تعذر إكمال الطلب. حاول مرة أخرى.");
    }
  };

  const toggleInterests = async () => {
    setShowInterests((value) => !value);
    if (!categories.length) {
      try {
        const payload = await apiRequest<unknown>("/api/smart-newsletter/categories");
        const categoryList = z.array(z.object({ id: z.string(), nameAr: z.string() }));
        const parsed = z.union([categoryList, z.object({ categories: categoryList })]).safeParse(payload);
        if (parsed.success) setCategories(Array.isArray(parsed.data) ? parsed.data : parsed.data.categories);
      } catch { /* optional enhancement; the required email flow remains available */ }
    }
  };

  if (status === "pending") return <div data-testid="newsletter-confirmation" className={`rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-right dark:border-emerald-900 dark:bg-emerald-950/30 ${className}`} dir="rtl" role="status">
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300"><Check className="h-5 w-5" /></div>
    <h3 className="text-lg font-bold text-emerald-950 dark:text-emerald-100">تحقق من بريدك الإلكتروني</h3>
    <p className="mt-2 text-sm leading-7 text-emerald-900/80 dark:text-emerald-200/80">تحقق من بريدك. إذا كان العنوان مؤهلًا للاشتراك، ستصلك رسالة لتأكيده.</p>
  </div>;

  const compact = variant === "compact";
  return <div ref={impressionRef} className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 ${className}`} dir="rtl">
    <div className="mb-4 flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Sparkles className="h-5 w-5" /></div><div><h3 className={compact ? "text-base font-bold" : "text-xl font-bold"}>سبق في ٣ دقائق</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">خمس قصص مهمة في بريدك، يوميًا أو أسبوعيًا.</p></div></div>
    <form onSubmit={submit} className="space-y-4" noValidate>
      <label className="block text-sm font-medium" htmlFor={`newsletter-email-${source}`}>البريد الإلكتروني<span className="text-destructive"> *</span></label>
      <div className="relative"><Mail className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input data-testid="input-newsletter-email" id={`newsletter-email-${source}`} value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" dir="ltr" placeholder="name@example.com" className="h-11 w-full rounded-xl border bg-background px-10 text-left outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring" required /></div>
      <fieldset><legend className="mb-2 text-sm font-medium">كيف تفضّل وصولها؟<span className="text-destructive"> *</span></legend><div className="grid grid-cols-2 gap-2">{([["daily", "يوميًا", "كل يوم"], ["weekly", "أسبوعيًا", "ملخص الأسبوع"]] as const).map(([value, label, hint]) => <label key={value} className={`cursor-pointer rounded-xl border p-3 transition-colors focus-within:ring-2 focus-within:ring-ring ${frequency === value ? "border-primary bg-primary/5" : "border-border"}`}><input data-testid={`radio-newsletter-${value}`} type="radio" name={`frequency-${source}`} value={value} checked={frequency === value} onChange={() => setFrequency(value)} className="sr-only" /><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs text-muted-foreground">{hint}</span></label>)}</div></fieldset>
      {!compact && <button type="button" onClick={toggleInterests} className="text-sm font-medium text-primary hover:underline">{showInterests ? "إخفاء الاهتمامات" : "أضف اهتماماتك (اختياري)"}</button>}
      {showInterests && <fieldset><legend className="sr-only">الاهتمامات</legend>{categories.length ? <div className="flex flex-wrap gap-2">{categories.map((interest) => <label key={interest.id} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm focus-within:ring-2 focus-within:ring-ring ${interests.includes(interest.id) ? "border-primary bg-primary/10 text-primary" : "border-border"}`}><input type="checkbox" className="sr-only" checked={interests.includes(interest.id)} onChange={() => setInterests((current) => current.includes(interest.id) ? current.filter((item) => item !== interest.id) : [...current, interest.id])} />{interest.nameAr}</label>)}</div> : <p className="text-xs text-muted-foreground">يمكنك تخطي الاهتمامات الآن.</p>}</fieldset>}
      <label className="flex cursor-pointer items-start gap-2 text-sm leading-6 text-muted-foreground"><input data-testid="checkbox-newsletter-consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 accent-primary" />أوافق على تلقي نشرة سبق في بريدي الإلكتروني، ويمكنني إلغاء الاشتراك لاحقًا.</label>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <button data-testid="button-subscribe-newsletter" type="submit" disabled={status === "loading"} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60">{status === "loading" ? <><Loader2 className="h-4 w-4 animate-spin" />جارٍ الإرسال…</> : "أرسل لي النشرة"}</button>
      <p className="flex items-center justify-center gap-1 text-center text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" />لن نرسل لك إلا ما وافقت عليه</p>
    </form>
  </div>;
}
export default SmartNewsletterForm;
