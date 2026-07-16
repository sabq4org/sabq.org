import type { ReactNode } from "react";
import { Link } from "wouter";
import { AlertCircle, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface BriefStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface BriefStateViewProps {
  variant: "empty" | "error";
  title: string;
  description: string;
  action: BriefStateAction;
  /** أيقونة سهم CTA (ArrowLeft للعربية / ArrowRight للإنجليزية) أو RefreshCw لإعادة المحاولة. */
  arrowIcon: ReactNode;
}

const VARIANT_CONFIG = {
  empty: {
    Icon: Eye,
    iconClassName: "text-muted-foreground",
    testIds: {
      card: "card-no-activity",
      title: "text-no-activity-title",
      description: "text-no-activity-description",
      button: "button-explore-news",
    },
  },
  error: {
    Icon: AlertCircle,
    iconClassName: "text-destructive",
    testIds: {
      card: "card-error",
      title: "text-error-title",
      description: "text-error-description",
      button: "button-retry-brief",
    },
  },
} as const;

/** بطاقة مركزية لحالتي «فارغ» و«خطأ» في الموجز اليومي. */
export function BriefStateView({ variant, title, description, action, arrowIcon }: BriefStateViewProps) {
  const config = VARIANT_CONFIG[variant];
  const { Icon, testIds } = config;

  return (
    <Card className="border-0 shadow-sm dark:border dark:border-card-border" data-testid={testIds.card}>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <Icon className={cn("h-16 w-16 mb-4", config.iconClassName)} />
        <h2 className="text-2xl font-semibold mb-2" data-testid={testIds.title}>
          {title}
        </h2>
        <p className="text-muted-foreground mb-6" data-testid={testIds.description}>
          {description}
        </p>
        {action.href ? (
          <Button asChild data-testid={testIds.button}>
            <Link href={action.href}>
              {action.label}
              {arrowIcon}
            </Link>
          </Button>
        ) : (
          <Button onClick={action.onClick} data-testid={testIds.button}>
            {action.label}
            {arrowIcon}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
