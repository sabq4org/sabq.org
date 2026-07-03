import { Link } from "wouter";
import { Trophy, ChevronLeft } from "lucide-react";

/**
 * بانر دعوة لمسابقة التوقّعات داخل هب كأس الملك — نفس بانر المونديال
 * (PredictionsCTA) ويربط /kings-cup/predictions.
 */
export function KcPredictionsCTA() {
  return (
    <section className="mx-auto max-w-6xl px-3 sm:px-4 py-3">
      <Link
        href="/kings-cup/predictions"
        className="group flex cursor-pointer items-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-bl from-emerald-600 via-emerald-700 to-emerald-800 p-4 text-white shadow-sm transition hover:shadow-md"
        data-testid="kc-predictions-cta"
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
          <Trophy className="h-6 w-6 text-amber-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-black sm:text-lg">شارك في توقّعات كأس الملك 🏆</p>
          <p className="truncate text-sm text-emerald-50/90">
            توقّع نتائج المباريات والبطل والهدّاف، واجمع النقاط وتصدّر لوحة المتوقّعين
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-bold text-emerald-700 transition group-hover:bg-emerald-50">
          ابدأ التوقّع
          <ChevronLeft className="h-4 w-4" />
        </span>
      </Link>
    </section>
  );
}
