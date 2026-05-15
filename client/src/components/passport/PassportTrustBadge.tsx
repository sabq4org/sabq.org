import { Badge } from "@/components/ui/badge";
import { ShieldCheck } from "lucide-react";
import { type PassportLanguage } from "./passportPath";

type Language = PassportLanguage;

interface PassportTrustBadgeProps {
  slug?: string;
  language?: Language;
  className?: string;
}

const LABEL: Record<Language, string> = {
  ar: "موثَّق",
  en: "Verified",
  ur: "تصدیق شدہ",
};

export function PassportTrustBadge({
  language = "ar",
  className,
}: PassportTrustBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={`gap-1 border-green-500/40 text-green-700 dark:text-green-400 ${className ?? ""}`}
      data-testid={`badge-passport-trust-${language}`}
    >
      <ShieldCheck className="h-3 w-3" />
      <span>{LABEL[language]}</span>
    </Badge>
  );
}

export default PassportTrustBadge;
