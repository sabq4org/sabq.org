"use client";

import { FormEvent, useState } from "react";
import { clientApiPost } from "@/lib/clientApi";

export function NewsletterSignup({ source = "web-next" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email || !consent) { setMessage("أدخل بريدك ووافق على تلقي النشرة للمتابعة."); return; }
    setPending(true); setMessage("");
    try {
      const { response, data: result } = await clientApiPost<{ pendingConfirmation?: boolean; message?: string }>("/api/smart-newsletter/subscribe", { email, frequency, source, language: "ar", consent: true });
      if (!response.ok || !result.pendingConfirmation) throw new Error(result.message || "تعذر إكمال الطلب");
      setSubmitted(true); setMessage("تحقق من بريدك. إذا كان العنوان مؤهلًا للاشتراك، ستصلك رسالة لتأكيده.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر إكمال الطلب."); }
    finally { setPending(false); }
  };
  return <section dir="rtl" aria-label="النشرة البريدية" className="mx-auto my-8 max-w-3xl rounded-2xl border border-slate-200 bg-card p-5 shadow-sm dark:border-slate-700">
    <p className="text-sm font-semibold text-primary">نشرة سبق</p><h2 className="mt-1 text-2xl font-bold">سبق في ٣ دقائق</h2><p className="mt-2 text-sm leading-7 text-muted-foreground">خمس قصص مهمة في بريدك، يوميًا أو أسبوعيًا.</p>
    <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]"><input data-testid="input-newsletter-email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" required dir="ltr" placeholder="name@example.com" aria-label="البريد الإلكتروني" className="h-11 rounded-xl border bg-background px-3 text-left outline-none focus:ring-2 focus:ring-ring" /><button data-testid="button-subscribe-newsletter" type="submit" disabled={pending || submitted} className="h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-60">{pending ? "جارٍ الإرسال…" : submitted ? "تم الإرسال" : "أرسل لي النشرة"}</button><div className="flex flex-wrap items-center gap-3 text-sm sm:col-span-2"><span className="font-medium">الوصول:</span><label><input data-testid="radio-newsletter-daily" type="radio" checked={frequency === "daily"} onChange={() => setFrequency("daily")} name={`frequency-${source}`} /> يوميًا</label><label><input data-testid="radio-newsletter-weekly" type="radio" checked={frequency === "weekly"} onChange={() => setFrequency("weekly")} name={`frequency-${source}`} /> أسبوعيًا</label></div><label className="flex items-start gap-2 text-xs leading-6 text-muted-foreground sm:col-span-2"><input data-testid="checkbox-newsletter-consent" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1" />أوافق على تلقي نشرة سبق في بريدي الإلكتروني، ويمكنني إلغاء الاشتراك لاحقًا.</label>{message && <p data-testid="newsletter-confirmation" className="text-sm text-foreground sm:col-span-2" role={submitted ? "status" : "alert"}>{message}</p>}</form>
  </section>;
}
