import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BadgeCheck, CheckCircle2, ExternalLink, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type MediaLicenseStatus = {
  submitted: boolean;
  valid: boolean;
  expired: boolean;
  expiringSoon: boolean;
  licenseNumber: string | null;
  submittedAt: string | null;
  expiresAt: string | null;
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

function formatExpiresAr(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

/** نهاية المهلة بنهاية يوم الرياض (UTC+3) */
function deadlineEndMs(deadlineIso: string): number {
  return new Date(`${deadlineIso}T23:59:59+03:00`).getTime();
}

function useDeadlineCountdown(deadlineIso: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const end = deadlineEndMs(deadlineIso);
  const ms = Math.max(0, end - now);
  const totalSec = Math.floor(ms / 1000);
  return {
    days: Math.floor(totalSec / 86400),
    hours: Math.floor((totalSec % 86400) / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
    expired: ms <= 0,
  };
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex min-w-[3.25rem] flex-col items-center rounded-xl border border-border bg-background/80 px-2 py-1.5 shadow-sm">
      <span className="text-lg font-bold tabular-nums tracking-tight text-foreground sm:text-xl" dir="ltr">
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function LicenseDeadlineCountdown({ deadline }: { deadline: string }) {
  const { days, hours, minutes, seconds, expired } = useDeadlineCountdown(deadline);
  const deadlineLabel = formatDeadlineAr(deadline);

  if (expired) {
    return (
      <div
        className="rounded-xl border border-amber-300/70 bg-amber-50/90 px-3 py-2.5 dark:border-amber-800/50 dark:bg-amber-950/40"
        data-testid="writer-license-countdown-expired"
      >
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          انتهت المهلة ({deadlineLabel}) — أرسل ترخيصك في أقرب وقت
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-3"
      data-testid="writer-license-countdown"
    >
      <p className="mb-2 text-xs text-muted-foreground">
        تبقّى على المهلة حتى <strong className="text-foreground">{deadlineLabel}</strong>
      </p>
      <div className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-start sm:gap-2">
        <CountdownUnit value={days} label="يوم" />
        <span className="pb-3 text-muted-foreground">:</span>
        <CountdownUnit value={hours} label="ساعة" />
        <span className="pb-3 text-muted-foreground">:</span>
        <CountdownUnit value={minutes} label="دقيقة" />
        <span className="pb-3 text-muted-foreground">:</span>
        <CountdownUnit value={seconds} label="ثانية" />
      </div>
    </div>
  );
}

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // تاريخ تقويمي بتوقيت الرياض
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return y && m && day ? `${y}-${m}-${day}` : "";
}

type WriterMediaLicenseCardProps = {
  /** مسار API للترخيص — افتراضي لكتّاب الرأي */
  endpoint?: string;
};

export function WriterMediaLicenseCard({
  endpoint = "/api/opinion-author/media-license",
}: WriterMediaLicenseCardProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseExpiresAt, setLicenseExpiresAt] = useState("");
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [prefilled, setPrefilled] = useState(false);
  const [forceShowForm, setForceShowForm] = useState(false);

  const { data, isLoading } = useQuery<MediaLicenseStatus>({
    queryKey: [endpoint],
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (!data || prefilled) return;
    if (data.licenseNumber) setLicenseNumber(data.licenseNumber);
    if (data.expiresAt) setLicenseExpiresAt(toDateInputValue(data.expiresAt));
    setPrefilled(true);
  }, [data, prefilled]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!licenseNumber.trim() || licenseNumber.trim().length < 3) {
        throw new Error("يرجى إدخال رقم الترخيص المهني");
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(licenseExpiresAt.trim())) {
        throw new Error("يرجى إدخال تاريخ انتهاء الترخيص");
      }
      if (!licenseFile) {
        throw new Error("يرجى إرفاق صورة الترخيص أو ملف PDF");
      }
      const formData = new FormData();
      formData.append("licenseNumber", licenseNumber.trim());
      formData.append("licenseExpiresAt", licenseExpiresAt.trim());
      formData.append("licenseFile", licenseFile);
      return apiRequest<MediaLicenseStatus & { message: string }>(endpoint, {
        method: "POST",
        body: formData,
        isFormData: true,
      });
    },
    onSuccess: (result) => {
      queryClient.setQueryData([endpoint], {
        submitted: result.submitted,
        valid: result.valid,
        expired: result.expired,
        expiringSoon: result.expiringSoon,
        licenseNumber: result.licenseNumber,
        submittedAt: result.submittedAt,
        expiresAt: result.expiresAt,
        deadline: result.deadline,
        gmediaRegisterUrl: result.gmediaRegisterUrl,
      });
      setLicenseFile(null);
      setForceShowForm(false);
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

  if (data.valid && !forceShowForm) {
    const expiresLabel = formatExpiresAr(data.expiresAt);
    if (data.expiringSoon) {
      return (
        <section
          className="rounded-xl border border-red-300 bg-red-50 dark:border-red-800/60 dark:bg-red-950/40"
          dir="rtl"
          data-testid="writer-media-license-renewal-warn"
        >
          <div className="flex items-start gap-3 p-4 sm:p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">
              <BadgeCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-2">
              <p className="text-base font-bold tracking-tight text-red-800 dark:text-red-200">
                تنبيه: يتبقّى أقل من شهرين على انتهاء ترخيصك
              </p>
              <p className="text-sm leading-relaxed text-red-900/90 dark:text-red-100/90">
                يجب تجديد الترخيص المهني للاستمرار.
                {expiresLabel ? (
                  <>
                    {" "}
                    تاريخ الانتهاء: <strong>{expiresLabel}</strong>.
                  </>
                ) : null}
              </p>
              <a
                href={data.gmediaRegisterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-semibold text-red-700 underline hover:text-red-900 dark:text-red-300"
              >
                جدّد عبر منصة هيئة تنظيم الإعلام
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <p className="text-xs text-red-800/80 dark:text-red-200/70">
                بعد التجديد، أعد إدخال رقم الترخيص وتاريخ الانتهاء الجديد وملف الترخيص من هنا.
              </p>
              <Button
                type="button"
                variant="destructive"
                className="mt-1"
                onClick={() => setForceShowForm(true)}
                data-testid="button-writer-license-renew-form"
              >
                تحديث بيانات الترخيص الآن
              </Button>
            </div>
          </div>
        </section>
      );
    }
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
              {" "}بنجاح
              {expiresLabel ? (
                <>
                  {" "}
                  — ساري حتى <span className="font-medium text-foreground">{expiresLabel}</span>
                </>
              ) : null}
              .
            </p>
          </div>
        </div>
      </section>
    );
  }

  const isRenewal = data.expired || forceShowForm || data.expiringSoon;

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
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="space-y-1.5">
              <p className="text-base font-bold tracking-tight">
                {isRenewal
                  ? "ترخيصك منتهٍ أو ناقص تاريخ الانتهاء — حدّث بياناتك"
                  : "الترخيص المهني يعزّز حضورك ومصداقيتك"}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                وفق توجيهات هيئة تنظيم الإعلام، نرجو تزويدنا برقم ترخيصك المهني وتاريخ انتهائه وإرفاق صورة منه.
              </p>
            </div>
            {!isRenewal && <LicenseDeadlineCountdown deadline={data.deadline} />}
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
          <Label htmlFor="writer-license-expires">تاريخ انتهاء الترخيص</Label>
          <Input
            id="writer-license-expires"
            type="date"
            value={licenseExpiresAt}
            onChange={(e) => setLicenseExpiresAt(e.target.value)}
            required
            data-testid="input-writer-license-expires"
          />
          <p className="text-xs text-muted-foreground">إلزامي — حتى نعرف متى ينتهي ترخيصك</p>
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
          ) : isRenewal ? (
            "تحديث الترخيص"
          ) : (
            "إرسال الترخيص"
          )}
        </Button>
      </div>
    </section>
  );
}
