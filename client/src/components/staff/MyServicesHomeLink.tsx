// رابط مضغوط من النظرة العامة إلى «ملفي وخدماتي» — بدل تكديس البطاقات هناك.

import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, ChevronLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type ReviewStatus = "draft" | "pending_review" | "approved" | "needs_correction";

export function MyServicesHomeLink({ className }: { className?: string }) {
  const { user } = useAuth();
  const { data: dataRaw } = useQuery({
    queryKey: ["/api/staff-profiles/me"],
    enabled: Boolean(user?.id),
  });
  const status = ((dataRaw as { profile?: { profileReviewStatus?: ReviewStatus | null } } | null)?.profile
    ?.profileReviewStatus ?? "draft") as ReviewStatus;

  const hint =
    status === "approved"
      ? "ملف معتمد — شهادة التعريف والترخيص من هنا"
      : status === "pending_review"
        ? "بياناتك قيد مراجعة الإدارة"
        : status === "needs_correction"
          ? "مطلوب تصحيح على ملفك"
          : "استكمال الملف وشهادة التعريف";

  return (
    <Link
      href="/dashboard/my-services"
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-3 py-3 transition hover:bg-primary/10",
        className,
      )}
      data-testid="link-my-services-home"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Briefcase className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">ملفي وخدماتي</span>
          <span className="block truncate text-xs text-muted-foreground">{hint}</span>
        </span>
      </span>
      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
