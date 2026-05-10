import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SmilePlus, Minus, Frown, HelpCircle, LucideIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { arSA, enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface SentimentIndicatorProps {
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  confidence?: number;
  provider?: string;
  model?: string;
  analyzedAt?: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showTooltip?: boolean;
}

const sentimentConfig: Record<
  'positive' | 'neutral' | 'negative' | 'unanalyzed',
  {
    icon: LucideIcon;
    labels: { ar: string; en: string; ur: string };
    colors: string;
  }
> = {
  positive: {
    icon: SmilePlus,
    labels: {
      ar: "إيجابي",
      en: "Positive",
      ur: "مثبت"
    },
    colors: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
  },
  neutral: {
    icon: Minus,
    labels: {
      ar: "محايد",
      en: "Neutral",
      ur: "غیر جانبدار"
    },
    colors: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
  },
  negative: {
    icon: Frown,
    labels: {
      ar: "سلبي",
      en: "Negative",
      ur: "منفی"
    },
    colors: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
  },
  unanalyzed: {
    icon: HelpCircle,
    labels: {
      ar: "غير محلل",
      en: "Not analyzed",
      ur: "تجزیہ نہیں"
    },
    colors: "bg-muted text-muted-foreground"
  }
};

const sizeConfig = {
  sm: {
    badge: "text-xs px-2 py-0.5",
    icon: "h-3 w-3",
    gap: "gap-1"
  },
  md: {
    badge: "text-sm px-2.5 py-1",
    icon: "h-4 w-4",
    gap: "gap-1.5"
  },
  lg: {
    badge: "text-base px-3 py-1.5",
    icon: "h-5 w-5",
    gap: "gap-2"
  }
};

const detectLanguage = (): 'ar' | 'en' | 'ur' => {
  if (typeof window === 'undefined') return 'ar'; // SSR fallback
  
  const path = window.location.pathname;
  if (path.startsWith('/en')) return 'en';
  if (path.startsWith('/ur')) return 'ur';
  return 'ar'; // Default
};

export function SentimentIndicator({
  sentiment,
  confidence,
  provider,
  model,
  analyzedAt,
  size = 'md',
  showLabel = true,
  showTooltip = true,
}: SentimentIndicatorProps) {
  const language = detectLanguage();
  const sentimentKey = sentiment || 'unanalyzed';
  const config = sentimentConfig[sentimentKey];
  const sizeStyles = sizeConfig[size];
  const Icon = config.icon;
  const label = config.labels[language];

  const locale = language === 'ar' ? arSA : enUS;

  const badgeContent = (
    <Badge
      variant="outline"
      className={cn(
        config.colors,
        sizeStyles.badge,
        sizeStyles.gap,
        "inline-flex items-center border-0"
      )}
      data-testid={`sentiment-badge-${sentimentKey}`}
    >
      <Icon 
        className={sizeStyles.icon} 
        data-testid={`sentiment-icon-${sentimentKey}`}
      />
      {showLabel && <span>{label}</span>}
    </Badge>
  );

  if (!showTooltip || !sentiment) {
    return badgeContent;
  }

  const hasTooltipContent = confidence !== undefined || provider || model || analyzedAt;

  if (!hasTooltipContent) {
    return badgeContent;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badgeContent}
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1 text-xs">
            {confidence !== undefined && (
              <div>
                <span className="font-semibold">
                  {language === 'ar' ? 'الثقة:' : language === 'ur' ? 'اعتماد:' : 'Confidence:'}
                </span>{' '}
                {(confidence * 100).toFixed(1)}%
              </div>
            )}
            {(provider || model) && (
              <div>
                <span className="font-semibold">
                  {language === 'ar' ? 'المزود:' : language === 'ur' ? 'فراہم کنندہ:' : 'Provider:'}
                </span>{' '}
                {provider && model ? `${provider} (${model})` : provider || model}
              </div>
            )}
            {analyzedAt && (
              <div>
                <span className="font-semibold">
                  {language === 'ar' ? 'تم التحليل:' : language === 'ur' ? 'تجزیہ شدہ:' : 'Analyzed:'}
                </span>{' '}
                {formatDistanceToNow(new Date(analyzedAt), { 
                  addSuffix: true,
                  locale 
                })}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export type { SentimentIndicatorProps };
