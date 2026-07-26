// بطاقة استكمال ملف المنسوب — للكاتب والمراسل في مساحتيهما.
// تستبدل مرجع التعليم العام بنداء واضح يؤهّل لشهادة التعريف والخدمات.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserRoundCheck, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StaffProfileForm } from "@/components/staff/StaffProfileForm";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const PROFILE_CTA =
  "استكمال ملفك الشخصي يؤهلك لاستخدام إصدار شهادة التعريف والخدمات القادمة.";

type MeProfile = {
  profile: { completionPercent?: number; missingFields?: string[] } | null;
  missingLabels?: string[];
};

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    complete
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  }
                >
                  {complete ? "الملف مكتمل ✓" : `الاكتمال ${percent}%`}
                </Badge>
                {!complete && missingCount > 0 && (
                  <span className="text-[11px] text-muted-foreground">
                    {missingCount} حقول ملزمة ناقصة
                  </span>
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
              {complete ? "مراجعة الملف" : "استكمال الملف"}
              <ChevronDown className="h-3.5 w-3.5" />
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
