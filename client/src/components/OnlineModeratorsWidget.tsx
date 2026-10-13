import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
    refetchInterval: 120000,
    staleTime: 15000,
  });

  const onlineModerators = moderators?.filter((m) => m.isOnline) || [];
  const offlineModerators = moderators?.filter((m) => !m.isOnline).slice(0, 6) || [];

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
      <Card className="h-full rounded-xl border border-border/70 bg-card shadow-sm" data-testid="card-online-moderators-loading">
        <CardHeader className="pb-3 border-b border-border/50">
          <Skeleton className="h-6 w-36" />
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-11 w-11 rounded-full" />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-7 w-20 rounded-md" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="h-full rounded-xl border border-border/70 bg-card shadow-sm"
      data-testid="card-online-moderators"
    >
      <CardHeader className="pb-3 border-b border-border/50">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">فريق التحرير المتصل</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                المتواجدون في غرفة الأخبار الآن
              </CardDescription>
            </div>
          </div>
          {onlineModerators.length > 0 && (
            <Badge
              variant="outline"
              className="border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums"
              data-testid="badge-online-count"
            >
              <span className="ml-1.5 h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              {onlineModerators.length} نشط الآن
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {onlineModerators.length === 0 && offlineModerators.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground" data-testid="text-no-moderators">
            <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">لا يوجد مشرفون متصلون</p>
          </div>
        ) : (
          <>
            {onlineModerators.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex flex-wrap gap-2">
                  {onlineModerators.slice(0, 6).map((mod) => (
                    <Tooltip key={mod.id}>
                      <TooltipTrigger asChild>
                        <div
                          className="group flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1.5 cursor-default transition-colors hover:bg-emerald-500/10"
                          data-testid={`moderator-online-${mod.id}`}
                        >
                          <div className="relative shrink-0">
                            <Avatar className="h-8 w-8 ring-1 ring-emerald-500/40">
                              <AvatarImage src={mod.profileImageUrl || undefined} alt={getDisplayName(mod)} />
                              <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                                {getInitials(mod.firstName, mod.lastName, mod.email)}
                              </AvatarFallback>
                            </Avatar>
                            <Circle
                              className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-background fill-emerald-500 text-emerald-500 ring-1 ring-background"
                              data-testid="indicator-online"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate max-w-[110px]">
                              {getDisplayName(mod)}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate max-w-[110px]">
                              {getRoleLabel(mod)}
                            </p>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs" dir="rtl">
                        <p className="font-semibold">{getDisplayName(mod)}</p>
                        <p className="text-muted-foreground">{getRoleLabel(mod)}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>
            )}

            {offlineModerators.length > 0 && (
              <div className="space-y-2 pt-1 border-t border-border/40">
                <p className="text-[11px] font-medium text-muted-foreground">آخر تواجد قريب</p>
                <div className="flex flex-wrap gap-1.5">
                  {offlineModerators.map((mod) => (
                    <Tooltip key={mod.id}>
                      <TooltipTrigger asChild>
                        <div
                          className="px-2.5 py-1 rounded-lg border border-border/50 bg-muted/40 text-muted-foreground text-xs cursor-default hover:bg-muted transition-colors"
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
