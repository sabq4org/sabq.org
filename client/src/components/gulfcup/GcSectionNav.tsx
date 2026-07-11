import { Link } from "wouter";
import { Sparkles } from "lucide-react";
import gulfCupLogoHorizontal from "@assets/gulf-cup-27-logo-horizontal.svg";

/**
 * شريط تنقّل لاصق: أقسام الصفحة + مدخل ثابت للتوقعات
 * (يبقى ظاهرًا بعد اختفاء بلوك العدّاد وأثناء التمرير).
 */

const SECTIONS: { id: string; label: string }[] = [
  { id: "gc-saudi", label: "الأخضر" },
  { id: "gc-schedule", label: "المباريات" },
  { id: "gc-groups", label: "المجموعات" },
  { id: "gc-knockout", label: "الطريق إلى اللقب" },
  { id: "gc-scorers", label: "الهدّافون" },
  { id: "gc-stars", label: "النجوم" },
  { id: "gc-history", label: "سجلّ البطولة" },
  { id: "gc-teams", label: "المنتخبات" },
];

export function GcSectionNav() {
  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav
      dir="rtl"
      aria-label="أقسام صفحة خليجي 27"
      className="sticky top-0 z-30 border-b border-white/10 bg-[#04261b]/95 backdrop-blur-md supports-[backdrop-filter]:bg-[#04261b]/90"
    >
      <div className="container mx-auto flex max-w-6xl items-center gap-0.5 overflow-x-auto px-4 py-2.5 sm:px-6 lg:px-8">
        <span className="ml-1.5 hidden shrink-0 rounded-lg bg-white px-1.5 py-1 shadow-sm sm:block">
          <img
            src={gulfCupLogoHorizontal}
            alt="خليجي 27"
            className="h-5 w-auto object-contain"
            loading="lazy"
          />
        </span>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => jump(s.id)}
            className="shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-bold text-emerald-100/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            {s.label}
          </button>
        ))}
        <span className="mx-1.5 h-4 w-px shrink-0 bg-white/15" />
        <Link
          href="/gulf-cup/predictions"
          className="flex shrink-0 items-center gap-1 rounded-full bg-sky-300 px-4 py-1.5 text-[13px] font-black text-sky-950 transition-colors hover:bg-sky-200"
        >
          <Sparkles className="h-3.5 w-3.5" />
          توقّع واربح
        </Link>
      </div>
    </nav>
  );
}
