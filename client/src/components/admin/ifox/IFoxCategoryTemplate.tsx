import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IFoxLayout } from "./IFoxLayout";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Home,
  ChevronRight,
  Save,
  RefreshCw,
  Plus,
  LucideIcon,
} from "lucide-react";

interface IFoxCategoryTemplateProps {
  title: string;
  description?: string;
  icon: LucideIcon;
  gradient: string;
  iconColor: string;
  breadcrumbs?: { label: string; href: string }[];
  actions?: {
    label: string;
    icon?: LucideIcon;
    onClick: () => void;
    variant?: "default" | "outline" | "ghost" | "secondary";
    loading?: boolean;
  }[];
  children: ReactNode;
  stats?: {
    label: string;
    value: string | number;
    icon?: LucideIcon;
    trend?: { value: number; isPositive: boolean };
  }[];
}

export function IFoxCategoryTemplate({
  title,
  description,
  icon: Icon,
  gradient,
  iconColor,
  breadcrumbs = [],
  actions = [],
  children,
  stats = [],
}: IFoxCategoryTemplateProps) {
  const [location] = useLocation();

  const defaultBreadcrumbs = [
    { label: "الرئيسية", href: "/dashboard" },
    { label: "آي فوكس", href: "/dashboard/admin/ifox" },
    ...breadcrumbs,
  ];

  return (
    <IFoxLayout>
      <div className="max-w-7xl mx-auto p-6 space-y-6" dir="rtl">
        {/* Header */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="bg-gradient-to-br from-[hsl(var(--ifox-surface-muted)/0.5)] to-[hsl(var(--ifox-surface-muted)/0.3)] border-[hsl(var(--ifox-surface-muted))] backdrop-blur-lg">
            <CardContent className="p-6">
              {/* Breadcrumb */}
              <nav className="flex items-center gap-2 text-sm text-[hsl(var(--ifox-text-secondary))] mb-4">
                {defaultBreadcrumbs.map((crumb, index) => (
                  <div key={crumb.href} className="flex items-center gap-2">
                    {index > 0 && <ChevronRight className="h-4 w-4" />}
                    {index === defaultBreadcrumbs.length - 1 ? (
                      <span className="text-white font-medium">{crumb.label}</span>
                    ) : (
                      <Link href={crumb.href}>
                        <button
                          className="hover:text-white transition-colors"
                          data-testid={`breadcrumb-${crumb.label}`}
                        >
                          {crumb.label}
                        </button>
                      </Link>
                    )}
                  </div>
                ))}
              </nav>

              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div 
                    className={cn(
                      "p-4 rounded-xl shadow-lg",
                      gradient
                    )}
                  >
                    <Icon className={cn("h-8 w-8 text-white", iconColor)} />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-white mb-2">{title}</h1>
                    {description && (
                      <p className="text-[hsl(var(--ifox-text-secondary))] text-lg">{description}</p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {actions.length > 0 && (
                  <div className="flex items-center gap-2">
                    {actions.map((action, index) => {
                      const ActionIcon = action.icon;
                      return (
                        <Button
                          key={index}
                          variant={action.variant || "default"}
                          onClick={action.onClick}
                          disabled={action.loading}
                          className="gap-2"
                          data-testid={`action-${action.label}`}
                        >
                          {action.loading ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : ActionIcon ? (
                            <ActionIcon className="h-4 w-4" />
                          ) : null}
                          {action.label}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Stats */}
              {stats.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
                  {(stats || []).map((stat, index) => {
                    const StatIcon = stat.icon;
                    return (
                      <motion.div
                        key={index}
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.1 * index }}
                      >
                        <Card className="bg-gradient-to-br from-[hsl(var(--ifox-surface-muted)/0.3)] to-[hsl(var(--ifox-surface-muted)/0.5)] border-[hsl(var(--ifox-surface-muted))]">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm text-[hsl(var(--ifox-text-secondary))]">{stat.label}</p>
                                <p className="text-2xl font-bold text-white mt-1">
                                  {stat.value}
                                </p>
                                {stat.trend && (
                                  <div className="flex items-center gap-1 mt-2">
                                    <span
                                      className={cn(
                                        "text-xs font-medium",
                                        stat.trend.isPositive
                                          ? "text-green-400"
                                          : "text-red-400"
                                      )}
                                    >
                                      {stat.trend.isPositive ? "+" : ""}
                                      {stat.trend.value}%
                                    </span>
                                  </div>
                                )}
                              </div>
                              {StatIcon && (
                                <StatIcon className="h-8 w-8 text-white/20" />
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Main Content */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          {children}
        </motion.div>
      </div>
    </IFoxLayout>
  );
}