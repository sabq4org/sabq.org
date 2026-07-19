/**
 * تقرير كأس العالم 2026 بالأرقام — لوحة التحكم.
 */
import { DashboardLayout } from "@/components/DashboardLayout";
import { Wc2026NumbersReportPanel } from "@/components/worldcup/Wc2026NumbersReportPanel";

export default function Wc2026NumbersReportPage() {
  return (
    <DashboardLayout>
      <Wc2026NumbersReportPanel variant="admin" />
    </DashboardLayout>
  );
}
