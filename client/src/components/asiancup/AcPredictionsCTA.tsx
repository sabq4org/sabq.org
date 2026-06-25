import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Bot, ChevronLeft, Sparkles } from "lucide-react";

/**
 * بانر دعوة لمسابقة توقّعات كأس آسيا الذكية داخل هب البطولة. يكشف نفسه فقط متى
 * فُعّلت المسابقة (AC_PREDICTIONS_ENABLED): يجسّ نقطة المتصدّرين العامة، وإن
 * ردّت 503 (غير مفعّلة) لا يُعرض شيء فيبقى الهب نظيفًا حتى قرار النشر.
 */
export function AcPredictionsCTA() {
  const { isSuccess } = useQuery({
    queryKey: ["/api/asian-cup/predictions/leaderboard"],
    retry: false,
    staleTime: 5 * 60_000,
  });

  if (!isSuccess) return null;

  return (
    <section className="mx-auto max-w-6xl px-3 py-3 sm:px-4">
      <Link
        href="/asian-cup/predictions"
        className="group flex cursor-pointer items-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-bl from-emerald-600 via-emerald-700 to-emerald-800 p-4 text-white shadow-sm transition hover:shadow-md"
        data-testid="ac-predictions-cta"
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
          <Bot className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-black sm:text-lg">توقّعات كأس آسيا الذكية 🤖</p>
          <p className="truncate text-sm text-emerald-50/90">
            توقّع نتائج المباريات — كلّما كان توقّعك الصحيح أجرأ، زادت نقاطك. بمساعدة النموذج وإجماع الجمهور.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-bold text-emerald-700 transition group-hover:bg-emerald-50">
          <Sparkles className="h-4 w-4" /> ابدأ
          <ChevronLeft className="h-4 w-4" />
        </span>
      </Link>
    </section>
  );
}
