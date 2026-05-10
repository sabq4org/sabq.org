import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Users, Circle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";

interface OnlineModerator {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: string;
  roleNameAr: string | null;
  jobTitle: string | null;
  lastActivityAt: string | null;
  isOnline: boolean;
}

const roleLabels: Record<string, string> = {
  admin: "مدير النظام",
  superadmin: "المدير العام",
  editor: "محرر",
  chief_editor: "رئيس التحرير",
  moderator: "مشرف",
  system_admin: "مدير تقني",
  reporter: "مراسل",
  comments_moderator: "مشرف التعليقات",
  content_manager: "مدير المحتوى",
  opinion_author: "كاتب رأي",
  publisher: "ناشر",
};

const getRoleLabel = (mod: OnlineModerator): string => {
  if (mod.roleNameAr) return mod.roleNameAr;
  return roleLabels[mod.role] || mod.role;
};

export function OnlineModeratorsWidget() {
  const { data: moderators, isLoading } = useQuery<OnlineModerator[]>({
    queryKey: ["/api/admin/online-moderators"],
    refetchInterval: 120000, // 2 min (was 30s)
    staleTime: 15000,
  });

  const onlineModerators = moderators?.filter(m => m.isOnline) || [];
  const offlineModerators = moderators?.filter(m => !m.isOnline).slice(0, 6) || [];

  const getInitials = (firstName: string | null, lastName: string | null, email: string) => {
    if (firstName && lastName) {
      return `${firstName?.[0]}${lastName?.[0]}`.toUpperCase();
    }
    if (firstName) {
      return firstName.slice(0, 2).toUpperCase();
    }
    return email.slice(0, 2).toUpperCase();
  };

  const getDisplayName = (mod: OnlineModerator) => {
    if (mod.firstName && mod.lastName) {
      return `${mod.firstName} ${mod.lastName}`;
    }
    if (mod.firstName) {
      return mod.firstName;
    }
    return mod.email.split("@")[0];
  };

  const formatLastActivity = (lastActivityAt: string | null) => {
    if (!lastActivityAt) return "غير محدد";
    try {
      return formatDistanceToNow(new Date(lastActivityAt), { locale: arSA, addSuffix: true });
    } catch {
      return "غير محدد";
    }
  };

  if (isLoading) {
    return (
      <Card className="h-full" data-testid="card-online-moderators-loading">
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-12 rounded-full" />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-8 w-20 rounded-md" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card 
      className="h-full bg-gradient-to-br from-blue-500/5 via-transparent to-transparent border-blue-200/50 dark:border-blue-800/50" 
      data-testid="card-online-moderators"
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <span>المتصلون</span>
          </div>
          {onlineModerators.length > 0 && (
            <Badge 
              className="bg-green-500 hover:bg-green-600 text-white text-xs px-2"
              data-testid="badge-online-count"
            >
              <Circle className="h-2 w-2 fill-current ml-1 animate-pulse" />
              {onlineModerators.length} نشط
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {onlineModerators.length === 0 && offlineModerators.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground" data-testid="text-no-moderators">
            <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">لا يوجد مشرفون متصلون</p>
          </div>
        ) : (
          <>
            {onlineModerators.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">متصلون الآن</p>
                <div className="flex flex-wrap gap-2">
                  {onlineModerators.map((mod) => (
                    <Tooltip key={mod.id}>
                      <TooltipTrigger asChild>
                        <div
                          className="relative group cursor-default"
                          data-testid={`moderator-online-${mod.id}`}
                        >
                          <Avatar className="h-11 w-11 ring-2 ring-green-500 ring-offset-2 ring-offset-background transition-transform group-hover:scale-105">
                            <AvatarImage src={mod.profileImageUrl || undefined} alt={getDisplayName(mod)} />
                            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white text-sm font-medium">
                              {getInitials(mod.firstName, mod.lastName, mod.email)}
                            </AvatarFallback>
                          </Avatar>
                          <Circle 
                            className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 fill-green-500 text-green-500 bg-background rounded-full ring-2 ring-background"
                            data-testid="indicator-online"
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs" dir="rtl">
                        <p className="font-semibold">{getDisplayName(mod)}</p>
                        <p className="text-muted-foreground">{mod.jobTitle || getRoleLabel(mod)}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>
            )}

            {offlineModerators.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">آخر نشاط</p>
                <div className="flex flex-wrap gap-1.5">
                  {offlineModerators.map((mod) => (
                    <Tooltip key={mod.id}>
                      <TooltipTrigger asChild>
                        <div
                          className="px-2.5 py-1.5 rounded-md bg-muted/60 text-muted-foreground text-xs cursor-default hover:bg-muted transition-colors"
                          data-testid={`moderator-offline-${mod.id}`}
                        >
                          {getDisplayName(mod)}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs" dir="rtl">
                        <p>آخر ظهور: {formatLastActivity(mod.lastActivityAt)}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
