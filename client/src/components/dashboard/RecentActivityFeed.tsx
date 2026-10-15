import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  MessageSquare,
  Heart,
  UserPlus,
  Edit,
  Trash2,
  Activity as ActivityIcon,
  CheckCircle2,
  Sparkles,
} from "lucide-react";

interface ActivityItem {
  id: string;
  type: "article" | "comment" | "like" | "follow" | "edit" | "delete" | "other" | string;
  user: {
    name: string;
    avatar?: string;
  };
  description: string;
  timestamp: string;
  metadata?: {
    articleTitle?: string;
    commentText?: string;
  };
}

const activityIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  article: FileText,
  comment: MessageSquare,
  like: Heart,
  follow: UserPlus,
  edit: Edit,
  delete: Trash2,
  other: Sparkles,
};

const activityColors: Record<string, string> = {
  article: "text-blue-500 bg-blue-500/10",
  comment: "text-emerald-500 bg-emerald-500/10",
  like: "text-rose-500 bg-rose-500/10",
  follow: "text-violet-500 bg-violet-500/10",
  edit: "text-amber-500 bg-amber-500/10",
  delete: "text-red-500 bg-red-500/10",
  other: "text-primary bg-primary/10",
};

const activityTypeLabels: Record<string, string> = {
  article: "نشر خبر",
  comment: "تعليق",
  like: "إعجاب",
  follow: "متابعة",
  edit: "تحديث",
  delete: "حذف",
  other: "نشاط",
};

function translateDescription(desc: string | undefined): string {
  if (!desc) return "نفّذ إجراءً في المنصة";
  const normalized = desc.trim();
  const map: Record<string, string> = {
    ArticlePublished: "نشر مقالاً إخبارياً",
    article_published: "نشر مقالاً إخبارياً",
    created: "أنشأ مسودة خبر جديدة",
    article_created: "أنشأ مسودة خبر جديدة",
    updated: "حدّث بيانات المقال",
    article_updated: "حدّث بيانات المقال",
    deleted: "حذف مادة إخبارية",
    keyword_followed: "تابع وسماً إخبارياً",
    keyword_unfollowed: "ألغى متابعة وسم",
    login: "سجّل الدخول إلى النظام",
  };
  return map[normalized] || normalized;
}

export default function RecentActivityFeed() {
  const { data: activitiesRaw, isLoading } = useQuery<ActivityItem[]>({
    queryKey: ["/api/analytics/recent-activity"],
  });

  const activities = Array.isArray(activitiesRaw) ? activitiesRaw : [];

  if (isLoading) {
    return (
      <Card className="h-full border-border/60">
        <CardHeader>
          <div className="h-6 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-48 animate-pulse rounded bg-muted" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const getRelativeTime = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = Math.floor((now.getTime() - time.getTime()) / 1000);

    if (Number.isNaN(diff) || diff < 60) return "منذ لحظات";
    if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
    if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
    return `منذ ${Math.floor(diff / 86400)} يوم`;
  };

  return (
    <Card className="h-full border-border/60">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border/50 pb-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ActivityIcon className="h-5 w-5 text-emerald-500" />
            النشاط الفوري في المنصة
          </CardTitle>
          <CardDescription className="mt-1">آخر التحديثات والعمليات التحريرية</CardDescription>
        </div>
        <Badge variant="secondary" className="gap-1 text-xs">
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          مباشر
        </Badge>
      </CardHeader>
      <CardContent className="pt-4">
        {activities.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            لا توجد أنشطة حديثة مسجلة
          </div>
        ) : (
          <div className="max-h-[580px] space-y-2.5 overflow-y-auto pl-1">
            {activities.map((activity) => {
              const Icon = activityIcons[activity.type] || Sparkles;
              const colorClass = activityColors[activity.type] || activityColors.other;
              const badgeLabel =
                activity.description === "ArticlePublished"
                  ? "نشر خبر"
                  : activityTypeLabels[activity.type] || "نشاط";
              const userName = activity.user?.name?.trim() || "مستخدم";

              return (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/15 p-3 transition-colors hover:bg-muted/30"
                >
                  <Avatar className="h-8 w-8 shrink-0 border border-border/60">
                    <AvatarImage src={activity.user?.avatar} alt={userName} />
                    <AvatarFallback className="text-xs font-bold">
                      {userName.charAt(0)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${colorClass}`}>
                          <Icon className="h-3 w-3" />
                        </span>
                        <span className="truncate text-xs font-semibold text-foreground">
                          {userName}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {badgeLabel}
                        </Badge>
                      </div>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {getRelativeTime(activity.timestamp)}
                      </span>
                    </div>

                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      {translateDescription(activity.description)}
                    </p>

                    {activity.metadata?.articleTitle && (
                      <p className="mt-0.5 truncate text-xs font-medium text-primary">
                        {activity.metadata.articleTitle}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
