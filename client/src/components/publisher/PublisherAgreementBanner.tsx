import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, X } from "lucide-react";
import { formatDate } from "@/lib/format";
import { agreementBannerState, agreementDaysText } from "@shared/publisherAgreementBanner";
import type { PortalRenewal } from "./PublisherRenewalCard";

function readDismissed(id: string): boolean {
  try {
    return window.localStorage.getItem(id) === "1";
  } catch {
    return false;
  }
}

/** شريط أحمر أعلى صفحات البوابة حين يبقى على الاتفاقية المفتوحة 90 يومًا أو أقل. */
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

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-[#D92D20] py-3 pe-2 ps-4 text-white md:ps-6"
      data-testid="banner-agreement-expiry"
    >
      <AlertTriangle className="hidden h-5 w-5 shrink-0 sm:block" aria-hidden />
      <p className="min-w-[14rem] flex-1 text-sm leading-relaxed md:text-[15px]">
        <strong className="font-bold">
          تنبيه: متبقٍّ من الاتفاقية المفتوحة {agreementDaysText(state.daysLeft)}
        </strong>
        {expiry ? ` · تنتهي في ${expiry}.` : "."}
        {hasRequest ? " طلب التجديد قيد المتابعة." : " اطلبوا التجديد ليستمر النشر دون انقطاع."}
      </p>
      <Link
        href="/dashboard/publisher/credits"
        className="order-last whitespace-nowrap rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#B42318] hover:bg-red-50 sm:order-none"
        data-testid="link-agreement-renew"
      >
        {hasRequest ? "متابعة طلب التجديد" : "اطلب التجديد"}
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
