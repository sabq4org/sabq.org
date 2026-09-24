import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

type SubscriptionStatus = {
  local: { status: string; preferences?: { frequency?: string } } | null;
};

export function NewsletterPreferences() {
  const { user, isLoading } = useAuth();
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [message, setMessage] = useState("");
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setActive(false);
    setMessage("");
    if (!user?.email || !user.emailVerified) return;
    setLoading(true);
    void apiRequest<SubscriptionStatus>(`/api/smart-newsletter/status/${encodeURIComponent(user.email)}`)
      .then(result => {
        if (cancelled) return;
        const value = result.local?.preferences?.frequency;
        if (value === "daily" || value === "weekly") setFrequency(value);
        setActive(result.local?.status === "active");
        if (result.local?.status !== "active") setMessage("لا يوجد اشتراك نشط مرتبط ببريد حسابك. أكمل تأكيد الاشتراك أولًا.");
      })
      .catch(() => { if (!cancelled) setMessage("تعذر تحميل اشتراكك. تحقق من تأكيد بريد الاشتراك ثم أعد المحاولة."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.email, user?.emailVerified]);

  if (isLoading) return null;
  if (!user?.email) return (
    <div className="mt-5 rounded-xl border border-dashed p-4 text-sm leading-7 text-muted-foreground">
      لإدارة اشتراكك، <a href="/login?returnTo=%2Fnewsletter" className="font-semibold text-primary hover:underline">سجّل الدخول بحسابك</a>.
      ولإلغاء الاشتراك استخدم الرابط الموجود في رسائل النشرة.
    </div>
  );
  if (!user.emailVerified) return (
    <p className="mt-5 rounded-xl border p-4 text-sm leading-7">
      أكّد بريد حسابك قبل إدارة اشتراك النشرة من <a href="/profile" className="text-primary underline">صفحتك الشخصية</a>.
    </p>
  );

  const save = async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = await apiRequest<{ mailerliteSynced?: boolean }>("/api/smart-newsletter/update", {
        method: "PUT", body: JSON.stringify({ email: user.email, frequency, language: "ar" }),
      });
      setMessage(result.mailerliteSynced === true
        ? "حُفظ تفضيل وصول النشرة."
        : "حُفظ اختيارك، لكن تطبيقه على الرسائل لم يكتمل. أعد المحاولة لاحقًا.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر حفظ التفضيل.");
    } finally { setBusy(false); }
  };

  const unsubscribe = async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = await apiRequest<{ mailerliteSynced?: boolean }>("/api/smart-newsletter/unsubscribe", { method: "POST", body: JSON.stringify({ email: user.email }) });
      setActive(false);
      setMessage(result.mailerliteSynced === true
        ? "تم إلغاء اشتراكك في النشرة."
        : "سُجل طلب إلغاء الاشتراك، لكن إيقاف الرسائل لدى مزود البريد لم يكتمل بعد. يمكنك أيضًا استخدام رابط الإلغاء في آخر نشرة وصلتك.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر إلغاء الاشتراك. حاول مرة أخرى.");
    } finally { setBusy(false); }
  };

  return (
    <section data-testid="newsletter-preferences" id="preferences" className="mt-5 rounded-xl border bg-card p-5" aria-busy={loading || busy}>
      <h2 className="text-lg font-bold">تفضيل وصول النشرة</h2>
      <p className="mt-1 text-sm text-muted-foreground">اختر وتيرة الرسائل المرتبطة ببريد حسابك.</p>
      {loading && <p className="mt-3 text-sm" role="status">جارٍ تحميل اشتراكك…</p>}
      <fieldset disabled={busy || loading || !active} className="mt-4 flex flex-wrap gap-2 disabled:opacity-60">
        <legend className="sr-only">وتيرة النشرة</legend>
        {([["daily", "يوميًا"], ["weekly", "أسبوعيًا"]] as const).map(([value, label]) => (
          <label key={value} className={`cursor-pointer rounded-lg border px-4 py-2 text-sm focus-within:ring-2 focus-within:ring-ring ${frequency === value ? "border-primary bg-primary/5" : ""}`}>
            <input data-testid={`newsletter-preference-${value}`} type="radio" name="saved-frequency" className="sr-only" checked={frequency === value} onChange={() => setFrequency(value)} />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="mt-4 flex flex-wrap gap-3">
        <button data-testid="newsletter-preferences-save" type="button" onClick={save} disabled={busy || loading || !active} className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          {busy ? "جارٍ التحديث…" : "حفظ التفضيل"}
        </button>
        <button type="button" onClick={unsubscribe} disabled={busy || loading || !active} className="h-11 rounded-lg border px-4 text-sm disabled:opacity-60">إلغاء اشتراك النشرة</button>
      </div>
      {message && <p className="mt-3 text-sm leading-7" role="status">{message}</p>}
    </section>
  );
}
