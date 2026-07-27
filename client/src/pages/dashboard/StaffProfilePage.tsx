// صفحة ملف المنسوب — /dashboard/staff-profiles/:userId
// الرأس الداكن + اعتماد / طلب تصحيح + الفورم.

import { useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StaffProfileForm } from "@/components/staff/StaffProfileForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowRight, CheckCircle2, Loader2, MessageSquareWarning } from "lucide-react";

type ReviewStatus = "draft" | "pending_review" | "approved" | "needs_correction";

const REVIEW_LABELS: Record<ReviewStatus, string> = {
  draft: "مسودة",
  pending_review: "قيد المراجعة",
  approved: "معتمد",
  needs_correction: "يحتاج تصحيحاً",
};

export default function StaffProfilePage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const { toast } = useToast();
  const [correctionNote, setCorrectionNote] = useState("");
  const [showCorrection, setShowCorrection] = useState(false);

  const queryKey = [`/api/staff-profiles/${userId}`];
  const { data: dataRaw } = useQuery({ queryKey, enabled: Boolean(userId) });
  const data = (dataRaw ?? null) as {
    user?: { firstName: string | null; lastName: string | null; email: string; profileImageUrl: string | null };
    profile?: {
      employeeNumber?: string | null;
      completionPercent?: number;
      profileReviewStatus?: ReviewStatus | null;
      profileReviewNote?: string | null;
    } | null;
  } | null;

  const name = data?.user
    ? [data.user.firstName, data.user.lastName].filter(Boolean).join(" ") || data.user.email
    : "…";
  const percent = data?.profile?.completionPercent ?? 0;
  const reviewStatus = (data?.profile?.profileReviewStatus ?? "draft") as ReviewStatus;
  const reviewNote = data?.profile?.profileReviewNote ?? null;
  const canApprove = Boolean(data?.profile) && percent >= 100 && reviewStatus !== "approved";

  const approveMutation = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/staff-profiles/${userId}/approve`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/staff-profiles"] });
      toast({
        title: "تم اعتماد الملف",
        description: "يمكن للمنسوب الآن إصدار شهادة التعريف وتنزيلها",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "تعذر الاعتماد",
        description: error.message || "حاول مرة أخرى",
      });
    },
  });

  const correctionMutation = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/staff-profiles/${userId}/request-correction`, {
        method: "POST",
        body: JSON.stringify({ note: correctionNote.trim() }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/staff-profiles"] });
      setCorrectionNote("");
      setShowCorrection(false);
      toast({
        title: "طُلب التصحيح",
        description: "سيظهر للمنسوب طلب التصحيح في بطاقة ملفه",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "تعذر طلب التصحيح",
        description: error.message || "أدخل ملاحظة واضحة",
      });
    },
  });

  return (
    <DashboardLayout>
      <div dir="rtl" className="space-y-4 p-1">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-3 sm:gap-4 sm:p-5">
          <Link href="/dashboard/staff-profiles">
            <Button size="icon" variant="ghost" className="shrink-0 text-muted-foreground"><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          {data?.user?.profileImageUrl ? (
            <img src={data.user.profileImageUrl} alt="" className="h-12 w-12 shrink-0 rounded-full border-2 border-sky-500/30 object-cover sm:h-14 sm:w-14" />
          ) : (
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-sky-500/15 text-lg font-black text-sky-600 sm:h-14 sm:w-14">
              {name.slice(0, 1)}
            </div>
          )}
          <div className="min-w-0 flex-1 basis-[12rem]">
            <h1 className="truncate text-base font-black text-foreground sm:text-lg">{name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="inline-block rounded-full bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-bold text-sky-600" dir="ltr">
                {data?.profile?.employeeNumber ?? "بلا رقم وظيفي بعد"}
              </span>
              <Badge
                variant="outline"
                className={
                  reviewStatus === "approved"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                    : reviewStatus === "pending_review"
                      ? "border-sky-500/40 bg-sky-500/10 text-sky-700"
                      : reviewStatus === "needs_correction"
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-700"
                        : ""
                }
                data-testid="badge-profile-review-status"
              >
                {REVIEW_LABELS[reviewStatus]}
              </Badge>
            </div>
            {reviewStatus === "needs_correction" && reviewNote && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">ملاحظة التصحيح: {reviewNote}</p>
            )}
          </div>
          <div className="mr-auto shrink-0 text-center">
            <div
              className="grid h-14 w-14 place-items-center rounded-full sm:h-16 sm:w-16"
              style={{ background: `conic-gradient(#1CA4F0 ${percent}%, hsl(var(--muted)) 0)` }}
            >
              <div className="grid h-10 w-10 place-items-center rounded-full bg-card text-sm font-black text-foreground sm:h-12 sm:w-12">{percent}%</div>
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">اكتمال الملف</div>
          </div>
        </div>

        {data?.profile && (
          <div className="space-y-3 rounded-2xl border bg-card p-4" data-testid="panel-profile-review-actions">
            <p className="text-sm text-muted-foreground">
              راجع المسمى الوظيفي وتاريخ الالتحاق والبيانات الحساسة، عدّل إن لزم، ثم اعتمد الملف ليفتح للمنسوب إصدار شهادة التعريف.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => approveMutation.mutate()}
                disabled={!canApprove || approveMutation.isPending}
                data-testid="button-approve-staff-profile"
              >
                {approveMutation.isPending ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="ml-2 h-4 w-4" />
                )}
                اعتماد الملف
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowCorrection((v) => !v)}
                data-testid="button-toggle-correction"
              >
                <MessageSquareWarning className="ml-2 h-4 w-4" />
                طلب تصحيح
              </Button>
            </div>
            {showCorrection && (
              <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
                <Label htmlFor="correction-note">ملاحظة للمنسوب (مطلوبة)</Label>
                <Textarea
                  id="correction-note"
                  rows={3}
                  value={correctionNote}
                  onChange={(e) => setCorrectionNote(e.target.value)}
                  placeholder="مثال: صحّح المسمى الوظيفي أو تاريخ الالتحاق…"
                  data-testid="input-correction-note"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!correctionNote.trim() || correctionMutation.isPending}
                  onClick={() => correctionMutation.mutate()}
                  data-testid="button-submit-correction"
                >
                  {correctionMutation.isPending ? (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  ) : null}
                  إرسال طلب التصحيح
                </Button>
              </div>
            )}
          </div>
        )}

        {userId && <StaffProfileForm userId={userId} mode="page" />}
      </div>
    </DashboardLayout>
  );
}
