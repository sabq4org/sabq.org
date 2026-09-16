// بطاقة استكمال ملف المنسوب — تُعرض داخل «ملفي وخدماتي».
// اكتمال 100% → قيد مراجعة الإدارة → بعد الاعتماد: قفل التعديل + إصدار الشهادة من قسم الشهادات.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserRoundCheck, ChevronDown, ChevronUp, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StaffProfileForm } from "@/components/staff/StaffProfileForm";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const PROFILE_CTA =
  "استكمال ملفك الشخصي يؤهلك لاستخدام إصدار شهادة التعريف والخدمات القادمة.";

type ReviewStatus = "draft" | "pending_review" | "approved" | "needs_correction";

type MeProfile = {
  profile: {
    completionPercent?: number;
    missingFields?: string[];
    profileReviewStatus?: ReviewStatus | null;
    profileReviewNote?: string | null;
    officialFullNameAr?: string | null;
  } | null;
  missingLabels?: string[];
};

function reviewBadge(status: ReviewStatus | null | undefined, complete: boolean) {
  if (status === "approved") {
    return {
      label: "معتمد من الإدارة ✓",
      className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    };
  }
  if (status === "pending_review" || (complete && status === "draft")) {
    return {
      label: "البيانات تحت المراجعة",
      className: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
    };
  }
  if (status === "needs_correction") {
    return {
      label: "يحتاج تصحيحاً",
      className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    };
  }
  return {
    label: complete ? "الملف مكتمل" : "مسودة",
    className: complete
      ? "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400"
      : "border-muted-foreground/30 bg-muted/40 text-muted-foreground",
  };
}

export function MyStaffProfileCard({ className }: { className?: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const { data: dataRaw, isLoading } = useQuery({
    queryKey: ["/api/staff-profiles/me"],
    enabled: Boolean(user?.id),
  });
  const data = (dataRaw ?? null) as MeProfile | null;
  const percent = data?.profile?.completionPercent ?? 0;
  const missingCount = data?.profile?.missingFields?.length
    ?? data?.missingLabels?.length
    ?? 0;
  const complete = Boolean(data?.profile) && missingCount === 0 && percent >= 100;
  const reviewStatus = data?.profile?.profileReviewStatus ?? "draft";
  const reviewNote = data?.profile?.profileReviewNote ?? null;
  const hasOfficialFullName = Boolean(String(data?.profile?.officialFullNameAr ?? "").trim());
  const badge = reviewBadge(reviewStatus, complete);
  const locked =
    reviewStatus === "pending_review" ||
    (reviewStatus === "approved" && hasOfficialFullName);

  if (!user?.id) return null;

  return (
    <aside
      id="my-staff-profile"
      className={cn(
        "rounded-xl border border-primary/25 bg-primary/5 p-3 sm:p-4",
        className,
      )}
      dir="rtl"
      data-testid="card-my-staff-profile"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <UserRoundCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-sm leading-relaxed text-foreground">{PROFILE_CTA}</p>
            {isLoading ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> جارٍ فحص اكتمال ملفك…
              </p>
            ) : (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={badge.className}>
                    {badge.label}
                  </Badge>
                  {!complete && (
                    <span className="text-[11px] text-muted-foreground">
                      الاكتمال {percent}%
                      {missingCount > 0 ? ` · ${missingCount} حقول ملزمة ناقصة` : ""}
                    </span>
                  )}
                </div>
                {reviewStatus === "pending_review" || (complete && reviewStatus === "draft") ? (
                  <p className="text-xs leading-relaxed text-sky-800 dark:text-sky-300" data-testid="text-profile-pending-review">
                    بياناتك مكتملة وهي تحت مراجعة الإدارة. بعد الاعتماد ستتمكن من إصدار شهادة التعريف.
                  </p>
                ) : null}
                {reviewStatus === "approved" && (
                  <p className="text-xs leading-relaxed text-emerald-800 dark:text-emerald-300" data-testid="text-profile-approved">
                    {hasOfficialFullName
                      ? "تم اعتماد ملفك — أصدر أو حمّل شهادة التعريف من قسم الشهادات أدناه."
                      : "تم اعتماد ملفك — أكمل الاسم الرباعي (للشهادة فقط) ثم أصدر الشهادة من القسم أدناه."}
                  </p>
                )}
                {reviewStatus === "needs_correction" && (
                  <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300" data-testid="text-profile-needs-correction">
                    {reviewNote
                      ? `مطلوب تصحيح: ${reviewNote}`
                      : "طلبت الإدارة تصحيحاً على بياناتك — عدّل الملف ثم احفظه ليُعاد للمراجعة."}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5 border-primary/30 bg-background hover:bg-primary/5"
          onClick={() => setOpen((v) => !v)}
          data-testid="button-toggle-staff-profile"
        >
          {open ? (
            <>
              إغلاق
              <ChevronUp className="h-3.5 w-3.5" />
            </>
          ) : (
            <>
              {locked ? "عرض الملف" : complete ? "مراجعة الملف" : "استكمال الملف"}
              {locked ? <FileText className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </>
          )}
        </Button>
      </div>

      {open && (
        <div className="mt-4 border-t border-primary/15 pt-4">
          <StaffProfileForm userId={user.id} mode="page" access="self" />
        </div>
      )}
    </aside>
  );
}
