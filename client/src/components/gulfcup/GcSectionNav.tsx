import { Link } from "wouter";
import { Sparkles } from "lucide-react";
import gulfCupLogoHorizontal from "@assets/gulf-cup-27-logo-horizontal.svg";

/**
 * شريط تنقّل داخلي لاصق أسفل الهيرو — قفزات سلسة لأقسام الصفحة + زر
 * التوقعات الذهبي. يظهر فقط حين تتوفر قوائم الأقسام (تمريره ids موجودة).
 */

const SECTIONS: { id: string; label: string }[] = [
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
      className="sticky top-0 z-30 border-b border-emerald-900/20 bg-[#08573B]/95 backdrop-blur supports-[backdrop-filter]:bg-[#08573B]/85"
    >
      <div className="container max-w-6xl mx-auto flex items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">
        {/* الشعار الرسمي مصغّرًا على رقعة بيضاء — مرجع بصري ثابت أثناء التمرير */}
        <span className="ml-1 hidden shrink-0 rounded-lg bg-white px-1.5 py-1 shadow sm:block">
          <img
            src={gulfCupLogoHorizontal}
            alt="خليجي 27"
            className="h-6 w-auto object-contain"
            loading="lazy"
          />
        </span>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => jump(s.id)}
            className="shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-bold text-emerald-100/85 transition-colors hover:bg-white/10 hover:text-white"
          >
            {s.label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px shrink-0 bg-white/15" />
        <Link
          href="/gulf-cup/predictions"
          className="flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-b from-[#F5D46B] to-[#E7A93C] px-4 py-1.5 text-[13px] font-black text-emerald-950 transition-colors hover:from-[#F8DD82] hover:to-[#EDB44E]"
        >
          <Sparkles className="h-3.5 w-3.5" />
          توقّع واربح
        </Link>
      </div>
    </nav>
  );
}
