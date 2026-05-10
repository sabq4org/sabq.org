import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Bell, 
  AlertCircle, 
  Star, 
  Newspaper, 
  CheckCheck, 
  Settings,
  Bot,
  Sparkles,
  Zap,
  MessageCircle,
  Heart
} from "lucide-react";
import { formatDistanceToNow, isToday, isYesterday, isThisWeek } from "date-fns";
import { arSA } from "date-fns/locale";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  deeplink: string | null;
  read: boolean;
  metadata: {
    articleId?: string;
    imageUrl?: string;
    categorySlug?: string;
    recommendationType?: string;
  } | null;
  createdAt: string;
}

interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
}

type FilterType = "all" | "ArticlePublished" | "BreakingNews" | "FeaturedArticle" | "recommendation";

// تصنيف الإشعارات حسب النوع مع ألوان وأيقونات مميزة
const notificationStyles = {
  recommendation: {
    icon: Bot,
    label: "توصية ذكية",
    color: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/50",
    badgeColor: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    iconColor: "text-blue-600 dark:text-blue-400",
    dotColor: "bg-blue-500",
    hasAI: true,
  },
  ArticlePublished: {
    icon: Newspaper,
    label: "مقال جديد",
    color: "bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800/50",
    badgeColor: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    iconColor: "text-gray-600 dark:text-gray-400",
    dotColor: "bg-gray-500",
    hasAI: false,
  },
  BreakingNews: {
    icon: AlertCircle,
    label: "خبر عاجل",
    color: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50",
    badgeColor: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    iconColor: "text-red-600 dark:text-red-400",
    dotColor: "bg-red-500",
    hasAI: false,
  },
  FeaturedArticle: {
    icon: Star,
    label: "محتوى مميز",
    color: "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900/50",
    badgeColor: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
    iconColor: "text-yellow-600 dark:text-yellow-400",
    dotColor: "bg-yellow-500",
    hasAI: false,
  },
  InterestMatch: {
    icon: Heart,
    label: "قد يهمك",
    color: "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-900/50",
    badgeColor: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    iconColor: "text-purple-600 dark:text-purple-400",
    dotColor: "bg-purple-500",
    hasAI: false,
  },
  default: {
    icon: Bell,
    label: "إشعار",
    color: "bg-muted/30 dark:bg-muted/10 border-border/50",
    badgeColor: "bg-muted text-muted-foreground",
    iconColor: "text-muted-foreground",
    dotColor: "bg-muted-foreground",
    hasAI: false,
  },
};

// تجميع الإشعارات حسب الوقت
function groupNotificationsByTime(notifications: Notification[]) {
  const today: Notification[] = [];
  const yesterday: Notification[] = [];
  const thisWeek: Notification[] = [];
  const older: Notification[] = [];

  notifications.forEach(notification => {
    const date = new Date(notification.createdAt);
    if (isToday(date)) {
      today.push(notification);
    } else if (isYesterday(date)) {
      yesterday.push(notification);
    } else if (isThisWeek(date)) {
      thisWeek.push(notification);
    } else {
      older.push(notification);
    }
  });

  return { today, yesterday, thisWeek, older };
}

