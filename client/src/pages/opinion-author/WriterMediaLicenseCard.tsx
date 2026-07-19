import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BadgeCheck, CheckCircle2, ExternalLink, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type MediaLicenseStatus = {
  submitted: boolean;
  licenseNumber: string | null;
  submittedAt: string | null;
  deadline: string;
  gmediaRegisterUrl: string;
};

function formatDeadlineAr(isoDate: string): string {
  try {
    return new Date(`${isoDate}T12:00:00`).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "نهاية هذا الشهر";
  }
}

export function WriterMediaLicenseCard() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseFile, setLicenseFile] = useState<File | null>(null);

  const { data, isLoading } = useQuery<MediaLicenseStatus>({
    queryKey: ["/api/opinion-author/media-license"],
    staleTime: 60 * 1000,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!licenseNumber.trim() || licenseNumber.trim().length < 3) {
        throw new Error("يرجى إدخال رقم الترخيص المهني");
      }
      if (!licenseFile) {
        throw new Error("يرجى إرفاق صورة الترخيص أو ملف PDF");
      }
      const formData = new FormData();
      formData.append("licenseNumber", licenseNumber.trim());
      formData.append("licenseFile", licenseFile);
      return apiRequest<MediaLicenseStatus & { message: string }>("/api/opinion-author/media-license", {
        method: "POST",
        body: formData,
        isFormData: true,
      });
    },
    onSuccess: (result) => {
      queryClient.setQueryData(["/api/opinion-author/media-license"], {
        submitted: true,
        licenseNumber: result.licenseNumber,
        submittedAt: result.submittedAt,
        deadline: result.deadline,
        gmediaRegisterUrl: result.gmediaRegisterUrl,
      });
      setLicenseFile(null);
      toast({
        title: "شكراً لك",
        description: result.message || "تم استلام بيانات الترخيص بنجاح",
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

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast({
        variant: "destructive",
        title: "نوع الملف غير مدعوم",
        description: "الرجاء اختيار صورة أو ملف PDF",
      });
      e.target.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "حجم الملف كبير",
        description: "الحد الأقصى 10 ميجابايت",
      });
      e.target.value = "";
      return;
    }
    setLicenseFile(file);
  };

  if (isLoading || !data) {
    return null;
  }

  if (data.submitted) {
    return (
      <section
        className="rounded-xl border border-border bg-card"
        dir="rtl"
        data-testid="writer-media-license-thanks"
      >
        <div className="flex items-start gap-3 p-4 sm:p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-base font-bold tracking-tight">
              شكراً لك — وصلنا ترخيصك المهني
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              نقدّر تعاونك. تم حفظ بيانات الترخيص
              {data.licenseNumber ? (
                <>
                  {" "}
                  (<span className="font-medium text-foreground" dir="ltr">{data.licenseNumber}</span>)
                </>
              ) : null}
              {" "}بنجاح.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const deadlineLabel = formatDeadlineAr(data.deadline);

  return (
    <section
      className="rounded-xl border border-border bg-card"
      dir="rtl"
      data-testid="writer-media-license-card"
    >
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BadgeCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1.5">
            <p className="text-base font-bold tracking-tight">
              الترخيص المهني يعزّز حضورك ومصداقيتك
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              وفق توجيهات هيئة تنظيم الإعلام، نرجو تزويدنا برقم ترخيصك المهني وإرفاق صورة منه.
              لديك مهلة حتى <strong className="text-foreground">{deadlineLabel}</strong>.
            </p>
            <a
              href={data.gmediaRegisterUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              ليس لديك ترخيص بعد؟ سجّل عبر منصة الهيئة
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="space-y-2">
          <Label htmlFor="writer-license-number">رقم الترخيص المهني</Label>
          <Input
            id="writer-license-number"
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
            placeholder="أدخل رقم الترخيص"
            data-testid="input-writer-license-number"
          />
        </div>

        <div className="space-y-2">
          <Label>صورة الترخيص أو PDF</Label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={onFileChange}
            data-testid="input-writer-license-file"
          />
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => fileInputRef.current?.click()}
            data-testid="button-writer-license-file"
          >
            <Upload className="h-4 w-4" />
            {licenseFile ? licenseFile.name : "اختر ملفاً للرفع"}
          </Button>
        </div>

        <Button
          type="button"
          className="w-full gap-2 sm:w-auto"
          disabled={submitMutation.isPending}
          onClick={() => submitMutation.mutate()}
          data-testid="button-writer-license-submit"
        >
          {submitMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري الإرسال...
            </>
          ) : (
            "إرسال الترخيص"
          )}
        </Button>
      </div>
    </section>
  );
}
