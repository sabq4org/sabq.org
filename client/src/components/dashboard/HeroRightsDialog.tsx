import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShieldAlert, ShieldCheck, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const LICENSE_TYPES = [
  { value: "original", label: "إنتاج سبق (أصلية)" },
  { value: "agency", label: "وكالة أنباء" },
  { value: "licensed", label: "مرخّصة / مشتراة" },
  { value: "official", label: "مصدر رسمي (واس، هيئات…)" },
  { value: "social", label: "مواقع التواصل (بإذن/إسناد)" },
  { value: "unknown", label: "غير معروف" },
];

interface HeroRightsDialogProps {
  open: boolean;
  mediaId: string | null;
  /** متابعة النشر (بعد التوثيق أو بتجاوز واعٍ) */
  onContinue: () => void;
  /** إلغاء النشر والبقاء في المحرر */
  onCancel: () => void;
}

/**
 * حاجز الحقوق (المرحلة ٣ — غير مانع): يظهر عند نشر خبر صورته البارزة بلا
 * حقوق موثّقة. يتيح توثيقها في ثوانٍ من داخل المحرر (يُحفظ في مكتبة
 * الوسائط فيستفيد كل استخدام لاحق للصورة)، أو المتابعة بوعي، أو الإلغاء.
 */
export function HeroRightsDialog({ open, mediaId, onContinue, onCancel }: HeroRightsDialogProps) {
  const { toast } = useToast();
  const [licenseType, setLicenseType] = useState<string>("");
  const [creditText, setCreditText] = useState("");
  const [copyrightHolder, setCopyrightHolder] = useState("");
  const [saving, setSaving] = useState(false);

  const documentAndContinue = async () => {
    if (!mediaId) return;
    if (!licenseType && !creditText.trim()) {
      toast({
        title: "أكمل التوثيق",
        description: "حدّد نوع الرخصة أو اكتب نص الإسناد على الأقل",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      await apiRequest(`/api/media/${mediaId}`, {
        method: "PUT",
        body: JSON.stringify({
          licenseType: licenseType || null,
          creditText: creditText.trim() || null,
          copyrightHolder: copyrightHolder.trim() || null,
          rightsVerified: true,
        }),
        headers: { "Content-Type": "application/json" },
      });
      toast({
        title: "تم توثيق الحقوق",
        description: "حُفظ التوثيق في مكتبة الوسائط وسيظهر في كل استخدام قادم للصورة",
      });
      onContinue();
    } catch (error: any) {
      // 403 = ليس مالك الصورة ولا يملك media.edit — لا نعطّل النشر بسبب ذلك
      toast({
        title: "تعذّر حفظ التوثيق",
        description: error?.message || "يمكنك المتابعة ثم توثيقها لاحقًا من مكتبة الوسائط",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent dir="rtl" className="max-w-md" data-testid="dialog-hero-rights">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            الصورة البارزة بلا حقوق موثّقة
          </DialogTitle>
          <DialogDescription>
            وثّق حقوق استخدام الصورة قبل النشر — يُحفظ التوثيق في المكتبة مرة واحدة
            ويغني عن تكراره في كل خبر يستخدمها.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>نوع الرخصة</Label>
            <Select value={licenseType} onValueChange={setLicenseType}>
              <SelectTrigger data-testid="select-license-type">
                <SelectValue placeholder="اختر نوع الرخصة" />
              </SelectTrigger>
              <SelectContent>
                {LICENSE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>نص الإسناد (Credit)</Label>
            <Input
              value={creditText}
              onChange={(e) => setCreditText(e.target.value)}
              placeholder="مثال: تصوير — واس"
              data-testid="input-credit-text"
            />
          </div>
          <div className="space-y-1.5">
            <Label>صاحب الحقوق (اختياري)</Label>
            <Input
              value={copyrightHolder}
              onChange={(e) => setCopyrightHolder(e.target.value)}
              placeholder="مثال: وكالة الأنباء السعودية"
              data-testid="input-copyright-holder"
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={saving}
            data-testid="button-rights-cancel"
          >
            إلغاء النشر
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onContinue}
              disabled={saving}
              data-testid="button-rights-skip"
            >
              نشر بدون توثيق
            </Button>
            <Button
              onClick={documentAndContinue}
              disabled={saving}
              className="gap-1.5"
              data-testid="button-rights-document"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              توثيق ونشر
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
