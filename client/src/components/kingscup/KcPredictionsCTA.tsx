import { Link } from "wouter";
import { Sparkles, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function KcPredictionsCTA() {
  return (
    <section className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="rounded-2xl bg-gradient-to-bl from-emerald-600 to-emerald-800 p-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-white">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-white/15 p-2.5">
            <Sparkles className="h-6 w-6 text-amber-300" />
          </span>
          <div>
            <p className="text-lg font-black">توقّع نتائج كأس الملك</p>
            <p className="text-sm text-emerald-100/80">
              توقّع نتائج المباريات والبطل والهدّاف، واجمع النقاط وتصدّر لوحة المتوقّعين
            </p>
          </div>
        </div>
        <Button asChild className="bg-amber-300 text-emerald-950 hover:bg-amber-200 font-bold rounded-full gap-1 shrink-0">
          <Link href="/kings-cup/predictions">
            ابدأ التوقّع
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
