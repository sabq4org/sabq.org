import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDateShort } from "@/lib/format";
import type { PublisherCredit } from "@shared/schema";

/**
 * تواريخ الانتهاء محفوظة كمنتصف ليل الرياض بعد اليوم الأخير (21:00 UTC من اليوم نفسه)،
 * فاليوم الذي يختاره المدير هو آخر يوم تعمل فيه الباقة.
 */
export const expiryToDay = (expiry: string | Date | null) => (expiry ? new Date(expiry).toISOString().slice(0, 10) : "");
export const dayToExpiry = (day: string) => `${day}T21:00:00.000Z`;

export function EditCreditExpiryDialog({
  publisherId,
  credit,
  onClose,
}: {
  publisherId: string;
  credit: PublisherCredit | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [day, setDay] = useState("");

  useEffect(() => {
    setDay(expiryToDay(credit?.expiryDate ?? null));
  }, [credit]);

  const save = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/admin/publishers/${publisherId}/credits/${credit!.id}`, {
        method: "PATCH",
        body: JSON.stringify({ expiryDate: dayToExpiry(day) }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/publishers/${publisherId}/credits`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/publisher-reports/${publisherId}`] });
      toast({ title: "تم تعديل تاريخ الانتهاء" });
      onClose();
    },
    onError: () => toast({ title: "خطأ", description: "تعذر تعديل تاريخ الانتهاء", variant: "destructive" }),
  });

  const startDay = expiryToDay(credit?.startDate ?? null);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(day) && (!startDay || day >= startDay);

  return (
    <Dialog open={!!credit} onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>تعديل تاريخ انتهاء الباقة</DialogTitle>
          <DialogDescription>{credit?.packageName}. اختر آخر يوم تعمل فيه الباقة.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="credit-expiry">آخر يوم</Label>
          <Input
            id="credit-expiry"
            type="date"
            value={day}
            min={startDay || undefined}
            onChange={(e) => setDay(e.target.value)}
            data-testid="input-credit-expiry"
          />
          {valid ? (
            <p className="text-xs text-muted-foreground">
              تتوقف الباقة مع بداية يوم {formatDateShort(dayToExpiry(day))} بتوقيت الرياض، وهو التاريخ الذي يظهر في الجدول.
            </p>
          ) : null}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!valid || save.isPending || day === expiryToDay(credit?.expiryDate ?? null)}
            data-testid="button-save-credit-expiry"
          >
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
