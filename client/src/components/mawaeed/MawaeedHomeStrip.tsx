/**
 * سطر «مواعيدك» تحت الهيرو في الرئيسية: أقرب موعدين وكم بقي عليهما، والباب إلى /mawaeed.
 * ارتفاعه ثابت مثل شريط البوابة الرياضية فلا يزحزح ما تحته.
 */
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, ChevronLeft } from "lucide-react";
import { apiUrl } from "@/lib/queryClient";
import { pulseBlocks } from "@shared/mawaeed/home";
import type { MawaeedView, MawaeedSeriesBlock } from "@shared/mawaeed/present";

function homeLabel(kind: MawaeedSeriesBlock["kind"]): string {
  switch (kind) {
    case "school_holiday": return "إجازة المدارس";
    case "salary": return "الرواتب";
    case "pension": return "التقاعد";
    case "social_security": return "الضمان";
    case "citizen_account": return "حساب المواطن";
    default: return "";
  }
}

export default function MawaeedHomeStrip() {
  const { data } = useQuery<MawaeedView | null>({
    queryKey: ["/api/mawaeed", { region: "riyadh" }],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/mawaeed"), { credentials: "include" });
      return res.ok ? res.json() : null;
    },
    staleTime: 10 * 60_000,
  });
  const series = Array.isArray(data?.series) ? data.series : [];
  const top = pulseBlocks(series).filter((b) => b.next && !b.next.isPast).slice(0, 2);
  if (top.length === 0) return null;

  return (
    <div className="border-t border-border/60 bg-muted/40" data-testid="strip-mawaeed-home">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link href="/mawaeed" className="group flex h-12 items-center gap-2 sm:gap-2.5 text-sm no-underline">
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-black text-primary">
            <CalendarClock className="h-3.5 w-3.5" strokeWidth={2.2} />
            مواعيدك
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2 overflow-hidden whitespace-nowrap">
            {top.map((b, i) => (
              <span key={b.slug} className="flex min-w-0 items-center gap-1.5">
                {i > 0 && <span className="text-muted-foreground/60">·</span>}
                <span className="font-bold text-foreground">{homeLabel(b.kind)}</span>
                <span className="font-black text-primary tabular-nums">
                  {/* «بعد» تختفي على الجوال ليتّسع السطر للموعدين */}
                  {b.next!.countdownText.startsWith("بعد ") ? (
                    <><span className="hidden sm:inline">بعد </span>{b.next!.countdownText.slice(4)}</>
                  ) : b.next!.countdownText}
                </span>
              </span>
            ))}
          </span>
          <span className="flex shrink-0 items-center gap-0.5 font-bold text-primary">
            <span className="hidden sm:inline">كل المواعيد</span>
            <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" strokeWidth={2.2} />
          </span>
        </Link>
      </div>
    </div>
  );
}
