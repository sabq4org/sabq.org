import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, MailCheck, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import SmartNewsletterForm from "@/components/SmartNewsletterForm";
import { NewsletterPreferences } from "@/components/newsletter/NewsletterPreferences";

const SAMPLE_STORIES = ["عنوان رئيسي يشرح ما حدث بوضوح", "خلفية سريعة تساعدك على فهم السياق", "رقم أو معلومة موثقة عند توفرها", "ما الذي يهم القارئ في هذا التطور؟", "الرابط إلى القصة الكاملة على سبق"];

export default function NewsletterPage() {
  const [token, setToken] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    // Prefer a fragment so the confirmation token is not sent in the Referer
    // header or picked up by page analytics. Keep query support for the API's
    // documented /newsletter?confirm=... links during the transition.
    const hashToken = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("confirm");
    const resolvedToken = hashToken || new URLSearchParams(window.location.search).get("confirm");
    setToken(resolvedToken);
    if (resolvedToken) window.history.replaceState({}, document.title, "/newsletter");
  }, []);

  const confirm = async () => {
    if (!token) return;
    setConfirming(true); setError("");
    try { const result = await apiRequest<{ success?: boolean }>("/api/smart-newsletter/confirm", { method: "POST", body: JSON.stringify({ token }) }); if (!result?.success) throw new Error("تعذر تأكيد الاشتراك"); setConfirmed(true); }
    catch (err) { setError(err instanceof Error ? err.message : "تعذر تأكيد الاشتراك"); }
    finally { setConfirming(false); }
  };

  if (token && !confirmed) return <main className="min-h-screen bg-background px-4 py-16" dir="rtl"><div className="mx-auto max-w-lg rounded-2xl border bg-card p-8 text-center shadow-sm"><MailCheck className="mx-auto mb-5 h-12 w-12 text-primary" /><h1 className="text-2xl font-bold">تأكيد اشتراكك في سبق</h1><p className="mt-3 leading-7 text-muted-foreground">اضغط الزر لتأكيد اشتراكك في النشرة. لن يتم تفعيل الاشتراك بمجرد فتح الرابط.</p>{error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}<button data-testid="button-confirm-newsletter" type="button" onClick={confirm} disabled={confirming} className="mt-6 h-11 w-full rounded-xl bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-60">{confirming ? "جارٍ التأكيد…" : "تأكيد الاشتراك"}</button></div></main>;
  if (confirmed) return <main className="min-h-screen bg-background px-4 py-16" dir="rtl"><div className="mx-auto max-w-lg rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center dark:border-emerald-900 dark:bg-emerald-950/30"><CheckCircle2 className="mx-auto mb-5 h-12 w-12 text-emerald-600" /><h1 className="text-2xl font-bold">تم تأكيد اشتراكك</h1><p className="mt-3 leading-7 text-muted-foreground">يمكنك إدارة تفضيل وصول النشرة من حسابك.</p></div><div className="mx-auto max-w-lg"><NewsletterPreferences /></div></main>;

  return <div className="min-h-screen bg-background" dir="rtl"><main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8"><div className="grid items-center gap-10 lg:grid-cols-[1.1fr_.9fr]"><section><Link href="/" className="text-sm font-medium text-primary hover:underline">العودة إلى سبق</Link><p className="mt-8 text-sm font-semibold text-primary">نشرة بريدية من سبق</p><h1 className="mt-3 text-4xl font-bold leading-tight md:text-6xl">سبق في ٣ دقائق</h1><p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">خمس قصص مهمة تساعدك على فهم يومك، تصل إلى بريدك بالطريقة التي تناسبك.</p><div className="mt-6 grid grid-cols-3 gap-3 text-sm sm:mt-8 sm:gap-4 sm:text-base"><div><Clock3 className="mb-2 h-5 w-5 text-primary" /><p className="font-semibold">يوميًا أو أسبوعيًا</p></div><div><ShieldCheck className="mb-2 h-5 w-5 text-primary" /><p className="font-semibold">تحكم واضح</p></div><div><MailCheck className="mb-2 h-5 w-5 text-primary" /><p className="font-semibold">تأكيد بالبريد</p></div></div></section><SmartNewsletterForm source="newsletter-page" /></div><section className="mx-auto mt-16 max-w-3xl border-t pt-10"><h2 className="text-2xl font-bold">شكل الرسالة</h2><p className="mt-2 text-sm text-muted-foreground">قالب توضيحي؛ العناوين أدناه أمثلة على البنية وليست أخبارًا منشورة.</p><ol className="mt-5 grid gap-3">{SAMPLE_STORIES.map((story, index) => <li key={story} className="rounded-xl border bg-card p-4"><span className="ml-2 text-sm font-bold text-primary">{index + 1}</span>{story}</li>)}</ol><NewsletterPreferences /></section></main></div>;
}
