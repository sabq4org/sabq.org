import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Users, UserPlus, UserMinus, FileText, Users2, Sparkles, TrendingUp, 
  Award, Zap, Brain, Lightbulb, Crown, Flame, MessageSquare, Eye, CheckCircle2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";

type LatestArticle = {
  id: string;
  title: string;
  slug: string;
  englishSlug?: string | null;
  publishedAt: string;
  categoryName: string;
};

type SuggestedUser = {
  id: string;
  slug: string | null;
  username: string;
  fullName: string;
  title: string | null;
  bio: string | null;
  profilePicture: string | null;
  role: string;
  followersCount: number;
  articlesCount: number;
  totalViews: number;
  totalLikes: number;
  isVerified: boolean;
  isFollowing: boolean;
  interestMatch: number;
  isRecommended: boolean;
  recommendationReason: string;
  topCategories: string[];
  latestArticle: LatestArticle | null;
  daysSinceLastPublish: number;
};

function AnimatedCounter({ value, suffix = "", duration = 1500 }: { value: number; suffix?: string; duration?: number }) {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    let startTime: number;
    let animationFrame: number;
    
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(Math.floor(progress * value));
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };
    
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [value, duration]);
  
  return <span>{count.toLocaleString('en-US')}{suffix}</span>;
}