export default function UserNotifications() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [filter, setFilter] = useState<FilterType>("all");

  // Fetch user for header
  const { data: user } = useQuery<{ id: string; name?: string; email?: string; role?: string; profileImageUrl?: string | null }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data, isLoading, error } = useQuery<NotificationsResponse>({
    queryKey: ["/api/notifications", { limit: 100 }],
    queryFn: async () => {
      const res = await fetch("/api/notifications?limit=100", { credentials: 'include' });
      if (!res.ok) {
        const err = new Error("Failed to fetch notifications");
        (err as any).status = res.status;
        throw err;
      }
      return res.json();
    },
    retry: false,
  });

  // Redirect to login if unauthorized
  useEffect(() => {
    if (error && (error as any).status === 401) {
      navigate("/login?redirect=" + encodeURIComponent(location));
    }
  }, [error, navigate, location]);

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
        title: "تم تحديث الإشعارات",
        description: "تم تمييز جميع الإشعارات كمقروءة",
      });
    },
  });

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsReadMutation.mutate(notification.id);
    }

    if (notification.deeplink) {
      navigate(notification.deeplink);
    }
  };

  const getNotificationStyle = (type: string) => {
    return notificationStyles[type as keyof typeof notificationStyles] || notificationStyles.default;
  };

  const filteredNotifications =
    filter === "all"
      ? data?.notifications || []
      : data?.notifications.filter((n) => n.type === filter) || [];

  const groupedNotifications = useMemo(() => {
    return groupNotificationsByTime(filteredNotifications);
  }, [filteredNotifications]);

  const unreadCount = data?.unreadCount || 0;

  // Render notification card
  const renderNotificationCard = (notification: Notification) => {
    const style = getNotificationStyle(notification.type);
    const Icon = style.icon;

    return (
      <Card
        key={notification.id}
        className={`
          group relative overflow-hidden transition-all duration-300
          hover:-translate-y-0.5 hover:shadow-lg
          cursor-pointer
          ${!notification.read ? style.color : ""}
          ${!notification.read ? "border-l-4" : ""}
          backdrop-blur-sm
        `}
        onClick={() => handleNotificationClick(notification)}
        data-testid={`card-notification-${notification.id}`}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            {/* أيقونة أو صورة المقال */}
            {notification.metadata?.imageUrl ? (
              <div className="relative flex-shrink-0">
                <img
                  src={notification.metadata.imageUrl}
                  alt={notification.title}
                  className="w-16 h-16 object-cover rounded-lg ring-2 ring-offset-2 ring-offset-background ring-border/50"
                  data-testid={`image-article-${notification.id}`}
                />
                {style.hasAI && (
                  <div className="absolute -top-1 -right-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full p-1">
                    <Sparkles className="h-3 w-3 text-white" />
                  </div>
                )}
              </div>
            ) : (
              <div className={`flex-shrink-0 p-3 rounded-lg ${style.badgeColor} relative`}>
                <Icon className={`h-5 w-5 ${style.iconColor}`} />
                {style.hasAI && (
                  <div className="absolute -top-1 -right-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full p-0.5">
                    <Sparkles className="h-2.5 w-2.5 text-white" />
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 min-w-0 space-y-2">
              {/* الشريط العلوي: نوع الإشعار + الوقت */}
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary" className={`${style.badgeColor} border-none`} data-testid={`badge-type-${notification.id}`}>
                  {style.hasAI && <Zap className="h-3 w-3 mr-1" />}
                  {style.label}
                </Badge>
                <span
                  className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1"
                  data-testid={`text-time-${notification.id}`}
                >
                  {formatDistanceToNow(new Date(notification.createdAt), {
                    addSuffix: true,
                    locale: arSA,
                  })}
                </span>
              </div>

              {/* العنوان */}
              <h3
                className="font-bold text-base leading-tight group-hover:text-primary transition-colors"
                data-testid={`text-title-${notification.id}`}
              >
                {notification.title}
              </h3>

              {/* الوصف */}
              <p
                className="text-sm text-muted-foreground leading-relaxed line-clamp-2"
                data-testid={`text-body-${notification.id}`}
              >
                {notification.body}
              </p>

              {/* مؤشر غير مقروء */}
              {!notification.read && (
                <div className="flex items-center gap-2 pt-1">
                  <div
                    className={`h-2 w-2 rounded-full ${style.dotColor} animate-pulse`}
                    data-testid={`indicator-unread-${notification.id}`}
                  />
                  <span className={`text-xs font-medium ${style.iconColor}`}>
                    جديد
                  </span>
                </div>
              )}
            </div>
          </div>
        </CardContent>

        {/* خط تزييني */}
        {!notification.read && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
        )}
      </Card>
    );
  };

  // Render notification group
  const renderNotificationGroup = (title: string, notifications: Notification[]) => {
    if (notifications.length === 0) return null;

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 sticky top-0 z-10 bg-background/80 backdrop-blur-sm py-2">
          <div className="h-px flex-1 bg-border" />
          <h2 className="text-sm font-semibold text-muted-foreground px-3">{title}</h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="space-y-3">
          {notifications.map(notification => renderNotificationCard(notification))}
        </div>
      </div>
    );
  };

  if (error) {
    return (
      <>
        <Header user={user} />
        <main className="min-h-screen bg-background py-8">
          <div className="container max-w-4xl mx-auto px-4">
            <div className="flex flex-col items-center justify-center h-[400px] text-center">
              <AlertCircle className="h-16 w-16 text-destructive mb-4" />
              <h2 className="text-2xl font-bold mb-2">حدث خطأ</h2>
              <p className="text-muted-foreground" data-testid="text-error">
                فشل تحميل الإشعارات. يرجى المحاولة مرة أخرى.
              </p>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header user={user} />
      <main className="min-h-screen bg-background py-4 sm:py-8">
        <div className="container max-w-4xl mx-auto px-3 sm:px-4">
          <div className="space-y-4 sm:space-y-6" dir="rtl">
            {/* Header - Mobile Optimized */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-2 sm:gap-3" data-testid="text-page-title">
                  <div className="p-1.5 sm:p-2 bg-primary/10 rounded-lg">
                    <Bell className="h-5 w-5 sm:h-7 sm:w-7 text-primary" />
                  </div>
                  الإشعارات
                </h1>
                
                <Link href="/recommendation-settings">
                  <Button
                    variant="ghost"
                    size="icon"
                    data-testid="button-recommendation-settings"
                  >
                    <Settings className="h-5 w-5" />
                  </Button>
                </Link>
              </div>
              
              {/* Unread count + Mark all as read - Always visible */}
              <div className="flex items-center justify-between gap-2 bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  {unreadCount > 0 ? (
                    <>
                      <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                        {unreadCount}
                      </span>
                      <span className="text-sm text-muted-foreground" data-testid="text-unread-count">
                        إشعار غير مقروء
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground flex items-center gap-2">
                      <CheckCheck className="h-4 w-4 text-green-500" />
                      لا توجد إشعارات جديدة
                    </span>
                  )}
                </div>
                
                {unreadCount > 0 && !isLoading && (
                  <Button
                    onClick={() => markAllAsReadMutation.mutate()}
                    disabled={markAllAsReadMutation.isPending}
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs"
                    data-testid="button-mark-all-read"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    قراءة الكل
                  </Button>
                )}
              </div>
            </div>

            {/* Filter Tabs - Horizontal Scroll */}
            <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
              <div className="overflow-x-auto -mx-3 px-3 pb-1">
                <TabsList className="inline-flex h-auto p-1 gap-1" data-testid="tabs-filter">
                  <TabsTrigger value="all" data-testid="tab-all" className="gap-1.5 px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                    <Bell className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    الكل
                    <Badge variant="secondary" className="mr-0.5 text-[10px] px-1.5" data-testid="badge-count-all">
                      {data?.notifications?.length || 0}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="BreakingNews" data-testid="tab-breaking-news" className="gap-1.5 px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                    <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    عاجل
                    <Badge variant="secondary" className="mr-0.5 text-[10px] px-1.5" data-testid="badge-count-breaking-news">
                      {data?.notifications?.filter((n) => n.type === "BreakingNews").length || 0}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="ArticlePublished" data-testid="tab-article-published" className="gap-1.5 px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                    <Newspaper className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    جديد
                    <Badge variant="secondary" className="mr-0.5 text-[10px] px-1.5" data-testid="badge-count-article-published">
                      {data?.notifications?.filter((n) => n.type === "ArticlePublished").length || 0}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="recommendation" data-testid="tab-recommendation" className="gap-1.5 px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                    <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    توصيات
                  </TabsTrigger>
                  <TabsTrigger value="FeaturedArticle" data-testid="tab-featured-article" className="gap-1.5 px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                    <Star className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    مميز
                  </TabsTrigger>
                </TabsList>
              </div>
            </Tabs>

            {/* Loading State */}
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="relative">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                  <Bot className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-primary" />
                </div>
                <p className="text-muted-foreground mt-4" data-testid="text-loading">
                  جاري تحميل الإشعارات الذكية...
                </p>
              </div>
            ) : filteredNotifications.length === 0 ? (
              /* Empty State */
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="relative mb-6">
                  <div className="absolute inset-0 bg-primary/10 blur-2xl rounded-full" />
                  <Bell className="relative h-20 w-20 text-muted-foreground opacity-30" />
                </div>
                <h2 className="text-xl font-semibold mb-2">لا توجد إشعارات</h2>
                <p className="text-muted-foreground max-w-sm" data-testid="text-no-notifications">
                  {filter === "all"
                    ? "ستظهر هنا جميع إشعاراتك الذكية عندما تكون متاحة"
                    : `لا توجد إشعارات من نوع "${getNotificationStyle(filter).label}"`}
                </p>
              </div>
            ) : (
              /* Notifications List with Time Grouping */
              <div className="space-y-8">
                {renderNotificationGroup("اليوم", groupedNotifications.today)}
                {renderNotificationGroup("أمس", groupedNotifications.yesterday)}
                {renderNotificationGroup("هذا الأسبوع", groupedNotifications.thisWeek)}
                {renderNotificationGroup("أقدم", groupedNotifications.older)}
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
