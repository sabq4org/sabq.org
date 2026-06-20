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
  ArrowLeft,
  Trash2
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
import { arSA } from "date-fns/locale";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";
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

// تصنيف الإشعارات حسب النوع مع ألوان وأيقونات مميزة
const notificationStyles = {
  recommendation: {
    icon: Bot,
    label: "توصية ذكية",
    color: "bg-blue-50/80 dark:bg-blue-950/30 border-blue-200/50 dark:border-blue-900/50",
    badgeColor: "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30",
    iconColor: "text-blue-600 dark:text-blue-400",
    dotColor: "bg-blue-500",
    hasAI: true,
  },
  ArticlePublished: {
    icon: Newspaper,
    label: "مقال جديد",
    color: "bg-gray-50/80 dark:bg-gray-950/30 border-gray-200/50 dark:border-gray-800/50",
    badgeColor: "bg-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30",
    iconColor: "text-gray-600 dark:text-gray-400",
    dotColor: "bg-gray-500",
    hasAI: false,
  },
  BreakingNews: {
    icon: AlertCircle,
    label: "عاجل",
    color: "bg-red-50/80 dark:bg-red-950/30 border-red-200/50 dark:border-red-900/50",
    badgeColor: "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30",
    iconColor: "text-red-600 dark:text-red-400",
    dotColor: "bg-red-500",
    hasAI: false,
  },
  FeaturedArticle: {
    icon: Star,
    label: "مميز",
    color: "bg-yellow-50/80 dark:bg-yellow-950/30 border-yellow-200/50 dark:border-yellow-900/50",
    badgeColor: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/30",
    iconColor: "text-yellow-600 dark:text-yellow-400",
    dotColor: "bg-yellow-500",
    hasAI: false,
  },
  InterestMatch: {
    icon: Heart,
    label: "قد يهمك",
    color: "bg-purple-50/80 dark:bg-purple-950/30 border-purple-200/50 dark:border-purple-900/50",
    badgeColor: "bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30",
    iconColor: "text-purple-600 dark:text-purple-400",
    dotColor: "bg-purple-500",
    hasAI: false,
  },
  default: {
    icon: Bell,
    label: "إشعار",
    color: "bg-muted/30 dark:bg-muted/10 border-border/50",
    badgeColor: "bg-muted/20 text-muted-foreground border-border/30",
    iconColor: "text-muted-foreground",
    dotColor: "bg-muted-foreground",
    hasAI: false,
  },
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  // Polling replaces SSE to avoid keeping Autoscale instances alive per user.
  const { data, isLoading } = useQuery<NotificationsResponse>({
    queryKey: ["/api/notifications", { limit: 20, read: false }],
    queryFn: getQueryFn<NotificationsResponse>({ on401: "returnNull", silent: true }),
    enabled: !!user,
    refetchInterval: user ? 60_000 : false,
    refetchIntervalInBackground: false,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiRequest(`/api/notifications/${notificationId}/read`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("/api/notifications/read-all", {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({
        title: "تم التحديث",
        description: "تم تمييز جميع الإشعارات كمقروءة",
      });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("/api/notifications/clear", {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({
        title: "تم المسح",
        description: "تم مسح جميع الإشعارات",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        description: "تعذّر مسح الإشعارات، حاول مجددًا",
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
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs font-bold animate-pulse"
              data-testid="badge-unread-count"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[420px] p-0 overflow-hidden backdrop-blur-sm bg-background/95"
        align="end"
        sideOffset={8}
        data-testid="popover-notifications"
      >
        {/* Header */}
        <div className="p-4 border-b bg-muted/30" dir="rtl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-base" data-testid="text-notifications-title">
                  الإشعارات
                </h3>
                {unreadCount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {unreadCount} غير مقروء
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => markAllAsReadMutation.mutate()}
                  disabled={markAllAsReadMutation.isPending}
                  className="gap-2"
                  data-testid="button-mark-all-read"
                >
                  <CheckCheck className="h-4 w-4" />
                  <span className="text-xs">تحديد الكل</span>
                </Button>
              )}
              {notifications.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => clearAllMutation.mutate()}
                  disabled={clearAllMutation.isPending}
                  className="gap-2 text-destructive hover:text-destructive"
                  data-testid="button-clear-all"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="text-xs">مسح الكل</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="relative">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
              <Bot className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-5 w-5 text-primary" />
            </div>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground" dir="rtl">
            <div className="relative mb-4">
              <div className="absolute inset-0 bg-primary/10 blur-xl rounded-full" />
              <Bell className="relative h-16 w-16 opacity-20" />
            </div>
            <p className="text-sm font-medium" data-testid="text-no-notifications">
              لا توجد إشعارات
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              ستظهر هنا عندما تكون متاحة
            </p>
          </div>
        ) : (
          <>
            <ScrollArea className="h-[460px]">
              <div className="p-3 space-y-2" dir="rtl">
                {notifications.map((notification) => {
                  const style = getNotificationStyle(notification.type);
                  const Icon = style.icon;

                  const content = (
                    <div
                      className={`
                        group relative overflow-hidden rounded-lg p-3 
                        transition-all duration-200
                        hover:-translate-y-0.5 hover:shadow-md
                        cursor-pointer border
                        ${!notification.read ? style.color : "bg-card/50 border-border/50"}
                      `}
                      onClick={() => handleNotificationClick(notification)}
                      data-testid={`notification-${notification.id}`}
                    >
                      <div className="flex items-start gap-3">
                        {/* أيقونة أو صورة المقال */}
                        {notification.metadata?.imageUrl ? (
                          <div className="relative flex-shrink-0">
                            <img
                              src={notification.metadata.imageUrl}
                              alt={notification.title}
                              className="w-12 h-12 object-cover rounded-md ring-1 ring-border/50"
                            />
                            {style.hasAI && (
                              <div className="absolute -top-1 -right-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full p-0.5">
                                <Sparkles className="h-2.5 w-2.5 text-white" />
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className={`flex-shrink-0 p-2 rounded-md ${style.badgeColor} border relative`}>
                            <Icon className={`h-4 w-4 ${style.iconColor}`} />
                            {style.hasAI && (
                              <div className="absolute -top-1 -right-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full p-0.5">
                                <Sparkles className="h-2 w-2 text-white" />
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex-1 min-w-0 space-y-1.5">
                          {/* الشريط العلوي */}
                          <div className="flex items-center justify-between gap-2">
                            <Badge 
                              variant="secondary" 
                              className={`${style.badgeColor} text-xs border`}
                            >
                              {style.hasAI && <Zap className="h-2.5 w-2.5 mr-1" />}
                              {style.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatDistanceToNow(new Date(notification.createdAt), {
                                addSuffix: true,
                                locale: arSA,
                              })}
                            </span>
                          </div>

                          {/* العنوان */}
                          <h4 className="font-semibold text-sm leading-tight line-clamp-1 group-hover:text-primary transition-colors">
                            {notification.title}
                          </h4>

                          {/* الوصف */}
                          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                            {notification.body}
                          </p>

                          {/* مؤشر غير مقروء */}
                          {!notification.read && (
                            <div className="flex items-center gap-1.5 pt-0.5">
                              <div className={`h-1.5 w-1.5 rounded-full ${style.dotColor} animate-pulse`} />
                              <span className={`text-xs font-medium ${style.iconColor}`}>
                                جديد
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* خط تزييني للإشعارات غير المقروءة */}
                      {!notification.read && (
                        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
                      )}
                    </div>
                  );

                  return notification.deeplink ? (
                    <Link key={notification.id} href={notification.deeplink}>
                      <a>{content}</a>
                    </Link>
                  ) : (
                    <div key={notification.id}>{content}</div>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="border-t bg-muted/20 p-3" dir="rtl">
              <Link href="/notifications">
                <a
                  className="flex items-center justify-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors font-medium py-2 hover:bg-primary/5 rounded-md"
                  onClick={() => setOpen(false)}
                  data-testid="link-view-all-notifications"
                >
                  <span>مشاهدة كل الإشعارات</span>
                  <ArrowLeft className="h-4 w-4" />
                </a>
              </Link>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
