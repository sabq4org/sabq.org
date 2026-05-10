import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck } from "lucide-react";
import { buildPassportPath, type PassportLanguage } from "./passportPath";

type Language = PassportLanguage;

interface PassportTrustBadgeProps {
  slug: string;
  language?: Language;
  className?: string;
}

const LABEL: Record<Language, string> = {
  ar: "موثَّق",
  en: "Verified",
  ur: "تصدیق شدہ",
};

const TITLE: Record<Language, string> = {
  ar: "عرض جواز المحتوى",
  en: "View Content Passport",
  ur: "مواد کا پاسپورٹ دیکھیں",
};

export function PassportTrustBadge({
  slug,
  language = "ar",
  className,
}: PassportTrustBadgeProps) {
  const href = buildPassportPath(slug, language);
  return (
    <Link
      href={href}
      title={TITLE[language]}
      aria-label={TITLE[language]}
      data-testid={`link-passport-trust-${language}`}
    >
      <Badge
        variant="outline"
        className={`gap-1 border-green-500/40 text-green-700 dark:text-green-400 ${className ?? ""}`}
        data-testid={`badge-passport-trust-${language}`}
      >
        <ShieldCheck className="h-3 w-3" />
        <span>{LABEL[language]}</span>
      </Badge>
    </Link>
  );
}

export default PassportTrustBadge;
