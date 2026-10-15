"use client";

import { useEffect, useState } from "react";
import { clientApiPost } from "@/lib/clientApi";

export function NewsletterConfirmation() {
  const [token, setToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const resolved = params.get("confirm") || new URLSearchParams(window.location.search).get("confirm");
    if (!resolved) return;
    setToken(resolved);
    window.history.replaceState({}, document.title, "/newsletter");
  }, []);
  if (!token) return null;
  const confirm = async () => {
    setPending(true); setMessage(""); setSuccess(false);
    try {
      const { response, data: result } = await clientApiPost<{ success?: boolean; message?: string }>("/api/smart-newsletter/confirm", { token });
      if (!response.ok || !result.success) throw new Error(result.message || "تعذر تأكيد الاشتراك");
      setSuccess(true); setMessage("تم تأكيد اشتراكك. يمكنك إدارة التفضيلات من حسابك.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر تأكيد الاشتراك."); }
    finally { setPending(false); }
  };
  return <section dir="rtl" className="mx-auto mb-8 max-w-3xl rounded-2xl border border-primary/30 bg-primary/5 p-6" aria-label="تأكيد الاشتراك"><h2 className="text-xl font-bold">تأكيد اشتراكك في سبق</h2><p className="mt-2 text-sm leading-7 text-muted-foreground">اضغط الزر لإتمام التأكيد. لن يتم تفعيل الاشتراك بمجرد فتح الرابط.</p>{message && <p data-testid="newsletter-confirmation" className="mt-4 text-sm" role={success ? "status" : "alert"}>{message}</p>}{!success && <button data-testid="button-confirm-newsletter" type="button" onClick={confirm} disabled={pending} className="mt-5 h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-60">{pending ? "جارٍ التأكيد…" : "تأكيد الاشتراك"}</button>}</section>;
}
