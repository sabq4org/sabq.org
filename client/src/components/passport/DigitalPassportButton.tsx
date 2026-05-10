import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Copy, ExternalLink, QrCode } from "lucide-react";
import { Link } from "wouter";
import { buildPassportPath, type PassportLanguage } from "./passportPath";

type Language = PassportLanguage;

interface DigitalPassportButtonProps {
  slug: string;
  language?: Language;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "sm" | "default" | "lg" | "icon";
  className?: string;
}

const TEXT: Record<Language, {
  button: string;
  title: string;
  description: string;
  open: string;
  copy: string;
  copied: string;
  copiedDesc: string;
  urlLabel: string;
}> = {
  ar: {
    button: "جواز المحتوى",
    title: "جواز سفر المحتوى",
    description: "بصمة سبق الرقمية لهذا المقال — امسح الرمز أو افتح الصفحة لعرض التفاصيل.",
    open: "فتح الجواز",
    copy: "نسخ الرابط",
    copied: "تم نسخ الرابط",
    copiedDesc: "تم نسخ رابط جواز المحتوى إلى الحافظة.",
    urlLabel: "رابط الجواز",
  },
  en: {
    button: "Content Passport",
    title: "Content Passport",
    description: "Sabq's digital fingerprint for this article — scan or open the page for details.",
    open: "Open Passport",
    copy: "Copy link",
    copied: "Link copied",
    copiedDesc: "The passport link was copied to your clipboard.",
    urlLabel: "Passport URL",
  },
  ur: {
    button: "مواد کا پاسپورٹ",
    title: "مواد کا پاسپورٹ",
    description: "اس مضمون کے لیے سبق کا ڈیجیٹل فنگر پرنٹ — تفصیلات کے لیے اسکین کریں یا صفحہ کھولیں۔",
    open: "پاسپورٹ کھولیں",
    copy: "لنک کاپی کریں",
    copied: "لنک کاپی ہو گیا",
    copiedDesc: "پاسپورٹ کا لنک آپ کے کلپ بورڈ میں کاپی ہو گیا ہے۔",
    urlLabel: "پاسپورٹ کا لنک",
  },
};

export function DigitalPassportButton({
  slug,
  language = "ar",
  variant = "outline",
  size = "sm",
  className,
}: DigitalPassportButtonProps) {
  const [open, setOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [absoluteUrl, setAbsoluteUrl] = useState<string>("");
  const { toast } = useToast();
  const t = TEXT[language];
  const passportPath = buildPassportPath(slug, language);

  useEffect(() => {
    if (!open) return;
    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "https://sabq.org";
    const url = `${origin}${passportPath}`;
    setAbsoluteUrl(url);
    let cancelled = false;
    QRCode.toDataURL(url, {
      margin: 1,
      width: 192,
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, passportPath]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      toast({ title: t.copied, description: t.copiedDesc });
    } catch {
      // ignore
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={`bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-900 ${className ?? ""}`}
          data-testid={`button-passport-${language}`}
          aria-label={t.button}
        >
          <ShieldCheck className="h-4 w-4" />
          {size !== "icon" && <span>{t.button}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80"
        align="end"
        dir={language === "en" ? "ltr" : "rtl"}
        data-testid={`popover-passport-${language}`}
      >
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <QrCode className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="space-y-1">
              <div className="text-sm font-semibold" data-testid="text-passport-title">{t.title}</div>
              <div className="text-xs text-muted-foreground leading-relaxed">{t.description}</div>
            </div>
          </div>
          <div className="flex items-center justify-center rounded-md border bg-card p-3">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR"
                className="h-40 w-40"
                data-testid="img-passport-qr"
              />
            ) : (
              <Skeleton className="h-40 w-40" />
            )}
          </div>
          <div className="space-y-1.5" dir="ltr">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {t.urlLabel}
            </div>
            <div
              className="rounded-md border bg-muted/50 px-2 py-1.5 text-xs font-mono break-all select-all"
              data-testid="text-passport-url"
            >
              {absoluteUrl}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={passportPath} className="flex-1">
              <Button
                variant="default"
                size="sm"
                className="w-full"
                data-testid="button-passport-open"
              >
                <ExternalLink className="h-4 w-4" />
                <span>{t.open}</span>
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              data-testid="button-passport-copy"
            >
              <Copy className="h-4 w-4" />
              <span>{t.copy}</span>
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default DigitalPassportButton;
