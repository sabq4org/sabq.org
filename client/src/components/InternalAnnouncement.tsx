import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Megaphone, ExternalLink } from "lucide-react";
import { getLucideIcon } from "@/lib/lucideIconMap";
import { cn } from "@/lib/utils";
import DOMPurify from "isomorphic-dompurify";

interface Announcement {
  id: string;
  title: string;
  message: string;
  priority: string;
  channels: string[];
  iconName: string | null;
  actionButtonLabel: string | null;
  actionButtonUrl: string | null;
}

const VIEWED_PREFIX = "announcement_viewed_";

function getAnnouncementChannel(location: string): "dashboardBanner" | "toast" {
  return location.startsWith("/dashboard") ? "dashboardBanner" : "toast";
}

/** Strip tags for a one-line preview under the title when collapsed. */
function plainPreview(html: string, maxLen = 120): string {
  const text = html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen).trim()}…`;
}

export function InternalAnnouncement() {
  const [location, navigate] = useLocation();
  const [trackedImpressions, setTrackedImpressions] = useState<Set<string>>(new Set());
  const [trackedUniqueViews, setTrackedUniqueViews] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const currentChannel = getAnnouncementChannel(location);
  const activeAnnouncementsPath = `/api/announcements/active?channel=${currentChannel}`;

  const { data: announcementsRaw } = useQuery<Announcement[]>({
    queryKey: [activeAnnouncementsPath],
  });
  const announcements = Array.isArray(announcementsRaw) ? announcementsRaw : [];

  const trackMetricMutation = useMutation({
    mutationFn: ({
      announcementId,
      event,
      channel,
    }: {
      announcementId: string;
      event: string;
      channel?: string;
    }) =>
      apiRequest(`/api/announcements/${announcementId}/metrics`, {
        method: "POST",
        body: JSON.stringify({ event, channel }),
      }),
  });

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    announcements.forEach((ann) => {
      if (!trackedImpressions.has(ann.id)) {
        trackMetricMutation.mutate({
          announcementId: ann.id,
          event: "impression",
          channel: currentChannel,
        });
        setTrackedImpressions((prev) => new Set(Array.from(prev).concat(ann.id)));
      }

      const uniqueViewKey = `${VIEWED_PREFIX}${ann.id}`;
      const hasViewedInSession = sessionStorage.getItem(uniqueViewKey);

      if (!hasViewedInSession && !trackedUniqueViews.has(ann.id)) {
        const timer = setTimeout(() => {
          trackMetricMutation.mutate({
            announcementId: ann.id,
            event: "unique_view",
            channel: currentChannel,
          });
          sessionStorage.setItem(uniqueViewKey, "true");
          setTrackedUniqueViews((prev) => new Set(Array.from(prev).concat(ann.id)));
        }, 3000);
        timers.push(timer);
      }
    });

    return () => timers.forEach((t) => clearTimeout(t));
  }, [announcements, currentChannel, trackedImpressions, trackedUniqueViews]);

  const handleActionClick = (announcement: Announcement) => {
    if (announcement.actionButtonUrl) {
      trackMetricMutation.mutate({
        announcementId: announcement.id,
        event: "click",
        channel: currentChannel,
      });

      if (announcement.actionButtonUrl.startsWith("http")) {
        window.open(announcement.actionButtonUrl, "_blank");
      } else {
        navigate(announcement.actionButtonUrl);
      }
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const getPriorityConfig = (priority: string) => {
    const configs: Record<
      string,
      { bg: string; border: string; accent: string; text: string; iconBg: string; icon: string; badge: string }
    > = {
      critical: {
        bg: "bg-red-50/90 dark:bg-red-950/30",
        border: "border-red-200 dark:border-red-900/50",
        accent: "from-red-500 to-red-600",
        text: "text-red-950 dark:text-red-100",
        iconBg: "bg-red-100 dark:bg-red-900/50",
        icon: "text-red-600 dark:text-red-300",
        badge: "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-200",
      },
      high: {
        bg: "bg-amber-50/90 dark:bg-amber-950/25",
        border: "border-amber-200 dark:border-amber-900/45",
        accent: "from-amber-500 to-orange-500",
        text: "text-amber-950 dark:text-amber-50",
        iconBg: "bg-amber-100 dark:bg-amber-900/50",
        icon: "text-amber-600 dark:text-amber-300",
        badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200",
      },
      normal: {
        bg: "bg-sky-50/90 dark:bg-sky-950/25",
        border: "border-sky-200 dark:border-sky-900/45",
        accent: "from-sky-500 to-blue-600",
        text: "text-slate-800 dark:text-slate-100",
        iconBg: "bg-sky-100 dark:bg-sky-900/50",
        icon: "text-sky-600 dark:text-sky-300",
        badge: "bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200",
      },
      medium: {
        bg: "bg-sky-50/90 dark:bg-sky-950/25",
        border: "border-sky-200 dark:border-sky-900/45",
        accent: "from-sky-500 to-blue-600",
        text: "text-slate-800 dark:text-slate-100",
        iconBg: "bg-sky-100 dark:bg-sky-900/50",
        icon: "text-sky-600 dark:text-sky-300",
        badge: "bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200",
      },
      low: {
        bg: "bg-slate-50/95 dark:bg-slate-900/40",
        border: "border-slate-200 dark:border-slate-700",
        accent: "from-slate-400 to-slate-500",
        text: "text-slate-700 dark:text-slate-200",
        iconBg: "bg-slate-100 dark:bg-slate-800",
        icon: "text-slate-500 dark:text-slate-300",
        badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
      },
    };
    return configs[priority] || configs.normal;
  };

  const getIcon = (iconName: string | null) => getLucideIcon(iconName, Megaphone);

  const visibleAnnouncements = announcements.filter((ann) => {
    return ann.channels.includes(currentChannel);
  });

  if (visibleAnnouncements.length === 0) {
    return null;
  }

  return (
    <div className="w-full space-y-3 px-3 pt-3 sm:px-4 sm:pt-4" dir="rtl">
      {visibleAnnouncements.map((announcement) => {
        const config = getPriorityConfig(announcement.priority);
        const Icon = getIcon(announcement.iconName);
        const isExpanded = expandedIds.has(announcement.id);
        const preview = plainPreview(announcement.message);
        const hasAction = Boolean(announcement.actionButtonUrl && announcement.actionButtonLabel);

        return (
          <Collapsible
            key={announcement.id}
            open={isExpanded}
            onOpenChange={() => toggleExpanded(announcement.id)}
          >
            <div
              className={cn(
                "relative overflow-hidden rounded-2xl border shadow-sm transition-shadow duration-200",
                "hover:shadow-md",
                config.bg,
                config.border,
              )}
              data-testid={`banner-announcement-${announcement.id}`}
            >
              <div className={cn("absolute inset-y-0 right-0 w-1 bg-gradient-to-b", config.accent)} />

              <div className="px-4 py-3.5 sm:px-5">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl",
                      config.iconBg,
                      config.icon,
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium",
                          config.badge,
                        )}
                      >
                        إعلان داخلي
                      </span>
                    </div>
                    <p className={cn("mt-1 text-base font-bold leading-snug", config.text)}>
                      {announcement.title}
                    </p>
                    {!isExpanded && preview && (
                      <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                        {preview}
                      </p>
                    )}
                  </div>

                  <CollapsibleTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-shrink-0 gap-1.5 border-current/20 bg-background/60 hover:bg-background"
                      data-testid={`button-toggle-${announcement.id}`}
                    >
                      {isExpanded ? "إخفاء" : "التفاصيل"}
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform duration-200",
                          isExpanded && "rotate-180",
                        )}
                      />
                    </Button>
                  </CollapsibleTrigger>
                </div>

                <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-none">
                  <div className="mt-3 border-t border-black/5 pt-3 dark:border-white/10">
                    <div
                      className={cn(
                        "announcement-body text-sm leading-7",
                        config.text,
                        // Override pasted email/Word centering and raw link dump.
                        "[&_*]:text-start [&_p]:my-2 [&_p]:text-start",
                        "[&_strong]:font-semibold",
                        "[&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:break-all",
                        "[&_a]:rounded-md [&_a]:bg-background/70 [&_a]:px-2 [&_a]:py-0.5",
                        "[&_a]:font-medium [&_a]:text-sky-700 [&_a]:underline-offset-2",
                        "hover:[&_a]:underline dark:[&_a]:text-sky-300",
                        "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pr-5",
                        "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pr-5",
                      )}
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(announcement.message, {
                          ADD_ATTR: ["target", "rel"],
                        }),
                      }}
                    />

                    {hasAction && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleActionClick(announcement)}
                          className="gap-1.5"
                          data-testid={`button-action-${announcement.id}`}
                        >
                          {announcement.actionButtonLabel}
                          {announcement.actionButtonUrl?.startsWith("http") && (
                            <ExternalLink className="h-3.5 w-3.5 opacity-80" />
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </div>
          </Collapsible>
        );
      })}
    </div>
  );
}
