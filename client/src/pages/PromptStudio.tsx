import { DashboardLayout } from "@/components/DashboardLayout";
import { PromptStudioPanel } from "@/components/PromptStudioPanel";
import { useAuth } from "@/hooks/useAuth";

export default function PromptStudio() {
  useAuth({ redirectToLogin: true });

  return (
    <DashboardLayout>
      <PromptStudioPanel endpoint="/api/prompt-studio/optimize" />
    </DashboardLayout>
  );
}
