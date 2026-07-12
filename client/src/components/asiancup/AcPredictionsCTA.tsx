import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Bot, ChevronLeft, Sparkles } from "lucide-react";

/**
 * إعلان المشاركة في توقّعات كأس آسيا — بطاقة فاتحة بلمسة زمردية
 * (بدون شريط أخضر مصمت يثقل الصفحة).
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
        className="group relative flex cursor-pointer items-center gap-4 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-emerald-500/35 hover:shadow-md"
        data-testid="ac-predictions-cta"
      >
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-1.5 bg-emerald-500"
          aria-hidden
        />
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-700 dark:text-emerald-300">
          <Bot className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1 text-right">
          <p className="text-base font-black text-foreground sm:text-lg">
            شارك في توقّعات كأس آسيا الذكية
          </p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            توقّع النتائج، اجمع النقاط، وتصدّر لوحة المتوقّعين — بمساعدة النموذج وإجماع الجمهور.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition group-hover:bg-emerald-500">
          <Sparkles className="h-4 w-4" /> ابدأ
          <ChevronLeft className="h-4 w-4" />
        </span>
      </Link>
    </section>
  );
}
