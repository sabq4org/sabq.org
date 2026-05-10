import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { cn } from "@/lib/utils";

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

export function InternalAnnouncement() {
  const [location, navigate] = useLocation();
  const [trackedImpressions, setTrackedImpressions] = useState<Set<string>>(new Set());
  const [trackedUniqueViews, setTrackedUniqueViews] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { data: announcementsRaw } = useQuery<Announcement[]>({
    queryKey: ['/api/announcements/active'],
  });
  const announcements = Array.isArray(announcementsRaw) ? announcementsRaw : [];

  const trackMetricMutation = useMutation({
    mutationFn: ({ announcementId, event, channel }: { 
      announcementId: string; 
      event: string;
      channel?: string;
    }) => apiRequest(`/api/announcements/${announcementId}/metrics`, {
      method: 'POST',
      body: JSON.stringify({ event, channel }),
    }),
  });

  useEffect(() => {
    announcements.forEach(ann => {
      if (!trackedImpressions.has(ann.id)) {
        trackMetricMutation.mutate({ 
          announcementId: ann.id, 
          event: 'impression',
          channel: getCurrentChannel(),
        });
        setTrackedImpressions(prev => new Set(Array.from(prev).concat(ann.id)));
      }

      const uniqueViewKey = `${VIEWED_PREFIX}${ann.id}`;
      const hasViewedInSession = sessionStorage.getItem(uniqueViewKey);
      
      if (!hasViewedInSession && !trackedUniqueViews.has(ann.id)) {
        const timer = setTimeout(() => {
          trackMetricMutation.mutate({ 
            announcementId: ann.id, 
            event: 'unique_view',
            channel: getCurrentChannel(),
          });
          sessionStorage.setItem(uniqueViewKey, 'true');
          setTrackedUniqueViews(prev => new Set(Array.from(prev).concat(ann.id)));
        }, 3000);

        return () => clearTimeout(timer);
      }
    });
  }, [announcements, trackedImpressions, trackedUniqueViews]);

  const getCurrentChannel = () => {
    // Map routes to announcement channels
    // Show all channels in dashboard for now
    if (location.startsWith('/dashboard')) return 'dashboardBanner';
    return 'toast'; // Default for web pages
  };

  const handleActionClick = (announcement: Announcement) => {
    if (announcement.actionButtonUrl) {
      trackMetricMutation.mutate({ 
        announcementId: announcement.id, 
        event: 'click',
        channel: getCurrentChannel(),
      });

      if (announcement.actionButtonUrl.startsWith('http')) {
        window.open(announcement.actionButtonUrl, '_blank');
      } else {
        navigate(announcement.actionButtonUrl);
      }
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
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
    const configs: Record<string, { bg: string; border: string; text: string; icon: string }> = {
      critical: {
        bg: "bg-red-500/10 dark:bg-red-500/20",
        border: "border-red-500",
        text: "text-red-700 dark:text-red-300",
        icon: "text-red-500",
      },
      high: {
        bg: "bg-orange-500/10 dark:bg-orange-500/20",
        border: "border-orange-500",
        text: "text-orange-700 dark:text-orange-300",
        icon: "text-orange-500",
      },
      medium: {
        bg: "bg-blue-500/10 dark:bg-blue-500/20",
        border: "border-blue-500",
        text: "text-blue-700 dark:text-blue-300",
        icon: "text-blue-500",
      },
      low: {
        bg: "bg-gray-500/10 dark:bg-gray-500/20",
        border: "border-gray-500",
        text: "text-gray-700 dark:text-gray-300",
        icon: "text-gray-500",
      },
    };
    return configs[priority] || configs.medium;
  };

  const getIcon = (iconName: string | null) => {
    if (!iconName) return null;
    const Icon = (LucideIcons as any)[iconName];
    if (!Icon) return null;
    return Icon;
  };

  const currentChannel = getCurrentChannel();
  
  const visibleAnnouncements = announcements.filter(ann => {
    // In dashboard, show all announcements regardless of channel
    if (location.startsWith('/dashboard')) {
      return true;
    }
    
    // Outside dashboard, filter by channel
    if (!ann.channels.includes('all') && !ann.channels.includes(currentChannel)) {
      return false;
    }
    return true;
  });

  if (visibleAnnouncements.length === 0) {
    return null;
  }

  return (
    <div className="w-full space-y-0" dir="rtl">
      {visibleAnnouncements.map((announcement) => {
        const config = getPriorityConfig(announcement.priority);
        const Icon = getIcon(announcement.iconName);
        const isExpanded = expandedIds.has(announcement.id);

        return (
          <Collapsible
            key={announcement.id}
            open={isExpanded}
            onOpenChange={() => toggleExpanded(announcement.id)}
          >
            <div
              className={cn(
                "w-full border-b-2 transition-all duration-300",
                config.bg,
                config.border
              )}
              data-testid={`banner-announcement-${announcement.id}`}
            >
              <div className="container mx-auto px-4 py-3">
                <div className="flex items-center gap-3">
                  {Icon && (
                    <div className={cn("flex-shrink-0", config.icon)}>
                      <Icon className="h-5 w-5" />
                    </div>
                  )}
                  
                  <div className="flex-1">
                    <p className={cn("text-sm font-bold", config.text)}>
                      {announcement.title}
                    </p>
                  </div>
                  
                  <CollapsibleTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-shrink-0"
                      data-testid={`button-toggle-${announcement.id}`}
                    >
                      <ChevronDown 
                        className={cn(
                          "h-4 w-4 transition-transform duration-200",
                          isExpanded && "rotate-180"
                        )}
                      />
                    </Button>
                  </CollapsibleTrigger>
                  
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/dashboard/announcements/${announcement.id}`)}
                    className="flex-shrink-0"
                    data-testid={`button-view-details-${announcement.id}`}
                  >
                    عرض التفاصيل
                  </Button>
                </div>

                <CollapsibleContent className="mt-3">
                  <div className={cn("pr-8 text-sm", config.text)}>
                    <p className="whitespace-pre-wrap">{announcement.message}</p>
                    
                    {announcement.actionButtonUrl && announcement.actionButtonLabel && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleActionClick(announcement)}
                        className="mt-3"
                        data-testid={`button-action-${announcement.id}`}
                      >
                        {announcement.actionButtonLabel}
                      </Button>
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
