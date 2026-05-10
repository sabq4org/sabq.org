import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Bell, 
  AlertCircle, 
  Star, 
  Newspaper,
  Bot,
  Sparkles,
  Zap,
  Heart,
  CheckCheck,
  ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  deeplink: string | null;
  read: boolean;
  metadata: {
    articleId?: string;
    imageUrl?: string;
    recommendationType?: string;
  } | null;
  createdAt: string;
}

interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
}

// Notification styles with colors and icons (same as English but with Urdu labels)
const notificationStyles = {
  recommendation: {
    icon: Bot,
    label: "تجویز ذہین",
    color: "bg-blue-50/80 dark:bg-blue-950/30 border-blue-200/50 dark:border-blue-900/50",
    badgeColor: "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30",
    iconColor: "text-blue-600 dark:text-blue-400",
    dotColor: "bg-blue-500",
    hasAI: true,
  },
  ArticlePublished: {
    icon: Newspaper,
    label: "نیا مضمون",
    color: "bg-gray-50/80 dark:bg-gray-950/30 border-gray-200/50 dark:border-gray-800/50",
    badgeColor: "bg-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30",
    iconColor: "text-gray-600 dark:text-gray-400",
    dotColor: "bg-gray-500",
    hasAI: false,
  },
  BreakingNews: {
    icon: AlertCircle,
    label: "بریکنگ",
    color: "bg-red-50/80 dark:bg-red-950/30 border-red-200/50 dark:border-red-900/50",
    badgeColor: "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30",
    iconColor: "text-red-600 dark:text-red-400",
    dotColor: "bg-red-500",
    hasAI: false,
  },
  FeaturedArticle: {
    icon: Star,
    label: "نمایاں",
    color: "bg-yellow-50/80 dark:bg-yellow-950/30 border-yellow-200/50 dark:border-yellow-900/50",
    badgeColor: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/30",
    iconColor: "text-yellow-600 dark:text-yellow-400",
    dotColor: "bg-yellow-500",
    hasAI: false,
  },
  InterestMatch: {
    icon: Heart,
    label: "آپ کو پسند آسکتا ہے",
    color: "bg-purple-50/80 dark:bg-purple-950/30 border-purple-200/50 dark:border-purple-900/50",
    badgeColor: "bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30",
    iconColor: "text-purple-600 dark:text-purple-400",
    dotColor: "bg-purple-500",
    hasAI: false,
  },
  default: {
    icon: Bell,
    label: "اطلاع",
    color: "bg-muted/30 dark:bg-muted/10 border-border/50",
    badgeColor: "bg-muted/20 text-muted-foreground border-border/30",
    iconColor: "text-muted-foreground",
    dotColor: "bg-muted-foreground",
    hasAI: false,
  },
};

