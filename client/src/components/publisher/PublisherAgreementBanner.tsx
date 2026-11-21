import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, X } from "lucide-react";
import { formatDate } from "@/lib/format";
import { agreementBannerState, agreementCreditsText, agreementDaysText } from "@shared/publisherAgreementBanner";
import type { PortalRenewal } from "./PublisherRenewalCard";

function readDismissed(id: string): boolean {
  try {
    return window.localStorage.getItem(id) === "1";
  } catch {
    return false;
  }
}

/**
 * شريط أحمر أعلى صفحات البوابة: للاتفاقية المفتوحة حين يبقى 90 يومًا أو أقل،
 * وللباقة المحدودة حين يقارب رصيدها النفاد (20% ثم 10% ثم آخر خبر) أو ينفد.
 */
export function PublisherAgreementBanner() {
  const { data } = useQuery<PortalRenewal>({
    queryKey: ["/api/publisher/portal/renewal"],
    staleTime: 5 * 60_000,
  });
  const state = agreementBannerState(data);
  const dismissId = state?.dismissId ?? null;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(dismissId ? readDismissed(dismissId) : false);
  }, [dismissId]);

  if (!state || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(state.dismissId, "1");
    } catch {
      // تعذر الحفظ: يُغلق لهذه الزيارة فقط
    }
  };

  const expiry = data?.current?.expiryDate ? formatDate(data.current.expiryDate) : null;
  const hasRequest = Boolean(data?.request);
  const upcomingStart = data?.upcoming?.startDate ? formatDate(data.upcoming.startDate) : null;

  let headline: string;
  let detail: string;
  if (state.kind === "days") {
    headline = `تنبيه: متبقٍّ من الاتفاقية المفتوحة ${agreementDaysText(state.daysLeft)}`;
    detail = expiry ? ` · تنتهي في ${expiry}.` : ".";
  } else if (state.remaining <= 0) {
    headline = "تنبيه: نفد رصيد باقتكم";
    detail = upcomingStart ? ` · تبدأ باقتكم الجديدة في ${upcomingStart}.` : "، ولا يمكن نشر مواد جديدة.";
  } else {
    headline = state.remaining === 1
      ? "تنبيه: بقي في رصيد باقتكم خبر واحد"
      : `تنبيه: متبقٍّ من رصيد باقتكم ${agreementCreditsText(state.remaining)}`;
    detail = ` من أصل ${state.total}.`;
  }
  const renewed = Boolean(data?.upcoming);
  const exhausted = state.kind === "credits" && state.remaining <= 0;
  const followUp = renewed
    ? ""
    : hasRequest
      ? " طلب التجديد قيد المتابعة."
      : exhausted ? " اطلبوا التجديد لاستئناف النشر." : " اطلبوا التجديد ليستمر النشر دون انقطاع.";
  const linkLabel = renewed ? "تفاصيل الباقة" : hasRequest ? "متابعة طلب التجديد" : "اطلب التجديد";

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-[#D92D20] py-3 pe-2 ps-4 text-white md:ps-6"
      data-testid="banner-agreement-expiry"
    >
      <AlertTriangle className="hidden h-5 w-5 shrink-0 sm:block" aria-hidden />
      <p className="min-w-[14rem] flex-1 text-sm leading-relaxed md:text-[15px]">
        <strong className="font-bold">{headline}</strong>
        {detail}
        {followUp}
      </p>
      <Link
        href="/dashboard/publisher/credits"
        className="order-last whitespace-nowrap rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#B42318] hover:bg-red-50 sm:order-none"
        data-testid="link-agreement-renew"
      >
        {linkLabel}
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="إغلاق التنبيه"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/15"
        data-testid="button-agreement-dismiss"
      >
        <X className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}
