/**
 * قسم كأس العالم على الرئيسية بعد انتهاء البطولة:
 * تقرير «بالأرقام» مكان الشريط + أخبار المونديال.
 */
import { Wc2026NumbersReportPanel } from "./Wc2026NumbersReportPanel";

export default function WorldCupHomeSection() {
  return (
    <section className="py-6 sm:py-8" aria-label="كأس العالم 2026 بالأرقام">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Wc2026NumbersReportPanel variant="public" />
      </div>
    </section>
  );
}