function CircularProgress({ value, max, size = 48, strokeWidth = 4, color = "primary" }: { 
  value: number; 
  max: number; 
  size?: number; 
  strokeWidth?: number;
  color?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = Math.min(value / max, 1);
  const offset = circumference - progress * circumference;
  
  const colorMap: Record<string, string> = {
    primary: "stroke-primary",
    blue: "stroke-blue-500",
    emerald: "stroke-emerald-500",
    amber: "stroke-amber-500",
    rose: "stroke-rose-500",
    violet: "stroke-violet-500",
  };
  
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          className="stroke-muted/30"
          strokeWidth={strokeWidth}
          fill="none"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <motion.circle
          className={colorMap[color] || "stroke-primary"}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          style={{
            strokeDasharray: circumference,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold text-foreground">{Math.round(progress * 100)}</span>
      </div>
    </div>
  );
}

const SectionHeader = ({ title, color }: { title: string; color: string }) => (
  <div className="flex items-center gap-3 px-1">
    <div className={`h-8 w-1 ${color} rounded-full`}></div>
    <h3 className="text-lg font-bold text-foreground">{title}</h3>
  </div>
);

function SmartInsightCard({ 
  icon: Icon, 
  title, 
  value, 
  subtext,
  bgColor,
}: { 
  icon: any; 
  title: string; 
  value: string | number;
  subtext: string;
  bgColor: string;
}) {
  return (
    <Card className={`hover-elevate transition-all ${bgColor}`}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-background/50">
            <Icon className="h-4 w-4 text-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="text-lg font-bold text-foreground">{typeof value === 'number' ? value.toLocaleString('en-US') : value}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">{subtext}</p>
      </CardContent>
    </Card>
  );
}

function SmartUserCard({ 
  user, 
  rank,
  onFollow, 
  onUnfollow,
  isFollowPending,
  isUnfollowPending,
}: { 
  user: SuggestedUser;
  rank: number;
  onFollow: () => void;
  onUnfollow: () => void;
  isFollowPending: boolean;
  isUnfollowPending: boolean;
}) {
  const getInitials = (fullName: string) => {
    const parts = fullName.trim().split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return fullName.substring(0, 2).toUpperCase();
  };

  const getRoleLabel = (role: string): string => {
    const labels: Record<string, string> = {
      chief_editor: "رئيس تحرير",
      editor: "محرر",
      writer: "كاتب",
      reporter: "مراسل",
      opinion_author: "كاتب رأي",
      content_creator: "منشئ محتوى",
    };
    return labels[role] || role;
  };

  const getRoleIcon = (role: string) => {
    const icons: Record<string, any> = {
      chief_editor: Crown,
      editor: Award,
      writer: FileText,
      reporter: Zap,
      opinion_author: MessageSquare,
      content_creator: Sparkles,
    };
    return icons[role] || FileText;
  };

  const RoleIcon = getRoleIcon(user.role);
  const isTopPerformer = rank <= 3;

  return (
    <Card
      className={`hover-elevate h-full transition-all relative overflow-hidden ${isTopPerformer ? 'border-primary/30 bg-primary/[0.02]' : ''}`}
      data-testid={`card-user-${user.id}`}
    >
      {isTopPerformer && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/40 via-primary/60 to-primary/40" />
      )}

      <CardContent className="p-5 pb-4">
        <div className="flex items-center gap-4 pb-4 border-b border-border/60">
          <Link href={`/reporter/${user.slug || user.id}`}>
            <div className="cursor-pointer">
              <Avatar className="h-14 w-14 ring-2 ring-primary/20" data-testid={`avatar-user-${user.id}`}>
                {user.profilePicture && (
                  <AvatarImage
                    src={user.profilePicture}
                    alt={user.fullName}
                    className="object-cover"
                  />
                )}
                <AvatarFallback className="bg-primary text-primary-foreground text-base font-bold">
                  {getInitials(user.fullName)}
                </AvatarFallback>
              </Avatar>
            </div>
          </Link>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <Link href={`/reporter/${user.slug || user.id}`}>
                <h3 className="text-lg font-semibold text-foreground truncate hover:text-primary transition-colors cursor-pointer" data-testid={`text-name-${user.id}`}>
                  {user.fullName}
                  {user.isVerified && (
                    <CheckCircle2 className="inline-block h-4 w-4 text-primary mr-1 align-middle" />
                  )}
                </h3>
              </Link>
              <div
                className={`h-6 px-2 rounded-full flex items-center gap-1 shrink-0 ${isTopPerformer ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
              >
                {isTopPerformer && <Crown className="h-3 w-3" />}
                <span className="text-xs font-bold">{rank}</span>
              </div>
            </div>
            
            <Badge 
              variant="outline"
              className="gap-1 mt-1.5 uppercase tracking-wide text-[10px]"
              data-testid={`badge-role-${user.id}`}
            >
              <RoleIcon className="h-3 w-3 text-primary" />
              {getRoleLabel(user.role)}
            </Badge>
          </div>
        </div>

        {user.isRecommended && user.recommendationReason && (
          <div className="flex items-start gap-2 mt-3 p-2.5 rounded-lg bg-muted/50 border-r-2 border-primary/40">
            <Brain className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span className="text-xs text-muted-foreground leading-relaxed">{user.recommendationReason}</span>
          </div>
        )}

        {user.topCategories && user.topCategories.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {user.topCategories.slice(0, 3).map((cat, idx) => (
              <Badge 
                key={idx}
                variant="secondary" 
                className="text-xs px-2 py-0.5"
              >
                {cat}
              </Badge>
            ))}
          </div>
        )}

        {user.bio && (
          <p className="text-sm text-muted-foreground mt-3 line-clamp-2 leading-relaxed">
            {user.bio}
          </p>
        )}

        <div className="grid grid-cols-3 gap-2 bg-muted/50 rounded-lg p-3 mt-3">
          <div className="flex flex-col items-center gap-0.5">
            <div className="bg-background text-primary rounded-full p-1.5">
              <FileText className="h-3.5 w-3.5" />
            </div>
            <p className="text-lg font-bold text-foreground">
              <AnimatedCounter value={user.articlesCount} />
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">مقال</p>
          </div>
          
          <div className="flex flex-col items-center gap-0.5">
            <div className="bg-background text-primary rounded-full p-1.5">
              <Users className="h-3.5 w-3.5" />
            </div>
            <p className="text-lg font-bold text-foreground">
              <AnimatedCounter value={user.followersCount} />
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">متابع</p>
          </div>
          
          <div className="flex flex-col items-center gap-0.5">
            <div className="bg-background text-primary rounded-full p-1.5">
              <Eye className="h-3.5 w-3.5" />
            </div>
            <p className="text-lg font-bold text-foreground">
              <AnimatedCounter value={user.totalViews || 0} />
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">مشاهدة</p>
          </div>
        </div>

        {user.latestArticle && user.latestArticle.slug && (
          <Link href={`/article/${user.latestArticle.englishSlug || user.latestArticle.slug}`} data-testid={`link-latest-article-${user.id}`}>
            <div className="mt-3 p-2.5 rounded-lg bg-muted/40 border-r-2 border-primary/30 cursor-pointer hover:bg-muted/60 transition-colors">
              <div className="flex items-start gap-2">
                <div className="p-1.5 rounded-full bg-background shrink-0">
                  <Sparkles className="h-3 w-3 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">آخر مقال</p>
                  <p className="text-xs font-medium text-foreground line-clamp-2 hover:text-primary transition-colors">
                    {user.latestArticle.title}
                  </p>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 mt-1">
                    {user.latestArticle.categoryName}
                  </Badge>
                </div>
              </div>
            </div>
          </Link>
        )}
      </CardContent>

      <div className="px-5 pb-5 flex justify-start">
        {user.isFollowing ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onUnfollow}
            disabled={isUnfollowPending}
            className="gap-1.5"
            data-testid={`button-unfollow-${user.id}`}
          >
            <UserMinus className="h-3.5 w-3.5" />
            إلغاء المتابعة
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={onFollow}
            disabled={isFollowPending}
            className="gap-1.5"
            data-testid={`button-follow-${user.id}`}
          >
            <UserPlus className="h-3.5 w-3.5" />
            متابعة
          </Button>
        )}
      </div>
    </Card>
  );
}

function CategoryFilter({ 
  categories, 
  selected, 
  onSelect 
}: { 
  categories: { key: string; label: string; count: number; color: string }[];
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      <Button
        variant={selected === null ? "default" : "outline"}
        size="sm"
        onClick={() => onSelect(null)}
        className="rounded-xl"
        data-testid="filter-all"
      >
        الكل
      </Button>
      {categories.map((cat) => (
        <Button
          key={cat.key}
          variant={selected === cat.key ? "default" : "outline"}
          size="sm"
          onClick={() => onSelect(cat.key)}
          className={`rounded-xl flex items-center gap-2 ${
            selected === cat.key 
              ? `bg-gradient-to-r ${cat.color} text-white border-0` 
              : ''
          }`}
          data-testid={`filter-${cat.key}`}
        >
          {cat.label}
          <Badge variant="secondary" className={`text-xs ${selected === cat.key ? 'bg-white/20 text-white' : ''}`}>
            {cat.count}
          </Badge>
        </Button>
      ))}
    </div>
  );
}

export default function DiscoverUsers() {
  const { toast } = useToast();
  const { user: currentUser, isLoading: isAuthLoading } = useAuth({ redirectToLogin: true });
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  const { data: suggestedData, isLoading: isLoadingSuggested } = useQuery<{
    users: SuggestedUser[];
  }>({
    queryKey: ["/api/users/suggested"],
    enabled: !isAuthLoading,
  });

  const suggestedUsers = suggestedData?.users || [];

  const roleCategories = useMemo(() => {
    const roleCounts: Record<string, number> = {};
    suggestedUsers.forEach(u => {
      roleCounts[u.role] = (roleCounts[u.role] || 0) + 1;
    });
    
    const roleConfig: Record<string, { label: string; color: string }> = {
      chief_editor: { label: "رؤساء التحرير", color: "from-amber-500 to-orange-600" },
      editor: { label: "المحررون", color: "from-violet-500 to-purple-600" },
      writer: { label: "الكتّاب", color: "from-teal-500 to-cyan-600" },
      reporter: { label: "المراسلون", color: "from-emerald-500 to-green-600" },
      opinion_author: { label: "كتّاب الرأي", color: "from-rose-500 to-pink-600" },
      content_creator: { label: "منشئو المحتوى", color: "from-slate-500 to-zinc-600" },
    };
    
    return Object.entries(roleCounts).map(([key, count]) => ({
      key,
      label: roleConfig[key]?.label || key,
      count,
      color: roleConfig[key]?.color || "from-gray-500 to-gray-600",
    }));
  }, [suggestedUsers]);

  const filteredUsers = useMemo(() => {
    if (!selectedRole) return suggestedUsers;
    return suggestedUsers.filter(u => u.role === selectedRole);
  }, [suggestedUsers, selectedRole]);

  const totalStats = useMemo(() => {
    const totalArticles = suggestedUsers.reduce((sum, u) => sum + u.articlesCount, 0);
    const totalFollowers = suggestedUsers.reduce((sum, u) => sum + u.followersCount, 0);
    const notFollowing = suggestedUsers.filter(u => !u.isFollowing).length;
    return { totalArticles, totalFollowers, notFollowing, totalUsers: suggestedUsers.length };
  }, [suggestedUsers]);

  const followMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("/api/social/follow", {
        method: "POST",
        body: JSON.stringify({ followingId: userId }),
      });
    },
    onMutate: async (userId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/users/suggested"] });
      const previousUsers = queryClient.getQueryData(["/api/users/suggested"]);
      queryClient.setQueryData(["/api/users/suggested"], (old: { users: SuggestedUser[] } | undefined) => {
        if (!old) return old;
        return {
          ...old,
          users: old.users.map(user => 
            user.id === userId 
              ? { ...user, isFollowing: true, followersCount: user.followersCount + 1 }
              : user
          )
        };
      });
      return { previousUsers };
    },
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/social/stats", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/social/stats", currentUser?.id] });
      toast({
        title: "تمت المتابعة",
        description: "أصبحت تتابع هذا المستخدم",
      });
    },
    onError: (_, __, context: { previousUsers?: unknown } | undefined) => {
      if (context?.previousUsers) {
        queryClient.setQueryData(["/api/users/suggested"], context.previousUsers);
      }
      toast({
        title: "خطأ",
        description: "فشلت عملية المتابعة. حاول مرة أخرى.",
        variant: "destructive",
      });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest(`/api/social/unfollow/${userId}`, {
        method: "DELETE",
      });
    },
    onMutate: async (userId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/users/suggested"] });
      const previousUsers = queryClient.getQueryData(["/api/users/suggested"]);
      queryClient.setQueryData(["/api/users/suggested"], (old: { users: SuggestedUser[] } | undefined) => {
        if (!old) return old;
        return {
          ...old,
          users: old.users.map(user => 
            user.id === userId 
              ? { ...user, isFollowing: false, followersCount: Math.max(0, user.followersCount - 1) }
              : user
          )
        };
      });
      return { previousUsers };
    },
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/social/stats", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/social/stats", currentUser?.id] });
      toast({
        title: "تم إلغاء المتابعة",
        description: "لم تعد تتابع هذا المستخدم",
      });
    },
    onError: (_, __, context: { previousUsers?: unknown } | undefined) => {
      if (context?.previousUsers) {
        queryClient.setQueryData(["/api/users/suggested"], context.previousUsers);
      }
      toast({
        title: "خطأ",
        description: "فشلت عملية إلغاء المتابعة. حاول مرة أخرى.",
        variant: "destructive",
      });
    },
  });

  if (isAuthLoading || isLoadingSuggested) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Header user={currentUser || undefined} />
        
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <Skeleton className="h-8 w-64 mb-3" />
            <Skeleton className="h-5 w-96" />
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          
          <Skeleton className="h-10 w-full max-w-2xl mx-auto mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-80 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header user={currentUser || undefined} />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="space-y-2 mb-2">
          <div className="flex items-center gap-3">
            <Brain className="h-6 w-6 text-primary" data-testid="icon-brain" />
            <h1 
              className="text-2xl md:text-3xl font-bold text-foreground"
              data-testid="heading-discover-users"
            >
              اكتشف نخبة الكتّاب
            </h1>
            <Sparkles className="h-5 w-5 text-amber-500" />
          </div>
          <p className="text-muted-foreground text-lg leading-relaxed max-w-2xl">
            تابع أبرز المحررين والمراسلين واحصل على توصيات ذكية مخصصة لاهتماماتك
          </p>
        </div>

        <div className="space-y-3">
          <SectionHeader title="نظرة عامة" color="bg-violet-500" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SmartInsightCard
              icon={Users}
              title="إجمالي الكتّاب"
              value={totalStats.totalUsers}
              subtext="كتّاب ومحررون نشطون"
              bgColor="bg-violet-50 dark:bg-violet-950/30"
            />
            <SmartInsightCard
              icon={FileText}
              title="المقالات المنشورة"
              value={totalStats.totalArticles}
              subtext="مقال متاح للقراءة"
              bgColor="bg-rose-50 dark:bg-rose-950/30"
            />
            <SmartInsightCard
              icon={TrendingUp}
              title="المتابعات"
              value={totalStats.totalFollowers}
              subtext="إجمالي المتابعين"
              bgColor="bg-emerald-50 dark:bg-emerald-950/30"
            />
            <SmartInsightCard
              icon={Lightbulb}
              title="اقتراحات لك"
              value={totalStats.notFollowing}
              subtext="كتّاب قد تهتم بمتابعتهم"
              bgColor="bg-amber-50 dark:bg-amber-950/30"
            />
          </div>
        </div>

        <div className="space-y-3">
          <SectionHeader title="تصفية حسب التخصص" color="bg-slate-500" />
          <CategoryFilter 
            categories={roleCategories}
            selected={selectedRole}
            onSelect={setSelectedRole}
          />
        </div>

        <div className="space-y-3">
          <SectionHeader title="الكتّاب المقترحون" color="bg-emerald-500" />
          {filteredUsers.length === 0 ? (
            <div className="text-center py-20">
              <div className="relative inline-block mb-6">
                <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center">
                  <Users2 className="h-12 w-12 text-muted-foreground" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-3">
                لا يوجد كتّاب في هذا التصنيف
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                جرّب اختيار تصنيف آخر أو عرض جميع الكتّاب
              </p>
              <Button
                variant="outline"
                className="mt-6 rounded-xl"
                onClick={() => setSelectedRole(null)}
                data-testid="button-show-all"
              >
                عرض الكل
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence mode="popLayout">
                {filteredUsers.map((user, index) => (
                  <SmartUserCard
                    key={user.id}
                    user={user}
                    rank={index + 1}
                    onFollow={() => followMutation.mutate(user.id)}
                    onUnfollow={() => unfollowMutation.mutate(user.id)}
                    isFollowPending={followMutation.isPending}
                    isUnfollowPending={unfollowMutation.isPending}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        <div className="text-center pt-8">
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-muted border border-border">
            <Flame className="h-5 w-5 text-orange-500" />
            <span className="text-sm text-muted-foreground">
              يتم تحديث الاقتراحات بناءً على اهتماماتك وسلوك القراءة
            </span>
            <Brain className="h-5 w-5 text-primary" />
          </div>
        </div>
      </div>
    </div>
  );
}
