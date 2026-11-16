import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { TrustedEmailSender } from "@shared/schema";

type ExpiryOption = "6m" | "1y" | "none";

const EXPIRY_OPTIONS: Array<{ value: ExpiryOption; label: string }> = [
  { value: "6m", label: "6 أشهر" },
  { value: "1y", label: "سنة" },
  { value: "none", label: "بلا انتهاء" },
];

interface RotateTokenDialogProps {
  sender: TrustedEmailSender | null;
  onOpenChange: (open: boolean) => void;
}

/** تدوير رمز النشر: يُختار الانتهاء، ثم يصدر الخادم رمزًا جديدًا ويبقى القديم يعمل 48 ساعة. */
export function RotateTokenDialog({ sender, onOpenChange }: RotateTokenDialogProps) {
  const { toast } = useToast();
  const [expiry, setExpiry] = useState<ExpiryOption>("1y");
  const [rotated, setRotated] = useState<TrustedEmailSender | null>(null);
  const [oldStopped, setOldStopped] = useState(false);

  useEffect(() => {
    setExpiry("1y");
    setRotated(null);
    setOldStopped(false);
  }, [sender?.id]);

  const refreshSenders = () => queryClient.invalidateQueries({ queryKey: ["/api/email-agent/senders"] });

  const rotateMutation = useMutation({
    mutationFn: async (): Promise<TrustedEmailSender> => {
      const res = await apiRequest(`/api/email-agent/senders/${sender!.id}/rotate-token`, {
        method: "POST",
        body: JSON.stringify({ expiry }),
      });
      return res as TrustedEmailSender;
    },
    onSuccess: (updated) => {
      setRotated(updated);
      refreshSenders();
    },
    onError: (error: Error) => {
      toast({ title: "تعذّر تدوير الرمز", description: error.message, variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/email-agent/senders/${sender!.id}/revoke-previous-token`, { method: "POST" }),
    onSuccess: () => {
      setOldStopped(true);
      refreshSenders();
    },
    onError: (error: Error) => {
      toast({ title: "تعذّر إيقاف الرمز القديم", description: error.message, variant: "destructive" });
    },
  });

  // المهلة 48 ساعة ولا تتجاوز انتهاء الرمز القديم؛ المنتهي أصلًا لا مهلة له.
  const graceUntil = rotated?.previousTokenValidUntil ? new Date(rotated.previousTokenValidUntil) : null;
  const graceHours = graceUntil ? Math.max(1, Math.round((graceUntil.getTime() - Date.now()) / 3_600_000)) : 0;
  const oldInactive = oldStopped || !graceUntil;
  const graceLabel = graceHours >= 47 ? "48 ساعة" : `${graceHours} ساعة`;

  const copyToken = async () => {
    if (!rotated?.token) return;
    try {
      await navigator.clipboard.writeText(rotated.token);
      toast({ title: "تم النسخ", description: "أرسل الرمز الجديد للمراسل." });
    } catch {
      toast({ title: "تعذّر النسخ", description: "انسخ الرمز يدويًا.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={!!sender} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md rounded-[22px] p-6">
        <DialogHeader className="space-y-1 text-right">
          <p className="text-[13px] text-muted-foreground">{sender?.name}</p>
          <DialogTitle className="text-[22px] font-bold">رمز نشر جديد</DialogTitle>
          <DialogDescription className="text-[13px] leading-6">
            {rotated
              ? "انسخ الرمز وأرسله للمراسل. يضعه في عنوان رسالته أو نصها بدل القديم."
              : "يصدر الخادم رمزًا جديدًا، ويبقى القديم يعمل 48 ساعة حتى يبدّله المراسل."}
          </DialogDescription>
        </DialogHeader>

        {rotated ? (
          <div className="space-y-4">
            <div className="space-y-3 rounded-[18px] bg-[#E6F4FD] p-4">
              <p className="text-[13px] font-semibold text-[#0B6FA8]">الرمز الجديد</p>
              <code dir="ltr" className="block break-all text-left font-mono text-sm leading-7 text-[#1B2B3A]" data-testid="text-new-token">
                {rotated.token}
              </code>
              <Button onClick={copyToken} className="h-11 rounded-full bg-[#1E9BE6] px-6 text-white hover:bg-[#1787cc]" data-testid="button-copy-new-token">
                نسخ الرمز
              </Button>
            </div>

            <div className="flex items-center justify-between gap-3 border-b border-[#EEF2F6] pb-3">
              <div>
                <p className="text-[15px] font-semibold">الرمز القديم</p>
                <p className="text-[13px] text-muted-foreground">
                  {oldInactive ? "لا يقبل النشر الآن" : "يبقى يعمل حتى يبدّله المراسل"}
                </p>
              </div>
              <span className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${oldInactive ? "bg-[#FDECEC] text-[#BF3038]" : "bg-[#FFF6E5] text-[#946000]"}`}>
                {oldInactive ? "موقوف" : graceLabel}
              </span>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <Button onClick={() => onOpenChange(false)} className="h-[46px] rounded-full bg-[#1E9BE6] px-7 text-[15px] text-white hover:bg-[#1787cc]" data-testid="button-rotate-done">
                تم
              </Button>
              {!oldInactive && (
                <Button
                  variant="ghost"
                  onClick={() => revokeMutation.mutate()}
                  disabled={revokeMutation.isPending}
                  className="h-[46px] rounded-full bg-[#FDECEC] px-5 text-[15px] text-[#BF3038] hover:bg-[#fbdcdc] hover:text-[#BF3038]"
                  data-testid="button-revoke-previous-token"
                >
                  أوقف القديم الآن
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-[15px] font-semibold">انتهاء الرمز الجديد</p>
              <p className="text-[13px] text-muted-foreground">تنبيه في الصفحة قبل الانتهاء بـ 14 يومًا</p>
              <div className="flex flex-wrap gap-2 pt-1" role="radiogroup" aria-label="انتهاء الرمز الجديد">
                {EXPIRY_OPTIONS.map((option) => {
                  const selected = option.value === expiry;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setExpiry(option.value)}
                      className={`h-11 rounded-full px-5 text-sm transition-colors ${selected ? "bg-[#1E9BE6] font-semibold text-white" : "bg-white text-[#1B2B3A] shadow-[0_2px_8px_rgba(27,43,58,.08)]"}`}
                      data-testid={`option-expiry-${option.value}`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Button
                onClick={() => rotateMutation.mutate()}
                disabled={rotateMutation.isPending || !sender}
                className="h-[46px] rounded-full bg-[#1E9BE6] px-7 text-[15px] text-white hover:bg-[#1787cc]"
                data-testid="button-confirm-rotate"
              >
                {rotateMutation.isPending ? "جارٍ الإصدار…" : "أصدر رمزًا جديدًا"}
              </Button>
              <Button variant="ghost" onClick={() => onOpenChange(false)} className="h-[46px] rounded-full px-5 text-[15px]">
                إلغاء
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
