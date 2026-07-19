/**
 * قسم كأس العالم على الرئيسية بعد انتهاء البطولة:
 * تقرير «بالأرقام» مكان الشريط + أخبار المونديال (أُزيلا بطلب المنتج).
 */
import { Wc2026NumbersReportPanel } from "./Wc2026NumbersReportPanel";

export default function WorldCupHomeSection() {
  return (
    <section
      className="border-y border-amber-900/20 bg-[#05070d] py-4 sm:py-8"
      aria-label="كأس العالم 2026 بالأرقام"
    >
      <div className="container mx-auto max-w-7xl px-0 sm:px-6 lg:px-8">
        <Wc2026NumbersReportPanel variant="public" />
      </div>
    </section>
  );
}
