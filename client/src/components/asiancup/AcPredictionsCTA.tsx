import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Bot, ChevronLeft, Sparkles } from "lucide-react";

/**
 * إعلان المشاركة في التوقّعات — شريط زمردي مضغوط العرض (ليس بعرض الصفحة الكامل).
 */
export function AcPredictionsCTA() {
  const { isSuccess } = useQuery({
    queryKey: ["/api/asian-cup/predictions/leaderboard"],
    retry: false,
    staleTime: 5 * 60_000,
  });

  if (!isSuccess) return null;

  return (
    <section className="mx-auto flex max-w-6xl justify-center px-3 py-3 sm:px-4">
      <Link
        href="/asian-cup/predictions"
        className="group flex w-full max-w-xl cursor-pointer items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-bl from-[#04392a] via-[#0a5c40] to-[#021a12] px-4 py-3 text-white shadow-md transition hover:shadow-lg sm:max-w-2xl"
        data-testid="ac-predictions-cta"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <Bot className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 text-right">
          <p className="text-sm font-black sm:text-base">شارك في توقّعات كأس آسيا</p>
          <p className="truncate text-xs text-emerald-100/80 sm:text-sm">
            توقّع النتائج واجمع النقاط
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-emerald-800 transition group-hover:bg-emerald-50 sm:text-sm">
          <Sparkles className="h-3.5 w-3.5" /> ابدأ
          <ChevronLeft className="h-3.5 w-3.5" />
        </span>
      </Link>
    </section>
  );
}
