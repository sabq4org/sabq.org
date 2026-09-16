import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export const REQUEST_TYPE_LABELS: Record<string, string> = {
  renewal: "تجديد الباقة",
  window_extension: "تمديد فترة النشر",
  other: "طلب آخر",
};

const REQUEST_TYPES = ["renewal", "window_extension", "other"];

interface PublisherRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** النوع المقترح حسب سبب فتح الحوار (نفاد رصيد، انتهاء نافذة، ...) */
  defaultType?: string;
}

export function PublisherRequestDialog({ open, onOpenChange, defaultType }: PublisherRequestDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [type, setType] = useState(defaultType ?? "renewal");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (open) {
      setType(defaultType && REQUEST_TYPES.includes(defaultType) ? defaultType : "renewal");
      setMessage("");
    }
  }, [open, defaultType]);

  const submitMutation = useMutation({
    mutationFn: async () =>
      apiRequest<{ message: string }>("/api/publisher/portal/requests", {
        method: "POST",
        body: JSON.stringify({ type, message: message.trim() || undefined }),
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/publisher/portal/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/publisher/portal/overview"] });
      onOpenChange(false);
      toast({ title: "أُرسل الطلب", description: result?.message ?? "ستتواصل معكم الإدارة قريباً" });
    },
    onError: (error: Error) => {
      toast({
        title: "تعذر إرسال الطلب",
        description: error.message || "حاولوا مرة أخرى بعد قليل",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" data-testid="dialog-publisher-request">
        <DialogHeader>
          <DialogTitle>طلب إلى إدارة سبق</DialogTitle>
          <DialogDescription>
            يصل الطلب فوراً إلى لوحة الإدارة، وستصلكم نتيجته في إشعارات البوابة.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="request-type">نوع الطلب</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="request-type" data-testid="select-request-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REQUEST_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>{REQUEST_TYPE_LABELS[value]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="request-message">تفاصيل (اختياري)</Label>
            <Textarea
              id="request-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="مثال: نحتاج باقة ٥٠ مادة لتغطية موسم الرياض"
              rows={3}
              maxLength={1000}
              dir="rtl"
              data-testid="input-request-message"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
            data-testid="button-submit-request"
          >
            {submitMutation.isPending ? "جاري الإرسال..." : "إرسال الطلب"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
