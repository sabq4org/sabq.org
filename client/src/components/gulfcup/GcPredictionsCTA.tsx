import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Coins, Sparkles } from "lucide-react";

/**
 * بانر دعوة لمسابقة توقّعات خليجي 27 داخل هب البطولة. يكشف نفسه فقط متى فُعّلت
 * المسابقة (GC_PREDICTIONS_ENABLED): يجسّ نقطة المتصدّرين، وإن ردّت 503 لا يظهر.
 */
export function GcPredictionsCTA() {
  const { isSuccess } = useQuery({
    queryKey: ["/api/gulf-cup/predictions/leaderboard"],
    retry: false,
    staleTime: 5 * 60_000,
  });

  if (!isSuccess) return null;

  return (
    <section className="mx-auto max-w-6xl px-3 py-3 sm:px-4">
      <Link
        href="/gulf-cup/predictions"
        className="group flex cursor-pointer items-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-bl from-[#14905C] via-[#0F8054] to-[#08573B] p-4 text-white shadow-sm transition hover:shadow-md"
        data-testid="gc-predictions-cta"
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-400/20">
          <Coins className="h-6 w-6 text-amber-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-black sm:text-lg">توقّعات خليجي 27 💰</p>
          <p className="truncate text-sm text-emerald-50/90">
            توقّع نتائج المباريات وتقاسم بركة 1000 نقطة ولاء لكل مباراة — كلّما قلّ المصيبون زاد نصيبك.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-bold text-[#0A6B47] transition group-hover:bg-emerald-50">
          <Sparkles className="h-4 w-4" /> ابدأ
          <ChevronLeft className="h-4 w-4" />
        </span>
      </Link>
    </section>
  );
}
