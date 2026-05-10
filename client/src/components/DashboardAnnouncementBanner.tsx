import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Info,
  CheckCircle,
  AlertTriangle,
  Sparkles,
  X,
  ExternalLink,
  Bell,
  Megaphone,
  Star,
  Zap,
  Gift,
  Lightbulb,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { DashboardAnnouncement } from "@shared/schema";

const ROTATION_INTERVAL = 8000;
const STORAGE_KEY = "dashboard_announcement_index";

const typeConfig: Record<string, { 
  bgClass: string; 
  borderClass: string;
  textClass: string;
  iconClass: string;
  defaultIcon: typeof Info;
}> = {
  info: {
    bgClass: "bg-blue-50 dark:bg-blue-950/30",
    borderClass: "border-blue-200 dark:border-blue-800",
    textClass: "text-blue-800 dark:text-blue-200",
    iconClass: "text-blue-600 dark:text-blue-400",
    defaultIcon: Info,
  },
  success: {
    bgClass: "bg-green-50 dark:bg-green-950/30",
    borderClass: "border-green-200 dark:border-green-800",
    textClass: "text-green-800 dark:text-green-200",
    iconClass: "text-green-600 dark:text-green-400",
    defaultIcon: CheckCircle,
  },
  warning: {
    bgClass: "bg-amber-50 dark:bg-amber-950/30",
    borderClass: "border-amber-200 dark:border-amber-800",
    textClass: "text-amber-800 dark:text-amber-200",
    iconClass: "text-amber-600 dark:text-amber-400",
    defaultIcon: AlertTriangle,
  },
  feature: {
    bgClass: "bg-purple-50 dark:bg-purple-950/30",
    borderClass: "border-purple-200 dark:border-purple-800",
    textClass: "text-purple-800 dark:text-purple-200",
    iconClass: "text-purple-600 dark:text-purple-400",
    defaultIcon: Sparkles,
  },
};

const iconMap: Record<string, typeof Info> = {
  Info,
  CheckCircle,
  AlertTriangle,
  Sparkles,
  Bell,
  Megaphone,
  Star,
  Zap,
  Gift,
  Lightbulb,
};

function getIcon(iconName: string | null | undefined, type: string): typeof Info {
  if (iconName && iconMap[iconName]) {
    return iconMap[iconName];
  }
  return typeConfig[type]?.defaultIcon || Info;
}

function getStoredIndex(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return parseInt(stored, 10) || 0;
    }
  } catch {
    // localStorage might be unavailable
  }
  return Math.floor(Math.random() * 100);
}

function setStoredIndex(index: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, index.toString());
  } catch {
    // localStorage might be unavailable
  }
}

interface DashboardAnnouncementBannerProps {
  deferLoading?: boolean;
}

export function DashboardAnnouncementBanner({ deferLoading = false }: DashboardAnnouncementBannerProps) {
  const [currentIndex, setCurrentIndex] = useState<number>(getStoredIndex);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const { data: announcementsRaw, isLoading, error } = useQuery<DashboardAnnouncement[]>({
    queryKey: ["/api/dashboard/announcements"],
    staleTime: 60000,
    retry: 1,
    enabled: !deferLoading, // Defer loading until initial dashboard stats are loaded
    refetchInterval: 300000, // Refetch every 5 minutes (optimized)
  });
  const announcements = Array.isArray(announcementsRaw) ? announcementsRaw : [];

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/dashboard/announcements/${id}/dismiss`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/announcements"] });
    },
  });

  const visibleAnnouncements = useMemo(() => {
    return announcements.filter((a) => !dismissedIds.has(a.id));
  }, [announcements, dismissedIds]);

  const currentAnnouncement = useMemo(() => {
    if (visibleAnnouncements.length === 0) return null;
    const safeIndex = currentIndex % visibleAnnouncements.length;
    return visibleAnnouncements[safeIndex];
  }, [visibleAnnouncements, currentIndex]);

  useEffect(() => {
    if (visibleAnnouncements.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % visibleAnnouncements.length;
        setStoredIndex(next);
        return next;
      });
    }, ROTATION_INTERVAL);

    return () => clearInterval(interval);
  }, [visibleAnnouncements.length]);

  const handleDismiss = useCallback((id: string) => {
    setDismissedIds((prev) => new Set(Array.from(prev).concat(id)));
    dismissMutation.mutate(id);
  }, [dismissMutation]);

  if (error) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="mb-4" data-testid="announcement-banner-loading">
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    );
  }

  if (!currentAnnouncement) {
    return null;
  }

  const config = typeConfig[currentAnnouncement.type] || typeConfig.info;
  const IconComponent = getIcon(currentAnnouncement.icon, currentAnnouncement.type);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={currentAnnouncement.id}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
        className={`mb-4 rounded-lg border ${config.bgClass} ${config.borderClass} p-4`}
        dir="rtl"
        data-testid={`announcement-banner-${currentAnnouncement.id}`}
      >
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 mt-0.5 ${config.iconClass}`}>
            <IconComponent className="h-5 w-5" data-testid="announcement-icon" />
          </div>

          <div className="flex-1 min-w-0">
            <h4
              className={`font-semibold text-sm ${config.textClass}`}
              data-testid="announcement-title"
            >
              {currentAnnouncement.title}
            </h4>
            <p
              className={`text-sm mt-1 ${config.textClass} opacity-90`}
              data-testid="announcement-message"
            >
              {currentAnnouncement.message}
            </p>

            {currentAnnouncement.linkUrl && (
              <a
                href={currentAnnouncement.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 text-sm font-medium mt-2 ${config.textClass} hover:underline`}
                data-testid="announcement-link"
              >
                {currentAnnouncement.linkText || "اقرأ المزيد"}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {visibleAnnouncements.length > 1 && (
              <span
                className={`text-xs ${config.textClass} opacity-70`}
                data-testid="announcement-counter"
              >
                {(currentIndex % visibleAnnouncements.length) + 1}/{visibleAnnouncements.length}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 ${config.textClass} hover:bg-transparent hover:opacity-70`}
              onClick={() => handleDismiss(currentAnnouncement.id)}
              disabled={dismissMutation.isPending}
              data-testid="button-dismiss-announcement"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
