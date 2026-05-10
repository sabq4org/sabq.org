import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, AlertCircle, Star, Newspaper, CheckCheck, Settings } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation, Link } from "wouter";
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
  } | null;
  createdAt: string;
}

interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
}

type FilterType = "all" | "ArticlePublished" | "BreakingNews" | "FeaturedArticle";

export default function Notifications() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [filter, setFilter] = useState<FilterType>("all");
  
  // Check if we're in dashboard or user view
  const isDashboard = location.startsWith("/dashboard");

  // Fetch user for header
  const { data: user } = useQuery<{ id: string; name?: string; email?: string; role?: string; profileImageUrl?: string | null }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data, isLoading, error } = useQuery<NotificationsResponse>({
    queryKey: ["/api/notifications", { limit: 100 }],
    queryFn: async () => {
      const res = await fetch("/api/notifications?limit=100", { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return res.json();
    },
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
        title: "تم تحديث الإشعارات",
        description: "تم تمييز جميع الإشعارات كمقروءة",
      });
    },
  });

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read if unread
    if (!notification.read) {
      markAsReadMutation.mutate(notification.id);
    }

    // Navigate to article if deeplink exists
    if (notification.deeplink) {
      navigate(notification.deeplink);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "ArticlePublished":
        return <Bell className="h-5 w-5 text-blue-500" />;
      case "BreakingNews":
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case "FeaturedArticle":
        return <Star className="h-5 w-5 text-yellow-500" />;
      case "InterestMatch":
        return <Bell className="h-5 w-5 text-primary" />;
      default:
        return <Newspaper className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      ArticlePublished: "مقال جديد",
      BreakingNews: "أخبار عاجلة",
      FeaturedArticle: "مقال مميز",
      InterestMatch: "قد يهمك",
      LikedStoryUpdate: "تحديث",
      MostReadTodayForYou: "الأكثر قراءة",
    };
    return labels[type] || type;
  };

  const filteredNotifications =
    filter === "all"
      ? data?.notifications || []
      : data?.notifications.filter((n) => n.type === filter) || [];

  const unreadCount = data?.unreadCount || 0;

  const contentJSX = (
    <div className="space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">
              الإشعارات
            </h1>
            {unreadCount > 0 && (
              <p className="text-muted-foreground mt-1" data-testid="text-unread-count">
                لديك {unreadCount} إشعار غير مقروء
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Link href="/recommendation-settings">
              <Button
                variant="outline"
                data-testid="button-recommendation-settings"
              >
                <Settings className="h-4 w-4 ml-2" />
                إعدادات التوصيات
              </Button>
            </Link>
            
            {unreadCount > 0 && !isLoading && (
              <Button
                onClick={() => markAllAsReadMutation.mutate()}
                disabled={markAllAsReadMutation.isPending}
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="h-4 w-4 ml-2" />
                تمييز الكل كمقروء
              </Button>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
          <TabsList className="w-full justify-start" data-testid="tabs-filter">
            <TabsTrigger value="all" data-testid="tab-all">
              الكل
              {data && filter === "all" && (
                <Badge variant="secondary" className="mr-2" data-testid="badge-count-all">
                  {data.notifications.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="ArticlePublished" data-testid="tab-article-published">
              مقالات جديدة
              {data && (
                <Badge variant="secondary" className="mr-2" data-testid="badge-count-article-published">
                  {data.notifications.filter((n) => n.type === "ArticlePublished").length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="BreakingNews" data-testid="tab-breaking-news">
              أخبار عاجلة
              {data && (
                <Badge variant="secondary" className="mr-2" data-testid="badge-count-breaking-news">
                  {data.notifications.filter((n) => n.type === "BreakingNews").length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="FeaturedArticle" data-testid="tab-featured-article">
              مقالات مميزة
              {data && (
                <Badge variant="secondary" className="mr-2" data-testid="badge-count-featured-article">
                  {data.notifications.filter((n) => n.type === "FeaturedArticle").length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Loading State */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
            <p className="text-muted-foreground" data-testid="text-loading">
              جاري تحميل الإشعارات...
            </p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Bell className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
            <h2 className="text-xl font-semibold mb-2">لا توجد إشعارات</h2>
            <p className="text-muted-foreground" data-testid="text-no-notifications">
              {filter === "all"
                ? "لم تتلق أي إشعارات بعد"
                : `لا توجد إشعارات من نوع ${getTypeLabel(filter)}`}
            </p>
          </div>
        ) : (
          /* Notifications List */
          <div className="space-y-3">
            {filteredNotifications.map((notification) => (
              <Card
                key={notification.id}
                className={`transition-all hover-elevate active-elevate-2 cursor-pointer ${
                  !notification.read
                    ? "bg-primary/5 border-primary/20"
                    : ""
                }`}
                onClick={() => handleNotificationClick(notification)}
                data-testid={`card-notification-${notification.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className="mt-1 flex-shrink-0">
                      {getTypeIcon(notification.type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Header: Type badge and time */}
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="secondary" data-testid={`badge-type-${notification.id}`}>
                          {getTypeLabel(notification.type)}
                        </Badge>
                        <span
                          className="text-xs text-muted-foreground whitespace-nowrap"
                          data-testid={`text-time-${notification.id}`}
                        >
                          {formatDistanceToNow(new Date(notification.createdAt), {
                            addSuffix: true,
                            locale: arSA,
                          })}
                        </span>
                      </div>

                      {/* Title */}
                      <h3
                        className="font-semibold text-lg leading-tight"
                        data-testid={`text-title-${notification.id}`}
                      >
                        {notification.title}
                      </h3>

                      {/* Body */}
                      <p
                        className="text-muted-foreground leading-relaxed"
                        data-testid={`text-body-${notification.id}`}
                      >
                        {notification.body}
                      </p>

                      {/* Unread indicator (dot) */}
                      {!notification.read && (
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2 w-2 rounded-full bg-blue-500"
                            data-testid={`indicator-unread-${notification.id}`}
                          />
                          <span className="text-xs text-blue-600 font-medium">
                            جديد
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
    </div>
  );

  if (error) {
    const errorContent = (
      <div className="flex flex-col items-center justify-center h-[400px] text-center">
        <AlertCircle className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-bold mb-2">حدث خطأ</h2>
        <p className="text-muted-foreground" data-testid="text-error">
          فشل تحميل الإشعارات. يرجى المحاولة مرة أخرى.
        </p>
      </div>
    );

    return isDashboard ? (
      <DashboardLayout>{errorContent}</DashboardLayout>
    ) : (
      <>
        <Header user={user} />
        <main className="min-h-screen bg-background py-8">
          <div className="container max-w-4xl mx-auto px-4">
            {errorContent}
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return isDashboard ? (
    <DashboardLayout>{contentJSX}</DashboardLayout>
  ) : (
    <>
      <Header user={user} />
      <main className="min-h-screen bg-background py-8">
        <div className="container max-w-4xl mx-auto px-4">
          {contentJSX}
        </div>
      </main>
      <Footer />
    </>
  );
}
