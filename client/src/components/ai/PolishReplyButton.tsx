import { useMutation } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

export type PolishReplyChannel = "contributor_ticket" | "contact_message";

type PolishReplyButtonProps = {
  draft: string;
  channel: PolishReplyChannel;
  recipientName?: string | null;
  subject?: string | null;
  originalMessage?: string | null;
  onPolished: (reply: string) => void;
  className?: string;
  disabled?: boolean;
};

/** زر «توليد الرد» — يمرّر المسودة لـ AI ويعيد نصاً مهذّباً قابلاً للتعديل قبل الإرسال */
export function PolishReplyButton({
  draft,
  channel,
  recipientName,
  subject,
  originalMessage,
  onPolished,
  className,
  disabled,
}: PolishReplyButtonProps) {
  const { toast } = useToast();

  const polishMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/admin/ai/polish-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft,
          channel,
          recipientName: recipientName || undefined,
          subject: subject || undefined,
          originalMessage: originalMessage || undefined,
        }),
      }) as Promise<{ reply: string }>;
    },
    onSuccess: (data) => {
      if (!data?.reply?.trim()) {
        toast({
          title: "تعذر التوليد",
          description: "لم يُرجع النموذج نصاً صالحاً",
          variant: "destructive",
        });
        return;
      }
      onPolished(data.reply.trim());
      toast({
        title: "تم توليد الرد",
        description: "راجعه وعدّل عليه ثم أرسل",
      });
    },
    onError: (error: any) => {
      toast({
        title: "تعذر توليد الرد",
        description: error?.message || "حاول مرة أخرى",
        variant: "destructive",
      });
    },
  });

  return (
    <Button
      type="button"
      variant="outline"
      className={cn("h-10 gap-2", className)}
      disabled={disabled || polishMutation.isPending || draft.trim().length < 3}
      onClick={() => polishMutation.mutate()}
      data-testid="button-polish-reply"
    >
      {polishMutation.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Sparkles className="h-4 w-4 text-primary" />
      )}
      توليد الرد
    </Button>
  );
}