export function UrduNotificationBell() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  // Polling replaces SSE to avoid keeping Autoscale instances alive per user.
  const { data, isLoading } = useQuery<NotificationsResponse>({
    queryKey: ["/api/me/notifications", "ur"],
    queryFn: async () => {
      const response = await fetch("/api/me/notifications?limit=20&unreadOnly=true&language=ur", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch notifications");
      }
      return response.json();
    },
    enabled: !!user,
    refetchInterval: user ? 60_000 : false,
    refetchIntervalInBackground: false,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiRequest(`/api/me/notifications/${notificationId}/read`, {
        method: "PATCH",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/notifications", "ur"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("/api/me/notifications/read-all", {
        method: "PATCH",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/notifications", "ur"] });
      toast({
        title: "اپ ڈیٹ ہوگیا",
        description: "تمام اطلاعات کو پڑھا ہوا نشان زد کر دیا گیا",
      });
    },
  });

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsReadMutation.mutate(notification.id);
    }
    setOpen(false);
  };

  const getNotificationStyle = (type: string) => {
    return notificationStyles[type as keyof typeof notificationStyles] || notificationStyles.default;
  };

  const unreadCount = data?.unreadCount || 0;
  const notifications = data?.notifications || [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          data-testid="button-notifications"
        >
          <Bell className={`h-5 w-5 transition-all ${unreadCount > 0 ? 'animate-pulse' : ''}`} />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -left-1 h-5 w-5 flex items-center justify-center p-0 text-xs font-bold animate-pulse"
              data-testid="badge-unread-count"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[420px] p-0 overflow-hidden backdrop-blur-sm bg-background/95"
        align="start"
        sideOffset={8}
        data-testid="popover-notifications"
      >
        {/* Header */}
        <div className="p-4 border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-base">اطلاعات</h3>
                <p className="text-xs text-muted-foreground">
                  {unreadCount > 0
                    ? `${unreadCount} نئی اطلاع${unreadCount > 1 ? 'ات' : ''}`
                    : "سب پڑھ لیا گیا"}
                </p>
              </div>
            </div>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllAsReadMutation.mutate()}
                disabled={markAllAsReadMutation.isPending}
                className="h-8 text-xs hover-elevate active-elevate-2"
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="h-4 w-4 ml-1" />
                سب نشان زد کریں
              </Button>
            )}
          </div>
        </div>

        {/* Notifications List */}
        <ScrollArea className="h-[500px]">
          {isLoading ? (
            <div className="p-8 flex flex-col items-center justify-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="text-sm text-muted-foreground">اطلاعات لوڈ ہو رہی ہیں...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-12 flex flex-col items-center justify-center gap-4">
              <div className="p-4 bg-muted/30 rounded-full">
                <Bell className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="text-center">
                <h4 className="font-medium text-sm mb-1">کوئی نئی اطلاع نہیں</h4>
                <p className="text-xs text-muted-foreground max-w-[250px]">
                  جب کچھ نیا ہوگا ہم آپ کو مطلع کریں گے
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => {
                const style = getNotificationStyle(notification.type);
                const Icon = style.icon;
                const metadata = notification.metadata || {};

                return (
                  <Link
                    key={notification.id}
                    href={notification.deeplink || "/ur/notifications"}
                  >
                    <button
                      onClick={() => handleNotificationClick(notification)}
                      className={`w-full p-4 text-right transition-all hover-elevate active-elevate-2 border-r-4 ${
                        notification.read 
                          ? 'border-r-transparent bg-background' 
                          : `${style.color} border-r-${style.dotColor.replace('bg-', '')}`
                      }`}
                      data-testid={`notification-${notification.id}`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Content */}
                        <div className="flex-1 min-w-0 space-y-2">
                          {/* Type Badge & Time */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatDistanceToNow(new Date(notification.createdAt), {
                                addSuffix: true,
                                locale: ar,
                              })}
                            </span>
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${style.badgeColor} border-0 gap-1`}
                            >
                              {style.label}
                              {style.hasAI && <Sparkles className="h-3 w-3" />}
                            </Badge>
                          </div>

                          {/* Title */}
                          <h4 className={`font-semibold text-sm leading-tight ${
                            notification.read ? 'text-muted-foreground' : 'text-foreground'
                          }`}>
                            {notification.title}
                          </h4>

                          {/* Body */}
                          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                            {notification.body}
                          </p>

                          {/* Article Image (if available) */}
                          {metadata.imageUrl && (
                            <div className="mt-2 rounded-md overflow-hidden">
                              <img
                                src={metadata.imageUrl}
                                alt=""
                                className="w-full h-32 object-cover"
                              />
                            </div>
                          )}

                          {/* Read Indicator */}
                          {!notification.read && (
                            <div className="flex items-center gap-2 text-xs text-primary justify-end">
                              <span className="font-medium">نیا</span>
                              <div className={`h-2 w-2 rounded-full ${style.dotColor} animate-pulse`} />
                            </div>
                          )}
                        </div>

                        {/* Icon */}
                        <div className={`p-2 rounded-lg ${style.badgeColor} flex-shrink-0`}>
                          <Icon className={`h-4 w-4 ${style.iconColor}`} />
                        </div>
                      </div>
                    </button>
                  </Link>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {notifications.length > 0 && (
          <>
            <Separator />
            <div className="p-3 bg-muted/20">
              <Link href="/ur/notifications">
                <Button
                  variant="ghost"
                  className="w-full justify-between hover-elevate active-elevate-2"
                  onClick={() => setOpen(false)}
                  data-testid="button-view-all"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="text-sm font-medium">تمام اطلاعات دیکھیں</span>
                </Button>
              </Link>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
