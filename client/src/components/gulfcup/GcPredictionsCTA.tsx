import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Trophy } from "lucide-react";

/**
 * بانر توقّعات خليجي — سكاي على ليلي بارد (مطابق للتطبيق).
 */
export function GcPredictionsCTA() {
  const { isSuccess } = useQuery({
    queryKey: ["/api/gulf-cup/predictions/leaderboard"],
    retry: false,
    staleTime: 5 * 60_000,
  });

  if (!isSuccess) return null;

  return (
    <section className="mx-auto max-w-6xl px-3 py-4 sm:px-4">
      <Link
        href="/gulf-cup/predictions"
        className="group flex cursor-pointer items-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-bl from-sky-600 via-sky-700 to-sky-950 p-4 text-white shadow-sm transition hover:shadow-md sm:p-5"
        data-testid="gc-predictions-cta"
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/10">
          <Trophy className="h-6 w-6 text-sky-200" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-black sm:text-lg">شارك في توقّعات خليجي 27</p>
          <p className="mt-0.5 truncate text-sm text-sky-50/90">
            توقّع النتائج واربح من بركة 1000 نقطة ولاء لكل مباراة — كلّما قلّ المصيبون زاد نصيبك
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-bold text-sky-800 transition group-hover:bg-sky-50">
          ابدأ التوقّع
          <ChevronLeft className="h-4 w-4 transition group-hover:-translate-x-0.5" />
        </span>
      </Link>
    </section>
  );
}
