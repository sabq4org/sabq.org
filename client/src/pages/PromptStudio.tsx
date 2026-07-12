import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { PromptStudioPanel } from "@/components/PromptStudioPanel";
import { useAuth } from "@/hooks/useAuth";
import { Wand2 } from "lucide-react";

export default function PromptStudio() {
  useAuth({ redirectToLogin: true });

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 pb-10 sm:px-6" dir="rtl">
        <DashboardPageHeader
          icon={Wand2}
          title="مختبر البرومبت"
          description="حسّن تعليماتك تلقائياً وفق أفضل ممارسات هندسة البرومبت"
        />
        <PromptStudioPanel endpoint="/api/prompt-studio/optimize" showHeader={false} />
      </div>
    </DashboardLayout>
  );
}
