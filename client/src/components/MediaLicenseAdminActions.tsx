import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, MessageSquareWarning, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type Props = {
  personName: string;
  invalidateQueryKey: unknown[];
  correctionEndpoint: string;
  approveEndpoint: string;
  rejectEndpoint: string;
  existingNote?: string | null;
  needsCorrection?: boolean;
  pendingReview?: boolean;
  hasFile?: boolean;
  testIdPrefix?: string;
};

const DEFAULT_CORRECTION_NOTE =
  "الملف المرفوع ليس صورة الترخيص المهني. يرجى رفع صورة واضحة لبطاقة الترخيص الصادرة من هيئة تنظيم الإعلام.";

export function MediaLicenseAdminActions({
  personName,
  invalidateQueryKey,
  correctionEndpoint,
  approveEndpoint,
  rejectEndpoint,
  existingNote,
  needsCorrection,
  pendingReview,
  hasFile,
  testIdPrefix = "license",
}: Props) {
  const { toast } = useToast();
  const [dialogMode, setDialogMode] = useState<"correction" | "reject" | null>(null);
  const [note, setNote] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: invalidateQueryKey });
  };

  const correctionMutation = useMutation({
    mutationFn: async () => {
      const trimmed = note.trim();
      if (trimmed.length < 5) throw new Error("اكتب ملاحظة واضحة (٥ أحرف على الأقل)");
      return apiRequest(correctionEndpoint, {
        method: "POST",
        body: JSON.stringify({ note: trimmed }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      invalidate();
      setDialogMode(null);
      setNote("");
      toast({
        title: "تم إرسال طلب التصحيح",
        description: `ستظهر الملاحظة لـ ${personName} ويُطلب منه إعادة الرفع.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "تعذر الإرسال",
        description: error.message || "حاول مرة أخرى",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const trimmed = note.trim();
      if (trimmed.length < 5) throw new Error("اكتب ملاحظة واضحة (٥ أحرف على الأقل)");
      return apiRequest(rejectEndpoint, {
        method: "POST",
        body: JSON.stringify({ note: trimmed }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      invalidate();
      setDialogMode(null);
      setNote("");
      toast({
        title: "تم رفض الملف",
        description: `طُلب من ${personName} إعادة رفع الترخيص.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "تعذر الرفض",
        description: error.message || "حاول مرة أخرى",
        variant: "destructive",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () =>
      apiRequest(approveEndpoint, {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      invalidate();
      toast({
        title: "تم اعتماد الترخيص",
        description: `أصبحت شارة ${personName} «مرخّص».`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "تعذر الاعتماد",
        description: error.message || "حاول مرة أخرى",
        variant: "destructive",
      });
    },
  });

  const busy =
    correctionMutation.isPending || rejectMutation.isPending || approveMutation.isPending;

  return (
    <>
      {pendingReview ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-900"
            title="اعتماد الترخيص بعد الاطلاع على الملف"
            disabled={busy || !hasFile}
            onClick={() => approveMutation.mutate()}
            data-testid={`button-approve-${testIdPrefix}`}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-rose-700 hover:bg-rose-50 hover:text-rose-900"
            title="رفض الملف وطلب تصحيح"
            disabled={busy}
            onClick={() => {
              setNote(existingNote?.trim() || DEFAULT_CORRECTION_NOTE);
              setDialogMode("reject");
            }}
            data-testid={`button-reject-${testIdPrefix}`}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-amber-700 hover:bg-amber-50 hover:text-amber-900"
          title={needsCorrection ? "تعديل ملاحظة التصحيح" : "طلب تصحيح ملف الترخيص"}
          disabled={busy || !hasFile}
          onClick={() => {
            setNote(existingNote?.trim() || DEFAULT_CORRECTION_NOTE);
            setDialogMode("correction");
          }}
          data-testid={`button-request-correction-${testIdPrefix}`}
        >
          <MessageSquareWarning className="h-3.5 w-3.5" />
        </Button>
      )}

      <Dialog
        open={dialogMode != null}
        onOpenChange={(open) => {
          if (!open) setDialogMode(null);
        }}
      >
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "reject" ? "رفض ملف الترخيص" : "طلب تصحيح الترخيص"}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === "reject" ? (
                <>
                  ستُعاد حالة <strong>{personName}</strong> إلى «يحتاج تصحيحاً» وتظهر الملاحظة له.
                </>
              ) : (
                <>
                  ستظهر هذه الملاحظة لـ <strong>{personName}</strong> ويُطلب منه إعادة رفع الملف.
                  لن يُحتسب الترخيص سارياً حتى يُعتمد بعد إعادة الرفع.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="license-admin-note">الملاحظة</Label>
            <Textarea
              id="license-admin-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="مثال: الملف المرفوع ليس الترخيص المهني…"
              data-testid="input-license-correction-note"
            />
            <p className="text-xs text-muted-foreground">{note.trim().length}/1000</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDialogMode(null)}>
              إلغاء
            </Button>
            <Button
              type="button"
              variant={dialogMode === "reject" ? "destructive" : "default"}
              onClick={() =>
                dialogMode === "reject"
                  ? rejectMutation.mutate()
                  : correctionMutation.mutate()
              }
              disabled={busy || note.trim().length < 5}
              data-testid="button-submit-license-correction"
            >
              {busy
                ? "جاري الإرسال…"
                : dialogMode === "reject"
                  ? "رفض وطلب تصحيح"
                  : "إرسال للكاتب/المراسل"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
