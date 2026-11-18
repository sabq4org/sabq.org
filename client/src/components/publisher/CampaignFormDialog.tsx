import { useEffect, useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CampaignInput } from "@shared/publisherCampaigns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  pending: boolean;
  initial?: Partial<CampaignInput>;
  onSubmit: (input: CampaignInput) => void;
}

/** إنشاء حملة أو تعديل بياناتها: الاسم إلزامي، والباقي اختياري. */
export function CampaignFormDialog({ open, onOpenChange, title, submitLabel, pending, initial, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setClientName(initial?.clientName ?? "");
    setStartsOn(initial?.startsOn ?? "");
    setEndsOn(initial?.endsOn ?? "");
    setNote(initial?.note ?? "");
    setError(null);
  }, [open, initial?.name, initial?.clientName, initial?.startsOn, initial?.endsOn, initial?.note]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 3) return setError("اكتب اسم الحملة (3 أحرف على الأقل)");
    if (startsOn && endsOn && startsOn > endsOn) return setError("تاريخ النهاية قبل تاريخ البداية");
    setError(null);
    onSubmit({
      name: name.trim(),
      clientName: clientName.trim() || null,
      startsOn: startsOn || null,
      endsOn: endsOn || null,
      note: note.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="campaign-name">اسم الحملة *</Label>
            <Input
              id="campaign-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: معرض الرياض للعقار 2026"
              data-testid="input-campaign-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campaign-client">العميل</Label>
            <Input
              id="campaign-client"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="اسم عميلكم كما يظهر في التقرير"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="campaign-start">تبدأ</Label>
              <Input id="campaign-start" type="date" dir="ltr" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-end">تنتهي</Label>
              <Input id="campaign-end" type="date" dir="ltr" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campaign-note">ملاحظة داخلية</Label>
            <Textarea id="campaign-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="لا تظهر في التقرير" />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter className="gap-2 sm:justify-start">
            <Button type="submit" className="rounded-full" disabled={pending} data-testid="button-save-campaign">
              {pending ? "جارٍ الحفظ..." : submitLabel}
            </Button>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
