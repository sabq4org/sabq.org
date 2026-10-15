import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface DashboardSessionLoadingProps {
  isUnavailable: boolean;
  isRetrying: boolean;
  onRetry: () => void;
  onReload: () => void;
}

/** Recovery UI only: never grants access, cancels the session query, or logs out. */
export function DashboardSessionLoading({
  isUnavailable,
  isRetrying,
  onRetry,
  onReload,
}: DashboardSessionLoadingProps) {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    setIsSlow(false);
    if (isUnavailable) return;
    const timer = window.setTimeout(() => setIsSlow(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [isUnavailable]);

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6" dir="rtl">
      <div className="max-w-md text-center" role="status" aria-live="polite">
        {!isUnavailable && !isSlow ? (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" aria-hidden="true" />
            <p className="mt-4 text-muted-foreground">جاري التحميل...</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">
              {isUnavailable ? "تعذر الاتصال بلوحة التحكم" : "التحقق من الدخول يستغرق وقتًا أطول"}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {isUnavailable
                ? "لم نتمكن من التحقق من الجلسة الآن. أعد المحاولة للمتابعة."
                : "ما زلنا ننتظر تأكيد الجلسة. يمكنك الانتظار أو إعادة تحميل اللوحة."}
            </p>
            <Button
              className="mt-5"
              disabled={isUnavailable && isRetrying}
              onClick={isUnavailable ? onRetry : onReload}
            >
              {isUnavailable
                ? (isRetrying ? "جارٍ إعادة المحاولة…" : "إعادة المحاولة")
                : "إعادة تحميل اللوحة"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
