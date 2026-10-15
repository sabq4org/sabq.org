import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Eye, ThumbsUp, Clock, TrendingUp, Calendar, CheckCircle2, FileText, 
  Target, UserPlus, UserCheck, Users, Heart, Zap, MessageSquare,
  Award, PenTool, BarChart3, ArrowUpRight
} from "lucide-react";
import { Link } from "wouter";
import type { ReporterProfile as ReporterProfileType } from "@shared/schema";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { NewsArticleCard } from "@/components/NewsArticleCard";
import type { ArticleWithDetails } from "@shared/schema";

function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  suffix = "",
  colorClass = "bg-primary/10 text-primary"
}: { 
  icon: any; 
  label: string; 
  value: number; 
  suffix?: string;
  colorClass?: string;
}) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg ${colorClass.split(' ')[0]}`}>
            <Icon className={`h-5 w-5 ${colorClass.split(' ')[1]}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs md:text-sm text-muted-foreground truncate">{label}</p>
            <p className="text-xl md:text-2xl font-bold">
              {value.toLocaleString('en-US')}{suffix}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReporterProfile() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();

  const { data: user } = useQuery<{ id: string; name?: string; email?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: profile, isLoading, error } = useQuery<ReporterProfileType>({
    queryKey: ['/api/reporters', slug],
    enabled: !!slug,
  });

  const { data: isFollowingData, isLoading: isLoadingIsFollowing } = useQuery<{
    isFollowing: boolean;
  }>({
    queryKey: ["/api/social/is-following", profile?.userId],
    enabled: !!profile?.userId && !!user,
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.userId) throw new Error("Reporter ID not available");
      return apiRequest("/api/social/follow", {
        method: "POST",
        body: JSON.stringify({ followingId: profile.userId }),
      });
    },
    onSuccess: () => {
      if (!profile?.userId) return;
      queryClient.invalidateQueries({ queryKey: ["/api/social/is-following", profile.userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/social/stats", profile.userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/social/followers", profile.userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/social/following", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "تمت المتابعة",
        description: "أصبحت تتابع هذا المحرر",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشلت عملية المتابعة. حاول مرة أخرى.",
        variant: "destructive",
      });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.userId) throw new Error("Reporter ID not available");
      return apiRequest(`/api/social/unfollow/${profile.userId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      if (!profile?.userId) return;
      queryClient.invalidateQueries({ queryKey: ["/api/social/is-following", profile.userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/social/stats", profile.userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/social/followers", profile.userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/social/following", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "تم إلغاء المتابعة",
        description: "لم تعد تتابع هذا المحرر",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشلت عملية إلغاء المتابعة. حاول مرة أخرى.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Header user={user} />
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-64 bg-muted rounded-xl"></div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-28 bg-muted rounded-xl"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Header user={user} />
        <div className="container mx-auto px-4 py-8 flex items-center justify-center min-h-[60vh]">
          <Card className="max-w-md border-border">
            <CardContent className="p-12 text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
                <Users className="h-10 w-10 text-muted-foreground" />
              </div>
              <p className="text-xl text-muted-foreground">المراسل غير موجود</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const {
    id: reporterId,
    fullName,
    title,
    avatarUrl,
    bio,
    isVerified,
    tags,
    kpis,
    lastArticles,
    topCategories,
    timeseries,
    badges,
  } = profile;

  const isOwnProfile = user?.id === reporterId;
  const isFollowing = isFollowingData?.isFollowing || false;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header user={user} />

      {/* Hero Section */}
      <section className="bg-muted/50">
        <div className="container mx-auto px-4 py-12 md:py-16">
          <div className="flex flex-col items-center text-center">
            {/* Avatar */}
            <div className="relative mb-6">
              <Avatar className="h-32 w-32 md:h-40 md:w-40 border-2 border-border" data-testid="avatar-reporter">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={fullName} className="object-cover" />}
                <AvatarFallback className="text-3xl font-bold bg-muted text-muted-foreground">
                  {fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              
              {/* Verified badge */}
              {isVerified && (
                <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-2">
                  <CheckCircle2 className="h-5 w-5 text-primary-foreground" data-testid="icon-verified" />
                </div>
              )}
            </div>

            {/* Name and Title */}
            <div className="space-y-3">
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold" data-testid="text-reporter-name">
                {fullName}
              </h1>
              {title && (
                <p className="text-lg md:text-xl text-muted-foreground flex items-center justify-center gap-2" data-testid="text-reporter-title">
                  <PenTool className="h-5 w-5" />
                  {title}
                </p>
              )}
            </div>

            {/* Bio */}
            {bio && (
              <p
                className="mt-4 text-base md:text-lg text-muted-foreground max-w-2xl leading-relaxed"
                data-testid="text-reporter-bio"
              >
                {bio}
              </p>
            )}

            {/* Tags */}
            {tags && tags.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center mt-6">
                {tags.map((tag, idx) => (
                  <Badge 
                    key={idx}
                    variant="secondary" 
                    className="px-4 py-1.5 text-sm"
                    data-testid={`badge-tag-${idx}`}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            {/* Badges/Achievements */}
            {badges && badges.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center mt-4">
                {badges.map((badge) => (
                  <Badge 
                    key={badge.key}
                    variant="outline"
                    className="px-4 py-1.5 text-sm"
                    data-testid={`badge-achievement-${badge.key}`}
                  >
                    <Award className="h-3.5 w-3.5 ml-1.5" />
                    {badge.label}
                  </Badge>
                ))}
              </div>
            )}

            {/* Follow Button */}
            {user && !isOwnProfile && (
              <div className="mt-8">
                {isFollowing ? (
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => unfollowMutation.mutate()}
                    disabled={unfollowMutation.isPending || isLoadingIsFollowing}
                    className="gap-3"
                    data-testid="button-unfollow-reporter"
                  >
                    <UserCheck className="h-5 w-5" />
                    إلغاء المتابعة
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    onClick={() => followMutation.mutate()}
                    disabled={followMutation.isPending || isLoadingIsFollowing}
                    className="gap-3"
                    data-testid="button-follow-reporter"
                  >
                    <UserPlus className="h-5 w-5" />
                    متابعة
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Statistics Section */}
      <section className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
          <StatCard
            icon={FileText}
            label="المقالات"
            value={kpis.totalArticles ?? 0}
            colorClass="bg-blue-500/10 text-blue-600 dark:text-blue-400"
          />
          <StatCard
            icon={Eye}
            label="المشاهدات"
            value={kpis.totalViews ?? 0}
            colorClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          />
          <StatCard
            icon={Heart}
            label="الإعجابات"
            value={kpis.totalLikes ?? 0}
            colorClass="bg-rose-500/10 text-rose-600 dark:text-rose-400"
          />
          <StatCard
            icon={Clock}
            label="وقت القراءة"
            value={kpis.avgReadTimeMin ?? 0}
            suffix=" د"
            colorClass="bg-amber-500/10 text-amber-600 dark:text-amber-400"
          />
          <StatCard
            icon={Target}
            label="نسبة الإكمال"
            value={kpis.avgCompletionRate ?? 0}
            suffix="%"
            colorClass="bg-violet-500/10 text-violet-600 dark:text-violet-400"
          />
          <StatCard
            icon={Users}
            label="المتابعون"
            value={kpis.followers ?? 0}
            colorClass="bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
          />
        </div>
      </section>

      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Latest Articles */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <h2 className="text-xl font-bold">أحدث المقالات</h2>
              </div>
              <Badge variant="secondary" className="bg-primary/10 text-primary border-0">
                {lastArticles?.length ?? 0} مقال
              </Badge>
            </div>
            
            {lastArticles && lastArticles.length > 0 ? (
              <div className="flex flex-col gap-4">
                {lastArticles.map((article) => {
                  const cardArticle = {
                    ...article,
                    articleType: "news",
                    newsType: article.isBreaking ? "breaking" : "regular",
                    category: article.category ? { nameAr: article.category.name, nameEn: article.category.name, ...article.category } : undefined,
                    commentsCount: article.comments,
                  } as unknown as ArticleWithDetails;
                  return (
                    <div key={article.id}>
                      <NewsArticleCard article={cardArticle} viewMode="list" metadata={{ views: true, comments: true }} />
                      <Link href={`/article/${article.englishSlug || article.slug}`} className="mt-1 inline-flex min-h-9 items-center text-sm font-semibold text-primary hover:underline">
                        اقرأ المزيد
                      </Link>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Card className="border-border">
                <CardContent className="p-8 text-center">
                  <div className="w-14 h-14 mx-auto mb-4 rounded-lg bg-muted flex items-center justify-center">
                    <FileText className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground">لا توجد مقالات حديثة</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Top Categories */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/10">
                <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold">التصنيفات</h2>
            </div>
            
            {topCategories && topCategories.length > 0 ? (
              <div className="flex flex-col gap-4">
                {topCategories.map((cat, idx) => (
                  <Card key={idx} className="border-border overflow-hidden" data-testid={`category-${idx}`}>
                    <div className="h-1 bg-emerald-500/30" />
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold">{cat.name}</h3>
                        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0">
                          {cat.sharePct}%
                        </Badge>
                      </div>
                      
                      <Progress value={cat.sharePct} className="h-2" />
                      
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <FileText className="h-3.5 w-3.5" />
                          <span>{(cat.articles ?? 0).toLocaleString('en-US')} مقال</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Eye className="h-3.5 w-3.5" />
                          <span>{(cat.views ?? 0).toLocaleString('en-US')} مشاهدة</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-border">
                <CardContent className="p-8 text-center">
                  <div className="w-14 h-14 mx-auto mb-4 rounded-lg bg-muted flex items-center justify-center">
                    <BarChart3 className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground">لا توجد بيانات</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Timeline Chart */}
        {timeseries && timeseries.daily && timeseries.daily.length > 0 && (
          <Card className="border-border">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-violet-500/10">
                  <TrendingUp className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <CardTitle className="text-lg">المشاهدات خلال {timeseries.windowDays} يوماً</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    تحليل أداء المقالات خلال الفترة الماضية
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeseries.daily}>
                    <defs>
                      <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => {
                        const date = new Date(value);
                        return `${date.getDate()}/${date.getMonth() + 1}`;
                      }}
                      className="text-muted-foreground"
                    />
                    <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                    <Tooltip 
                      labelFormatter={(value) => {
                        const date = new Date(value as string);
                        return date.toLocaleDateString('ar-SA-u-ca-gregory');
                      }}
                      formatter={(value: number) => [value.toLocaleString('en-US'), 'المشاهدات']}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="views" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      fill="url(#colorViews)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
