import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { FileText, MessageSquare, Heart, UserPlus, Edit, Trash2 } from "lucide-react";

interface Activity {
  id: string;
  type: 'article' | 'comment' | 'like' | 'follow' | 'edit' | 'delete';
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

const activityIcons = {
  article: FileText,
  comment: MessageSquare,
  like: Heart,
  follow: UserPlus,
  edit: Edit,
  delete: Trash2
};

const activityColors = {
  article: "text-blue-600",
  comment: "text-green-600",
  like: "text-red-600",
  follow: "text-purple-600",
  edit: "text-yellow-600",
  delete: "text-gray-600"
};

export default function RecentActivityFeed() {
  const { data: activities, isLoading } = useQuery<Activity[]>({
    queryKey: ['/api/analytics/recent-activity'],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-6 w-32 bg-muted rounded animate-pulse"></div>
          <div className="h-4 w-48 bg-muted rounded animate-pulse mt-2"></div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-muted animate-pulse"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 bg-muted rounded animate-pulse"></div>
                  <div className="h-3 w-1/2 bg-muted rounded animate-pulse"></div>
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

    if (diff < 60) return 'منذ لحظات';
    if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
    if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
    return `منذ ${Math.floor(diff / 86400)} يوم`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>النشاط الأخير</CardTitle>
        <CardDescription>آخر التحديثات والأنشطة على المنصة</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
          {activities?.map((activity) => {
            const Icon = activityIcons[activity.type];
            const colorClass = activityColors[activity.type];

            return (
              <div key={activity.id} className="flex items-start gap-2 p-1.5 rounded-lg hover-elevate">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={activity.user.avatar} alt={activity.user.name} />
                  <AvatarFallback className="text-xs">{activity.user.name.charAt(0)}</AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Icon className={`h-3 w-3 ${colorClass}`} />
                    <span className="font-medium text-xs">{activity.user.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {activity.type === 'article' && 'مقال جديد'}
                      {activity.type === 'comment' && 'تعليق'}
                      {activity.type === 'like' && 'إعجاب'}
                      {activity.type === 'follow' && 'متابعة'}
                      {activity.type === 'edit' && 'تعديل'}
                      {activity.type === 'delete' && 'حذف'}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground mb-0.5 line-clamp-1">
                    {activity.description}
                  </p>

                  {activity.metadata?.articleTitle && (
                    <p className="text-xs text-primary truncate">
                      {activity.metadata.articleTitle}
                    </p>
                  )}

                  <span className="text-[10px] text-muted-foreground">
                    {getRelativeTime(activity.timestamp)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
