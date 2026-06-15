import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/Header";
import { LoyaltyBlock } from "@/components/loyalty/LoyaltyBlock";
import { LoyaltyCard } from "@/components/loyalty/LoyaltyCard";
import { computeTier, tierProgress, nextTier } from "@shared/loyalty";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ChartTooltip } from "recharts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Heart, 
  Bookmark, 
  FileText, 
  Settings,
  Bell,
  Shield,
  Loader2,
  Upload,
  TrendingUp,
  LayoutDashboard,
  Trophy,
  Coins,
  Star,
  Sparkles,
  Tag,
  X,
  AlertCircle,
  Mail,
  Users,
  UserPlus,
  UserMinus,
  IdCard,
  Check,
  Download,
  Plus,
  Wallet,
  Edit,
  Clock,
  Eye,
  Lock,
} from "lucide-react";
import { ArticleCard } from "@/components/ArticleCard";
import { SmartInterestsBlock } from "@/components/SmartInterestsBlock";
import { TwoFactorSettings } from "@/components/TwoFactorSettings";
import type { ArticleWithDetails, User as UserType, UserPointsTotal } from "@shared/schema";
import { hasRole } from "@/hooks/useAuth";
import { MobileOptimizedKpiCard } from "@/components/MobileOptimizedKpiCard";

const updateUserSchema = z.object({
  firstName: z.string().min(2, "الاسم الأول يجب أن يكون حرفين على الأقل").optional(),
  lastName: z.string().min(2, "اسم العائلة يجب أن يكون حرفين على الأقل").optional(),
  bio: z.string().max(500, "النبذة يجب أن لا تزيد عن 500 حرف").optional(),
  phoneNumber: z.string().regex(/^[0-9+\-\s()]*$/, "رقم الهاتف غير صحيح").optional(),
  profileImageUrl: z.string().url("رابط الصورة غير صحيح").optional().or(z.literal("")),
});

type UpdateUserFormData = z.infer<typeof updateUserSchema>;

/**
 * Compact, information-dense list used by the "محفوظاتي" tab for bookmarks,
 * likes and reading history. Uses the existing horizontal `list` variant of
 * ArticleCard (small thumbnail + title + category + date) so the cards are
 * much smaller than the default grid card, and renders in a clean responsive
 * grid with no horizontal scroll. Loading + empty states are unified here.
 */
function SavedArticlesList({
  articles,
  isLoading,
  emptyIcon: EmptyIcon,
  emptyText,
  emptyHint,
}: {
  articles: ArticleWithDetails[];
  isLoading: boolean;
  emptyIcon: typeof Bookmark;
  emptyText: string;
  emptyHint?: string;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="text-center py-12 bg-muted/30 rounded-xl border border-dashed border-border">
        <EmptyIcon className="h-10 w-10 mx-auto mb-3 text-muted-foreground/60" />
        <p className="text-muted-foreground font-medium">{emptyText}</p>
        {emptyHint && <p className="text-sm text-muted-foreground/80 mt-1">{emptyHint}</p>}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {articles.map((article) => (
        <div key={article.id} className="rounded-xl border border-border bg-card">
          <ArticleCard article={article} variant="list" />
        </div>
      ))}
    </div>
  );
}

export default function Profile() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("journey");
  const [savedView, setSavedView] = useState<"bookmarks" | "likes" | "history">("bookmarks");
  const [networkView, setNetworkView] = useState<"followers" | "following">("followers");
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  const { data: user } = useQuery<UserType>({
    queryKey: ["/api/auth/user"],
  });

  const { data: activitySummary } = useQuery<any>({
    queryKey: ["/api/user/activity-summary"],
    enabled: !!user,
  });

  const { data: categoriesAll } = useQuery<any[]>({
    queryKey: ["/api/categories/all"],
  });

  const { data: recommendations } = useQuery<ArticleWithDetails[]>({
    queryKey: ["/api/recommendations"],
    enabled: !!user,
  });



  const form = useForm<UpdateUserFormData>({
    resolver: zodResolver(updateUserSchema),
    values: {
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      bio: user?.bio || "",
      phoneNumber: user?.phoneNumber || "",
      profileImageUrl: user?.profileImageUrl || "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: UpdateUserFormData) => {
      return apiRequest("/api/auth/user", {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setIsEditingProfile(false);
      toast({
        title: "تم التحديث بنجاح",
        description: "تم حفظ بياناتك الشخصية",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل في تحديث البيانات. حاول مرة أخرى.",
        variant: "destructive",
      });
    },
  });

  const resendVerificationMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/auth/resend-verification", {
        method: "POST",
      });
    },
    onSuccess: () => {
      toast({
        title: "تم الإرسال بنجاح",
        description: "تم إرسال رسالة التحقق إلى بريدك الإلكتروني. يرجى التحقق من صندوق الوارد.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إرسال رسالة التحقق. حاول مرة أخرى.",
        variant: "destructive",
      });
    },
  });

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const handleAvatarFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "خطأ", description: "الرجاء اختيار ملف صورة فقط", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "خطأ", description: "حجم الصورة يجب أن يكون أقل من 5 ميجابايت", variant: "destructive" });
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("entityType", "profile-avatar");
      const uploaded = (await apiRequest("/api/media/upload", {
        method: "POST",
        body: formData,
        isFormData: true,
      })) as { url: string };

      await apiRequest("/api/profile/image", {
        method: "PUT",
        body: JSON.stringify({ profileImageUrl: uploaded.url }),
      });

      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });

      toast({
        title: "تم التحديث بنجاح",
        description: "تم تحديث صورتك الشخصية",
      });
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حفظ الصورة. حاول مرة أخرى.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const onSubmit = (data: UpdateUserFormData) => {
    updateMutation.mutate(data);
  };

  const { data: likedArticlesRaw, isLoading: isLoadingLiked } = useQuery<ArticleWithDetails[]>({
    queryKey: ["/api/profile/liked"],
    enabled: !!user,
  });
  const likedArticles = Array.isArray(likedArticlesRaw) ? likedArticlesRaw : [];

  const { data: bookmarkedArticlesRaw, isLoading: isLoadingBookmarks } = useQuery<ArticleWithDetails[]>({
    queryKey: ["/api/profile/bookmarks"],
    enabled: !!user,
  });
  const bookmarkedArticles = Array.isArray(bookmarkedArticlesRaw) ? bookmarkedArticlesRaw : [];

  const { data: readingHistoryRaw, isLoading: isLoadingHistory } = useQuery<ArticleWithDetails[]>({
    queryKey: ["/api/profile/history"],
    enabled: !!user,
  });
  const readingHistory = Array.isArray(readingHistoryRaw) ? readingHistoryRaw : [];

  const { data: loyaltyPoints } = useQuery<UserPointsTotal>({
    queryKey: ["/api/loyalty/points"],
    enabled: !!user,
  });

  // Computed values for Journey Dashboard (Moved below query declarations to avoid TDZ error)
  const lifetime = loyaltyPoints?.lifetimePoints ?? 0;
  const currentTier = computeTier(lifetime);
  const nextTierInfo = nextTier(currentTier.level);
  
  // Calculate percentage progress to next tier
  let progressPercentage = 100;
  let pointsToNext = 0;
  if (nextTierInfo) {
    const range = nextTierInfo.minLifetimePoints - currentTier.minLifetimePoints;
    const earned = lifetime - currentTier.minLifetimePoints;
    progressPercentage = Math.min(100, Math.max(0, (earned / range) * 100));
    pointsToNext = nextTierInfo.minLifetimePoints - lifetime;
  }

  // Fraction (0..1) of the distance travelled along the 5-node tier path:
  // 0 = sitting on tier 1, 1 = reached tier 5. Each completed tier adds 1/4,
  // and the in-progress segment toward the next tier adds a fractional 1/4.
  // The timeline track widths/heights below are derived purely from this —
  // no magic pixel offsets — so the active bar always lands on circle centers.
  const tierFloor = currentTier.level - 1; // 0..4 completed segments
  const segmentProgress = nextTierInfo ? progressPercentage / 100 : 0; // 0..1 within current segment
  const pathProgress = Math.min(1, Math.max(0, (tierFloor + segmentProgress) / 4));

  // Tier path nodes — single source for both the desktop (horizontal) and
  // mobile (vertical) timelines. Thresholds mirror @shared/loyalty LOYALTY_TIERS.
  const tierNodes = [
    { level: 1, threshold: 0 },
    { level: 2, threshold: 100 },
    { level: 3, threshold: 500 },
    { level: 4, threshold: 2000 },
    { level: 5, threshold: 10000 },
  ];

  // Map categories read statistics
  let topCategoriesData = (activitySummary?.topCategories || []).map((tc: any) => {
    const cat = categoriesAll?.find(c => c.id === tc.categoryId);
    return {
      name: cat ? (cat.nameAr || cat.name) : "تصنيف آخر",
      value: tc.count,
      weight: tc.weight,
      color: cat?.color || "#6B7280",
      icon: cat?.icon
    };
  });

  // Client-side fallback if the API summary is empty but we have local reading history
  if (topCategoriesData.length === 0 && readingHistory.length > 0) {
    const counts: Record<string, { count: number; name: string; color: string }> = {};
    readingHistory.forEach((art) => {
      const catId = art.categoryId || art.category?.id;
      if (!catId) return;
      const fullCat = categoriesAll?.find(c => c.id === catId);
      const name = fullCat ? (fullCat.nameAr || fullCat.name) : (art.category?.nameAr || "تصنيف آخر");
      const color = fullCat?.color || art.category?.color || "#6B7280";
      if (!counts[catId]) {
        counts[catId] = { count: 0, name, color };
      }
      counts[catId].count += 1;
    });

    const total = readingHistory.length;
    topCategoriesData = Object.entries(counts).map(([_, data]) => ({
      name: data.name,
      value: data.count,
      weight: data.count / total,
      color: data.color,
      icon: null
    })).sort((a, b) => b.value - a.value);
  }
  // Calculate stats
  const totalReads = activitySummary?.totalArticlesRead ?? readingHistory.length ?? 0;
  const estimatedReadTime = Math.round(totalReads * 3);
  const totalEngagement = (activitySummary?.totalComments ?? 0) + (activitySummary?.totalReactions ?? 0) + (activitySummary?.totalBookmarks ?? 0);
  const userPoints = loyaltyPoints?.totalPoints ?? 0;

  const { data: followedKeywordsRaw, isLoading: isLoadingKeywords } = useQuery<
    Array<{ tagId: string; tagName: string; notify: boolean; articleCount: number }>
  >({
    queryKey: ["/api/user/followed-keywords"],
    enabled: !!user,
  });
  const followedKeywords = Array.isArray(followedKeywordsRaw) ? followedKeywordsRaw : [];

  const unfollowKeywordMutation = useMutation({
    mutationFn: async (tagId: string) => {
      return await apiRequest(`/api/keywords/unfollow/${tagId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/followed-keywords"] });
      toast({
        title: "تم إلغاء المتابعة",
        description: "لن تتلقى إشعارات عن هذه الكلمة",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل في إلغاء المتابعة",
        variant: "destructive",
      });
    },
  });

  const { data: followStats, isLoading: isLoadingFollowStats } = useQuery<{
    followersCount: number;
    followingCount: number;
  }>({
    queryKey: ['/api/social/stats', user?.id],
    enabled: !!user,
  });

  const { data: followersRaw, isLoading: isLoadingFollowers } = useQuery<
    Array<{
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      bio: string | null;
      profileImageUrl: string | null;
    }>
  >({
    queryKey: ['/api/social/followers', user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/social/followers/${user?.id}?limit=50`);
      if (!res.ok) throw new Error('Failed to fetch followers');
      return res.json();
    },
    enabled: !!user && activeTab === 'followers' && networkView === 'followers',
  });
  const followers = Array.isArray(followersRaw) ? followersRaw : [];

  const { data: followingRaw, isLoading: isLoadingFollowing } = useQuery<
    Array<{
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      bio: string | null;
      profileImageUrl: string | null;
    }>
  >({
    queryKey: ['/api/social/following', user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/social/following/${user?.id}?limit=50`);
      if (!res.ok) throw new Error('Failed to fetch following');
      return res.json();
    },
    enabled: !!user && activeTab === 'followers' && networkView === 'following',
  });
  const following = Array.isArray(followingRaw) ? followingRaw : [];

  const unfollowUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest(`/api/social/unfollow/${userId}`, {
        method: "DELETE",
      });
    },
    onSuccess: (_, unfollowedUserId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/social/followers', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/social/following', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/social/stats', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/social/stats', unfollowedUserId] });
      queryClient.invalidateQueries({ queryKey: ['/api/social/followers', unfollowedUserId] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      
      toast({
        title: "تم إلغاء المتابعة",
        description: "لم تعد تتابع هذا المستخدم",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل في إلغاء المتابعة",
        variant: "destructive",
      });
    },
  });

  // Press Card Status Query
  const { data: pressCardStatus, isLoading: isLoadingPressCard } = useQuery({
    queryKey: ['/api/wallet/press/status'],
    enabled: !!user,
  });

  // Loyalty Card Status Query
  const { data: loyaltyCardStatus, isLoading: isLoadingLoyaltyCard } = useQuery({
    queryKey: ['/api/wallet/loyalty/status'],
    enabled: !!user,
  });

  // Press Card Issuance Mutation
  const issuePressCardMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/wallet/press/issue', {
        method: 'POST',
        credentials: 'include',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to issue press card');
      }
      
      const contentType = response.headers.get('Content-Type');
      if (contentType === 'application/vnd.apple.pkpass') {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sabq-press-card.pkpass';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        return { success: true, downloaded: true };
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/wallet/press/status'] });
      toast({
        title: "تم التحميل",
        description: "تم تحميل البطاقة الصحفية. افتح الملف لإضافتها إلى Apple Wallet.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "تعذر إصدار البطاقة الصحفية",
        variant: "destructive",
      });
    },
  });

  // Loyalty Card Issuance Mutation
  const issueLoyaltyCardMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/wallet/loyalty/issue', {
        method: 'POST',
        credentials: 'include',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to issue loyalty card');
      }
      
      const contentType = response.headers.get('Content-Type');
      if (contentType === 'application/vnd.apple.pkpass') {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sabq-loyalty-card.pkpass';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        return { success: true, downloaded: true };
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/wallet/loyalty/status'] });
      toast({
        title: "تم التحميل",
        description: "تم تحميل بطاقة العضوية. افتح الملف لإضافتها إلى Apple Wallet.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "تعذر إصدار بطاقة العضوية",
        variant: "destructive",
      });
    },
  });

  const getInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName?.[0]}${user.lastName?.[0]}`.toUpperCase();
    }
    if (user?.email) {
      return user?.email?.[0].toUpperCase();
    }
    return 'م';
  };

  const getUserDisplayName = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user?.firstName) {
      return user.firstName;
    }
    if (user?.lastName) {
      return user.lastName;
    }
    return "مستخدم";
  };

  const getRoleBadge = (role?: string) => {
    // Full role→Arabic-label map. Previously this only covered five
    // roles which meant writers/columnists/editor-in-chief/etc. fell
    // through to either the raw English key or — when role was nil —
    // the "reader" fallback, surfacing as "قارئ" for non-reader users.
    // The 2026-05-20 fix to /api/auth/user now also ships `roleLabel`
    // directly from the DB; this client-side map is the fallback for
    // sessions cached before that backend deploy reached the edge.
    const labels: Record<string, string> = {
      system_admin: "مدير النظام",
      superadmin: "المدير العام",
      admin: "مسؤول",
      editor: "محرر",
      editor_in_chief: "رئيس التحرير",
      chief_editor: "رئيس التحرير",
      senior_editor: "محرر أول",
      managing_editor: "مدير تحرير",
      editorial_manager: "مدير تحرير",
      content_manager: "مدير محتوى",
      reporter: "مراسل",
      correspondent: "مراسل",
      journalist: "صحفي",
      writer: "كاتب",
      author: "كاتب",
      article_writer: "كاتب مقال",
      article_author: "كاتب مقال",
      opinion_author: "كاتب مقال رأي",
      columnist: "كاتب عمود",
      comments_moderator: "مشرف تعليقات",
      moderator: "مشرف",
      media_manager: "مدير وسائط",
      publisher: "ناشر",
      photographer: "مصور",
      contributor: "مساهم",
      reader: "قارئ",
    };
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      system_admin: "default",
      superadmin: "default",
      admin: "default",
      editor: "secondary",
      editor_in_chief: "default",
      chief_editor: "default",
      senior_editor: "secondary",
      managing_editor: "default",
      editorial_manager: "default",
      content_manager: "default",
      reporter: "secondary",
      correspondent: "secondary",
      journalist: "secondary",
      writer: "secondary",
      author: "secondary",
      article_writer: "secondary",
      article_author: "secondary",
      opinion_author: "secondary",
      columnist: "secondary",
      comments_moderator: "secondary",
      moderator: "secondary",
      media_manager: "secondary",
      publisher: "secondary",
      photographer: "outline",
      contributor: "outline",
      reader: "outline",
    };
    // Prefer the server-supplied roleLabel (Arabic, single source of
    // truth in the DB roles.name_ar column). Fall back to the local
    // map for sessions cached before the backend update propagated.
    const label = (user as any)?.roleLabel
      || labels[role || "reader"]
      || role
      || "قارئ";
    return (
      <Badge variant={variants[role || "reader"] || "outline"} data-testid="badge-user-role">
        {label}
      </Badge>
    );
  };

  const getRankIcon = (rank?: string) => {
    switch (rank) {
      case "سفير سبق":
        return <Trophy className="h-5 w-5 text-yellow-500" />;
      case "العضو الذهبي":
        return <Star className="h-5 w-5 text-amber-500" />;
      case "المتفاعل":
        return <TrendingUp className="h-5 w-5 text-blue-500" />;
      default:
        return <Coins className="h-5 w-5 text-gray-500" />;
    }
  };

  const getFollowerDisplayName = (follower: { firstName: string | null; lastName: string | null; email: string | null }) => {
    if (follower.firstName || follower.lastName) {
      return `${follower.firstName || ''} ${follower.lastName || ''}`.trim();
    }
    return follower.email || 'مستخدم';
  };

  const getFollowerInitials = (follower: { firstName: string | null; lastName: string | null; email: string | null }) => {
    if (follower.firstName) return follower.firstName?.[0].toUpperCase();
    if (follower.email) return follower?.email?.[0].toUpperCase();
    return 'م';
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Header user={user} />
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-4">يجب تسجيل الدخول</h1>
            <p className="text-muted-foreground mb-8">
              سجل الدخول لعرض ملفك الشخصي
            </p>
            <Button 
              onClick={() => window.location.href = "/api/login"} 
              data-testid="button-login-profile"
            >
              تسجيل الدخول
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header user={user} />

      {/* Email Verification Alert */}
      {user && !user.emailVerified && (
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-4" dir="rtl">
          <Alert className="bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900" data-testid="alert-email-verification">
            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />
            <AlertTitle className="text-yellow-800 dark:text-yellow-300 text-right">
              يرجى تفعيل حسابك عبر البريد الإلكتروني
            </AlertTitle>
            <AlertDescription className="text-yellow-700 dark:text-yellow-400">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-right">
                  للوصول الكامل لجميع الميزات، يرجى التحقق من بريدك الإلكتروني وتفعيل حسابك.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resendVerificationMutation.mutate()}
                  disabled={resendVerificationMutation.isPending}
                  className="shrink-0 border-yellow-300 dark:border-yellow-800 hover:bg-yellow-100 dark:hover:bg-yellow-900/30"
                  data-testid="button-resend-verification"
                >
                  {resendVerificationMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                      جاري الإرسال...
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4 ml-2" />
                      إعادة إرسال رسالة التحقق
                    </>
                  )}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Modern Profile Header — Phase 2 loyalty redesign */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8" dir="rtl">
        {(() => {
          const lifetime = loyaltyPoints?.lifetimePoints ?? 0;
          const heroTier = computeTier(lifetime);
          const heroLevel = loyaltyPoints?.rankLevel ?? heroTier.level;
          return (
        <Card
          className="mb-6 overflow-hidden border-transparent relative"
          style={{
            background: `linear-gradient(135deg, ${heroTier.color}14 0%, transparent 55%)`,
          }}
        >
          {/* Tier accent stripe at the top */}
          <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${heroTier.color}, transparent)` }} />
          <CardContent className="p-5 sm:p-7">
            {/* 2026-05-19 rev — declutter the hero. The previous layout
                stacked four chips of different sizes (tier, role, press
                card) next to the name, with mismatched primary/outline
                buttons below. The tier chip was redundant with the
                LoyaltyCard. Now: avatar + name + email + ONE compact
                meta row (role + press, both same neutral chip style),
                then two same-size buttons. On mobile everything centers
                so the wrap doesn't look chaotic. */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr,auto] gap-6 lg:gap-8 items-center">
              <div className="flex flex-col sm:flex-row gap-5 sm:gap-6 items-center sm:items-start text-center sm:text-right">
              {/* Avatar with tier ring */}
              <div className="relative shrink-0">
                <div
                  className="rounded-full p-1"
                  style={{ background: `linear-gradient(135deg, ${heroTier.color}, ${heroTier.color}66)` }}
                >
                  <Avatar className="h-24 w-24 sm:h-28 sm:w-28 border-4 border-background shadow-xl">
                    <AvatarImage
                      src={user.profileImageUrl || ""}
                      alt={getUserDisplayName()}
                      className="object-cover"
                      data-testid="img-profile-avatar"
                    />
                    <AvatarFallback className="bg-primary text-primary-foreground text-2xl sm:text-3xl">
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>
                </div>

                <div className="absolute -bottom-1 -right-1">
                  <input
                    id="avatar-file-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={handleAvatarFileChange}
                    disabled={isUploadingAvatar}
                    data-testid="input-avatar-file"
                  />
                  <Button
                    type="button"
                    variant="default"
                    size="icon"
                    className="h-8 w-8 rounded-full shadow-md"
                    disabled={isUploadingAvatar}
                    onClick={() => document.getElementById("avatar-file-input")?.click()}
                    data-testid="button-upload-avatar"
                    aria-label="تغيير الصورة الشخصية"
                  >
                    <Upload className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 space-y-3">
                <div className="space-y-1">
                  <h1
                    className="text-2xl sm:text-3xl font-bold leading-tight truncate"
                    data-testid="text-profile-name"
                  >
                    {getUserDisplayName()}
                  </h1>
                  <p
                    className="text-sm text-muted-foreground truncate"
                    data-testid="text-profile-email"
                  >
                    {user.email}
                  </p>
                </div>

                {/* Compact meta row — role + press credential only. Tier
                    badge lives on the loyalty card to its left, so we
                    don't repeat it here. */}
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
                  {getRoleBadge(user.role)}
                  {user.hasPressCard && (
                    <Badge variant="outline" className="gap-1 font-normal" data-testid="badge-press-card">
                      <IdCard className="h-3 w-3" />
                      صحفي معتمد
                    </Badge>
                  )}
                </div>

                {user.bio && !isEditingProfile && (
                  <p className="text-sm text-foreground/80 max-w-2xl leading-relaxed">
                    {user.bio}
                  </p>
                )}

                {/* Quick Actions — same size, same variant family so
                    they read as a unit. Full width on mobile, inline on
                    sm+. */}
                <div className="flex flex-col sm:flex-row gap-2 pt-1 w-full sm:w-auto">
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-2 w-full sm:w-auto"
                    onClick={() => setIsEditingProfile(!isEditingProfile)}
                    data-testid="button-edit-profile"
                  >
                    <Edit className="h-4 w-4" />
                    {isEditingProfile ? "إلغاء التعديل" : "تعديل الملف"}
                  </Button>

                  {hasRole(user, "editor", "admin", "system_admin") && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 w-full sm:w-auto"
                      asChild
                      data-testid="button-go-to-dashboard"
                    >
                      <Link href="/dashboard">
                        <LayoutDashboard className="h-4 w-4" />
                        لوحة التحكم
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
              </div>

              {/* Loyalty Card — the showpiece. Full-width on mobile, fixed-width on desktop. */}
              <div className="w-full lg:w-[400px] shrink-0">
                <LoyaltyCard
                  userName={getUserDisplayName()}
                  userId={user.id}
                  lifetimePoints={lifetime}
                  memberSince={user.createdAt}
                  rankLevel={heroLevel}
                />
              </div>
            </div>

            {/* Edit Profile Form */}
            <AnimatePresence>
              {isEditingProfile && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-6 pt-6 border-t"
                >
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      {/* Names are write-once for comment integrity — once a
                         non-empty value exists the input is read-only and the
                         backend silently drops further updates. See PR for
                         the security rationale. */}
                      {(() => {
                        const firstNameLocked = !!user?.firstName?.trim();
                        const lastNameLocked = !!user?.lastName?.trim();
                        return (
                          <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <FormField
                                control={form.control}
                                name="firstName"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>الاسم الأول</FormLabel>
                                    <FormControl>
                                      <Input
                                        {...field}
                                        readOnly={firstNameLocked}
                                        disabled={firstNameLocked}
                                        className={firstNameLocked ? "opacity-70 cursor-not-allowed" : ""}
                                        data-testid="input-first-name"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={form.control}
                                name="lastName"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>اسم العائلة</FormLabel>
                                    <FormControl>
                                      <Input
                                        {...field}
                                        readOnly={lastNameLocked}
                                        disabled={lastNameLocked}
                                        className={lastNameLocked ? "opacity-70 cursor-not-allowed" : ""}
                                        data-testid="input-last-name"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            {(firstNameLocked || lastNameLocked) && (
                              <p className="text-xs text-muted-foreground -mt-2">
                                لا يمكن تعديل الاسم بعد التسجيل لاعتبارات أمنية ومصداقية التعليقات
                              </p>
                            )}
                          </>
                        );
                      })()}

                      <FormField
                        control={form.control}
                        name="phoneNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>رقم الهاتف</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-phone-number" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="bio"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>نبذة عنك</FormLabel>
                            <FormControl>
                              <Textarea 
                                {...field} 
                                rows={4}
                                placeholder="اكتب نبذة مختصرة عنك..."
                                data-testid="input-bio"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="flex gap-2">
                        <Button
                          type="submit"
                          disabled={updateMutation.isPending}
                          data-testid="button-save-profile"
                        >
                          {updateMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                              جاري الحفظ...
                            </>
                          ) : (
                            "حفظ التغييرات"
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setIsEditingProfile(false);
                            form.reset();
                          }}
                          data-testid="button-cancel-edit"
                        >
                          إلغاء
                        </Button>
                      </div>
                    </form>
                  </Form>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
          );
        })()}

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 md:gap-4 mb-6">
          <MobileOptimizedKpiCard
            label="متابع"
            value={(followStats?.followersCount || 0).toLocaleString('en-US')}
            icon={Users}
            iconColor="text-primary"
            iconBgColor="bg-primary/10"
            testId="text-stat-followers"
          />

          <MobileOptimizedKpiCard
            label="إعجاب"
            value={likedArticles.length.toLocaleString('en-US')}
            icon={Heart}
            iconColor="text-primary"
            iconBgColor="bg-primary/10"
            testId="text-stat-likes"
          />

          <MobileOptimizedKpiCard
            label="محفوظ"
            value={bookmarkedArticles.length.toLocaleString('en-US')}
            icon={Bookmark}
            iconColor="text-primary"
            iconBgColor="bg-primary/10"
            testId="text-stat-bookmarks"
          />

          <MobileOptimizedKpiCard
            label="قراءة"
            value={readingHistory.length.toLocaleString('en-US')}
            icon={Eye}
            iconColor="text-primary"
            iconBgColor="bg-primary/10"
            testId="text-stat-reads"
          />

          <MobileOptimizedKpiCard
            label="نقطة"
            value={(loyaltyPoints?.totalPoints || 0).toLocaleString('en-US')}
            icon={Coins}
            iconColor="text-amber-500"
            iconBgColor="bg-amber-500/10"
            testId="text-stat-points"
          />
        </div>

        {/* Main Content with Tabs */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <Card>
            <CardContent className="p-6">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                {/* Responsive 5-column tab grid — icon stacks above the label
                    on mobile, sits inline on sm+. grid-cols-5 guarantees no
                    horizontal scroll and no chaotic wrapping at any width. */}
                <TabsList dir="rtl" className="grid w-full grid-cols-5 h-auto gap-1 rounded-xl bg-muted p-1 mb-6">
                  <TabsTrigger value="journey" data-testid="tab-journey" className="flex-col sm:flex-row gap-1 sm:gap-2 h-auto py-2 px-1 sm:px-3 text-[11px] sm:text-sm rounded-lg data-[state=active]:shadow-sm">
                    <Trophy className="h-4 w-4 shrink-0" />
                    <span>نظرة عامة</span>
                  </TabsTrigger>

                  <TabsTrigger value="bookmarks" data-testid="tab-bookmarks" className="flex-col sm:flex-row gap-1 sm:gap-2 h-auto py-2 px-1 sm:px-3 text-[11px] sm:text-sm rounded-lg data-[state=active]:shadow-sm">
                    <Bookmark className="h-4 w-4 shrink-0" />
                    <span>محفوظاتي</span>
                  </TabsTrigger>

                  <TabsTrigger value="followers" data-testid="tab-followers" className="flex-col sm:flex-row gap-1 sm:gap-2 h-auto py-2 px-1 sm:px-3 text-[11px] sm:text-sm rounded-lg data-[state=active]:shadow-sm">
                    <Users className="h-4 w-4 shrink-0" />
                    <span>شبكتي</span>
                  </TabsTrigger>

                  <TabsTrigger value="wallet" data-testid="tab-wallet" className="flex-col sm:flex-row gap-1 sm:gap-2 h-auto py-2 px-1 sm:px-3 text-[11px] sm:text-sm rounded-lg data-[state=active]:shadow-sm">
                    <Wallet className="h-4 w-4 shrink-0" />
                    <span>المحفظة</span>
                  </TabsTrigger>

                  <TabsTrigger value="settings" data-testid="tab-settings" className="flex-col sm:flex-row gap-1 sm:gap-2 h-auto py-2 px-1 sm:px-3 text-[11px] sm:text-sm rounded-lg data-[state=active]:shadow-sm">
                    <Settings className="h-4 w-4 shrink-0" />
                    <span>الإعدادات</span>
                  </TabsTrigger>
                </TabsList>

                {/* Journey Dashboard Tab */}
                <TabsContent value="journey" className="space-y-8" dir="rtl">
                  {/* Journey Header Card */}
                  <Card className="border-transparent bg-gradient-to-br from-primary/10 via-background to-accent/5 overflow-hidden relative">
                    <CardContent className="p-6">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="space-y-1 text-right">
                          <h3 className="text-xl font-bold flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-amber-500 animate-pulse" />
                            أهلاً بك في رحلتك المعرفية في سبق!
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            هنا يمكنك استكشاف إحصائيات قراءتك، ومتابعة رتبة ولائك، واكتشاف الأوسمة المقترحة لك.
                          </p>
                        </div>
                        <div className="flex items-center gap-2 bg-background/50 backdrop-blur border border-border/50 rounded-full px-4 py-2 text-xs font-semibold">
                          <Clock className="h-3.5 w-3.5 text-primary" />
                          <span>آخر تحديث: {new Date(activitySummary?.updatedAt || Date.now()).toLocaleDateString("ar-SA", { hour: "numeric", minute: "numeric" })}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Interactive Stats Grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="hover-elevate cursor-default transition-all duration-300">
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                          <Eye className="h-5 w-5" />
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">المقالات المقروءة</p>
                          <h4 className="text-2xl font-bold mt-0.5 tabular-nums">{totalReads.toLocaleString("en-US")}</h4>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {activitySummary?.articlesReadLast7Days ?? 0} هذا الأسبوع
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="hover-elevate cursor-default transition-all duration-300">
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-500">
                          <Coins className="h-5 w-5" />
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">نقاط الولاء</p>
                          <h4 className="text-2xl font-bold mt-0.5 tabular-nums">{userPoints.toLocaleString("en-US")}</h4>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            من أصل {lifetime.toLocaleString("en-US")} نقطة تاريخية
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="hover-elevate cursor-default transition-all duration-300">
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                          <Clock className="h-5 w-5" />
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">وقت القراءة المقدر</p>
                          <h4 className="text-2xl font-bold mt-0.5 tabular-nums">{estimatedReadTime.toLocaleString("en-US")} د</h4>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            بمتوسط 3 دقائق للمقال
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="hover-elevate cursor-default transition-all duration-300">
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                          <Heart className="h-5 w-5" />
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">التفاعل والمشاركة</p>
                          <h4 className="text-2xl font-bold mt-0.5 tabular-nums">{totalEngagement.toLocaleString("en-US")}</h4>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {activitySummary?.totalComments ?? 0} تعليق · {activitySummary?.totalReactions ?? 0} إعجاب
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Loyalty Road / Tier Pathway */}
                  <Card className="border border-border/50">
                    <CardHeader className="pb-3 text-right">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Trophy className="h-5 w-5 text-amber-500" />
                        مسار تقدم رتبة الولاء
                      </CardTitle>
                      <CardDescription>
                        كلما تفاعلت وقرأت أكثر في سبق، كلما ارتفعت رتبتك لتحصل على مزايا خاصة وأوسمة حصرية.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-2">
                      <div className="space-y-6">
                        {/* Responsive Timeline Container */}
                        <div className="py-2" dir="rtl">
                          {/* Desktop Timeline (Horizontal). The 5 circles each
                              live in an equal flex-1 cell, so their centers land
                              precisely at 10/30/50/70/90% of the row width. The
                              track spans exactly between the first and last
                              centers (inset 10% on both sides) and the active
                              fill width = 80% × pathProgress, so the bar always
                              terminates on a real circle center. */}
                          <div className="hidden sm:block max-w-3xl mx-auto py-2">
                            <div className="relative flex items-start">
                              <div
                                className="absolute top-5 -translate-y-1/2 h-1 rounded-full bg-muted"
                                style={{ insetInlineStart: "10%", insetInlineEnd: "10%" }}
                              />
                              <div
                                className="absolute top-5 -translate-y-1/2 h-1 rounded-full bg-gradient-to-l from-amber-500 to-amber-400 transition-all duration-700"
                                style={{ insetInlineStart: "10%", width: `calc(80% * ${pathProgress})` }}
                              />

                              {tierNodes.map(({ level, threshold }) => {
                                const tierInfo = computeTier(threshold);
                                const isCurrent = currentTier.level === level;
                                const isUnlocked = currentTier.level >= level;
                                return (
                                  <div key={level} className="relative z-10 flex flex-1 flex-col items-center gap-2">
                                    <div
                                      className={cn(
                                        "h-10 w-10 rounded-full flex items-center justify-center border-2 transition-all duration-500 shadow-sm",
                                        isCurrent
                                          ? "bg-background border-amber-500 ring-4 ring-amber-500/20 text-amber-600 dark:text-amber-500 font-bold scale-110"
                                          : isUnlocked
                                            ? "bg-amber-500 border-amber-500 text-white"
                                            : "bg-background border-muted text-muted-foreground"
                                      )}
                                      title={tierInfo.nameAr}
                                    >
                                      {level}
                                    </div>
                                    <span
                                      className={cn(
                                        "text-[11px] text-center leading-tight",
                                        isCurrent
                                          ? "text-amber-600 dark:text-amber-500 font-bold"
                                          : isUnlocked
                                            ? "text-foreground font-medium"
                                            : "text-muted-foreground"
                                      )}
                                    >
                                      {tierInfo.nameAr}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Mobile Timeline (Vertical). Fixed-height column with
                              5 equal flex-1 rows keeps node centers at
                              10/30/50/70/90% of the height; the vertical track and
                              its active fill use the same pathProgress fraction. */}
                          <div className="sm:hidden h-[340px] max-w-xs mx-auto">
                            <div className="relative flex h-full flex-col">
                              <div
                                className="absolute w-1 rounded-full bg-muted"
                                style={{ insetInlineEnd: 16, top: "10%", bottom: "10%" }}
                              />
                              <div
                                className="absolute w-1 rounded-full bg-gradient-to-b from-amber-500 to-amber-400 transition-all duration-700"
                                style={{ insetInlineEnd: 16, top: "10%", height: `calc(80% * ${pathProgress})` }}
                              />

                              {tierNodes.map(({ level, threshold }) => {
                                const tierInfo = computeTier(threshold);
                                const isCurrent = currentTier.level === level;
                                const isUnlocked = currentTier.level >= level;
                                return (
                                  <div key={level} className="relative z-10 flex flex-1 items-center gap-3">
                                    <div
                                      className={cn(
                                        "h-9 w-9 shrink-0 rounded-full flex items-center justify-center border-2 transition-all duration-500 shadow-sm",
                                        isCurrent
                                          ? "bg-background border-amber-500 ring-4 ring-amber-500/20 text-amber-600 dark:text-amber-500 font-bold"
                                          : isUnlocked
                                            ? "bg-amber-500 border-amber-500 text-white font-bold"
                                            : "bg-background border-muted text-muted-foreground"
                                      )}
                                    >
                                      {level}
                                    </div>
                                    <div className="flex flex-col text-right">
                                      <span
                                        className={cn(
                                          "text-xs font-bold",
                                          isCurrent
                                            ? "text-amber-600 dark:text-amber-500"
                                            : isUnlocked
                                              ? "text-foreground"
                                              : "text-muted-foreground"
                                        )}
                                      >
                                        {tierInfo.nameAr}
                                      </span>
                                      <span className="text-[10px] text-muted-foreground">
                                        من {threshold.toLocaleString("en-US")} نقطة
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Progress Explanation subtext */}
                        <div className="mt-8 text-center bg-muted/30 border border-border/30 rounded-lg p-3 max-w-md mx-auto text-xs">
                          {nextTierInfo ? (
                            <p className="leading-relaxed">
                              أنت الآن برتبة <strong className="text-amber-500">{currentTier.nameAr}</strong>. 
                              تحتاج إلى <strong className="text-primary">{pointsToNext.toLocaleString("en-US")}</strong> نقطة إضافية للترقية إلى رتبة <strong>{nextTierInfo.nameAr}</strong>.
                            </p>
                          ) : (
                            <p className="text-amber-500 font-bold leading-relaxed">
                              تهانينا! لقد وصلت إلى الرتبة الأعلى: {currentTier.nameAr} (سفير سبق) 🎉
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Category Breakdown section */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Recharts PieChart Container */}
                    <Card className="md:col-span-1 border border-border/50">
                      <CardHeader className="text-right">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <LayoutDashboard className="h-4 w-4 text-primary" />
                          توزيع اهتماماتك
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="h-[220px] flex items-center justify-center p-2 relative">
                        {topCategoriesData.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={topCategoriesData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius={75}
                                innerRadius={55}
                                paddingAngle={3}
                              >
                                {topCategoriesData.map((entry: any, index: number) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                              <ChartTooltip formatter={(val: any) => [`${val} مقال`, 'قراءات']} />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="text-center text-xs text-muted-foreground py-8">
                            لا توجد قراءات كافية لتحليل الاهتمامات
                          </div>
                        )}
                        {topCategoriesData.length > 0 && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-6">
                            <span className="text-xl font-bold text-foreground">{totalReads}</span>
                            <span className="text-[10px] text-muted-foreground">مقالاً مقروءاً</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Detailed list with values */}
                    <Card className="md:col-span-2 border border-border/50">
                      <CardHeader className="text-right">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-primary" />
                          تفاصيل القراءة حسب الأقسام
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {topCategoriesData.length > 0 ? (
                          <div className="space-y-4">
                            {topCategoriesData.map((item: any, idx: number) => (
                              <div key={idx} className="space-y-1.5 text-right">
                                <div className="flex justify-between items-center text-xs">
                                  <span className="flex items-center gap-2 font-medium">
                                    <span 
                                      className="h-2.5 w-2.5 rounded-full" 
                                      style={{ backgroundColor: item.color }} 
                                    />
                                    {item.name}
                                  </span>
                                  <span className="text-muted-foreground font-mono">
                                    {item.value} مقال ({Math.round(item.weight * 100)}%)
                                  </span>
                                </div>
                                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                  <div 
                                    className="h-full rounded-full transition-all duration-500" 
                                    style={{ 
                                      backgroundColor: item.color,
                                      width: `${item.weight * 100}%` 
                                    }} 
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-12 text-muted-foreground text-sm">
                            <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                            ابدأ بقراءة بعض المقالات لرؤية تحليل تفصيلي لاهتماماتك.
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Achievements Grid */}
                  <Card className="border border-border/50">
                    <CardHeader className="text-right">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Trophy className="h-5 w-5 text-amber-500" />
                        الأوسمة والإنجازات المعرفية
                      </CardTitle>
                      <CardDescription>
                        أكمل المهام المختلفة لفتح أوسمة الإنجاز وتثبيتها في ملفك الشخصي.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                        {[
                          {
                            id: "welcome",
                            title: "شارة البداية",
                            description: "عضو جديد في عائلة سبق",
                            icon: Trophy,
                            unlocked: true,
                          },
                          {
                            id: "reader",
                            title: "القارئ النهم",
                            description: "قرأت أكثر من 20 مقالاً",
                            icon: Eye,
                            unlocked: totalReads >= 20,
                          },
                          {
                            id: "commenter",
                            title: "معلق متميز",
                            description: "شاركت بـ 5 تعليقات أو أكثر",
                            icon: FileText,
                            unlocked: (activitySummary?.totalComments ?? 0) >= 5,
                          },
                          {
                            id: "supporter",
                            title: "المساند المتفاعل",
                            description: "أضفت 10 تفاعلات أو إعجابات",
                            icon: Heart,
                            unlocked: (activitySummary?.totalReactions ?? 0) >= 10,
                          },
                          {
                            id: "passionate",
                            title: "شغوف بالمعرفة",
                            description: "جمعت 500 نقطة ولاء",
                            icon: Star,
                            unlocked: lifetime >= 500,
                          },
                          {
                            id: "ambassador",
                            title: "سفير سبق",
                            description: "الوصول إلى الرتبة الأعلى في سبق",
                            icon: Shield,
                            unlocked: currentTier.level === 5,
                          },
                        ].map((badge) => {
                          const IconComponent = badge.icon;
                          return (
                            <motion.div
                              key={badge.id}
                              whileHover={badge.unlocked ? { scale: 1.04, y: -3 } : {}}
                              transition={{ type: "spring", stiffness: 300, damping: 15 }}
                              className="relative h-full"
                            >
                              {/* Unified gold/amber loyalty theme for unlocked
                                  badges; muted + dashed for locked ones. */}
                              <Card
                                className={cn(
                                  "h-full p-4 flex flex-col items-center justify-between text-center gap-3 transition-all duration-300 relative overflow-hidden border",
                                  badge.unlocked
                                    ? "bg-card border-amber-500/20 shadow-sm hover:shadow-md hover:border-amber-500/40"
                                    : "bg-muted/5 opacity-60 border-dashed border-border"
                                )}
                              >
                                <div
                                  className={cn(
                                    "h-12 w-12 rounded-2xl flex items-center justify-center transition-transform duration-500",
                                    badge.unlocked
                                      ? "bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-md shadow-amber-500/20"
                                      : "bg-muted/30 text-muted-foreground border border-border"
                                  )}
                                >
                                  <IconComponent className="h-5 w-5" />
                                </div>

                                <div className="space-y-1 z-10 flex-1 flex flex-col justify-center">
                                  <h5 className={cn("text-[11px] font-bold leading-tight", badge.unlocked ? "text-foreground" : "text-muted-foreground")}>
                                    {badge.title}
                                  </h5>
                                  <p className="text-[9px] text-muted-foreground leading-normal max-w-[100px] mx-auto">
                                    {badge.description}
                                  </p>
                                </div>

                                {badge.unlocked ? (
                                  <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-500 border-amber-500/20 text-[9px] px-1.5 py-0 gap-1">
                                    <Check className="h-2 w-2" />
                                    مكتمل
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-muted/20 text-muted-foreground/60 border-transparent text-[9px] px-1.5 py-0 gap-1">
                                    <Lock className="h-2 w-2" />
                                    مغلق
                                  </Badge>
                                )}

                                {badge.unlocked ? (
                                  <div className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-500 border border-amber-500/30">
                                    <Check className="h-2.5 w-2.5" />
                                  </div>
                                ) : (
                                  <div className="absolute top-1.5 right-1.5 text-muted-foreground/60">
                                    <Lock className="h-3 w-3" />
                                  </div>
                                )}
                              </Card>
                            </motion.div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Recommendations */}
                  <div>
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-right">
                      <Sparkles className="h-5 w-5 text-amber-500 animate-pulse" />
                      ترشيحات معرفية مخصصة لرحلتك
                    </h3>
                    {recommendations && recommendations.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" dir="rtl">
                        {recommendations.slice(0, 3).map((article) => (
                          <ArticleCard key={article.id} article={article} />
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-10 bg-muted/20 rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                        نعمل حالياً على تحليل قراءاتك لتجهيز الترشيحات الأنسب لك.
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Saved Tab — bookmarks + likes + reading history merged into
                    one organized surface. An internal segmented control switches
                    between the three lists, all rendered as compact list cards
                    (small thumbnail) instead of the large grid cards. */}
                <TabsContent value="bookmarks" className="space-y-5" dir="rtl">
                  <div className="grid grid-cols-3 w-full max-w-md gap-1 rounded-lg bg-muted p-1">
                    <button
                      type="button"
                      onClick={() => setSavedView("bookmarks")}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] sm:text-sm font-medium transition-all",
                        savedView === "bookmarks" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      )}
                      data-testid="button-saved-bookmarks"
                    >
                      <Bookmark className="h-4 w-4 shrink-0" />
                      <span className="truncate">المحفوظات</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSavedView("likes")}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] sm:text-sm font-medium transition-all",
                        savedView === "likes" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      )}
                      data-testid="tab-activity"
                    >
                      <Heart className="h-4 w-4 shrink-0" />
                      <span className="truncate">الإعجابات</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSavedView("history")}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] sm:text-sm font-medium transition-all",
                        savedView === "history" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      )}
                      data-testid="button-saved-history"
                    >
                      <Clock className="h-4 w-4 shrink-0" />
                      <span className="truncate">سجل القراءة</span>
                    </button>
                  </div>

                  {savedView === "bookmarks" && (
                    <SavedArticlesList
                      articles={bookmarkedArticles}
                      isLoading={isLoadingBookmarks}
                      emptyIcon={Bookmark}
                      emptyText="لم تحفظ أي مقالات بعد"
                      emptyHint="احفظ المقالات المهمة لقراءتها لاحقًا"
                    />
                  )}
                  {savedView === "likes" && (
                    <SavedArticlesList
                      articles={likedArticles}
                      isLoading={isLoadingLiked}
                      emptyIcon={Heart}
                      emptyText="لم تعجبك أي مقالات بعد"
                      emptyHint="ستظهر هنا المقالات التي أعجبت بها"
                    />
                  )}
                  {savedView === "history" && (
                    <SavedArticlesList
                      articles={readingHistory}
                      isLoading={isLoadingHistory}
                      emptyIcon={Clock}
                      emptyText="لم تقرأ أي مقالات بعد"
                      emptyHint="ستظهر هنا آخر المقالات التي قرأتها"
                    />
                  )}
                </TabsContent>

                {/* Network Tab — followers + following unified under one tab.
                    The internal toggle uses its own networkView state (decoupled
                    from the page-level activeTab) so switching never re-mounts
                    the whole tab. */}
                <TabsContent value="followers" className="space-y-4" dir="rtl">
                  <div className="grid grid-cols-2 w-full max-w-md gap-1 rounded-lg bg-muted p-1">
                    <button
                      type="button"
                      onClick={() => setNetworkView("followers")}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs sm:text-sm font-medium transition-all",
                        networkView === "followers" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      )}
                      data-testid="button-show-followers"
                    >
                      <Users className="h-4 w-4 shrink-0" />
                      المتابِعون
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{followStats?.followersCount || 0}</Badge>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNetworkView("following")}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs sm:text-sm font-medium transition-all",
                        networkView === "following" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      )}
                      data-testid="button-show-following"
                    >
                      <UserPlus className="h-4 w-4 shrink-0" />
                      المتابَعون
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{followStats?.followingCount || 0}</Badge>
                    </button>
                  </div>

                  {networkView === "followers" ? (
                    isLoadingFollowers ? (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {[1, 2, 3, 4].map((i) => (
                          <Skeleton key={i} className="h-20 rounded-xl" />
                        ))}
                      </div>
                    ) : followers.length > 0 ? (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {followers.map((follower) => (
                          <Card key={follower.id} className="hover-elevate">
                            <CardContent className="p-4">
                              <div className="flex items-center gap-3">
                                <Avatar>
                                  <AvatarImage src={follower.profileImageUrl || ""} />
                                  <AvatarFallback>
                                    {getFollowerInitials(follower)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate">
                                    {getFollowerDisplayName(follower)}
                                  </p>
                                  {follower.bio && (
                                    <p className="text-sm text-muted-foreground line-clamp-1">
                                      {follower.bio}
                                    </p>
                                  )}
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  asChild
                                  className="shrink-0"
                                  data-testid={`button-view-profile-${follower.id}`}
                                >
                                  <Link href={`/user/${follower.id}`}>
                                    عرض
                                  </Link>
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12 bg-muted/30 rounded-xl border border-dashed border-border">
                        <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/60" />
                        <p className="text-muted-foreground font-medium">لا يوجد متابعون بعد</p>
                      </div>
                    )
                  ) : isLoadingFollowing ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-20 rounded-xl" />
                      ))}
                    </div>
                  ) : following.length > 0 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {following.map((followed) => (
                        <Card key={followed.id} className="hover-elevate">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                              <Avatar>
                                <AvatarImage src={followed.profileImageUrl || ""} />
                                <AvatarFallback>
                                  {getFollowerInitials(followed)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">
                                  {getFollowerDisplayName(followed)}
                                </p>
                                {followed.bio && (
                                  <p className="text-sm text-muted-foreground line-clamp-1">
                                    {followed.bio}
                                  </p>
                                )}
                              </div>
                              <div className="flex gap-2 shrink-0">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  asChild
                                  data-testid={`button-view-profile-${followed.id}`}
                                >
                                  <Link href={`/user/${followed.id}`}>
                                    عرض
                                  </Link>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => unfollowUserMutation.mutate(followed.id)}
                                  disabled={unfollowUserMutation.isPending}
                                  data-testid={`button-unfollow-user-${followed.id}`}
                                >
                                  <UserMinus className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-muted/30 rounded-xl border border-dashed border-border">
                      <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/60" />
                      <p className="text-muted-foreground font-medium">لا تتابع أحدًا بعد</p>
                    </div>
                  )}
                </TabsContent>

                {/* Settings Tab */}
                <TabsContent value="settings" className="space-y-6" dir="rtl">
                  <div>
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Bell className="h-5 w-5" />
                      إعدادات الإشعارات
                    </h3>
                    <Card>
                      <CardContent className="p-6">
                        <p className="text-muted-foreground">
                          قريبًا: خيارات تخصيص الإشعارات
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      الخصوصية والأمان
                    </h3>
                    <Card>
                      <CardContent className="p-6">
                        <TwoFactorSettings />
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* Wallet Tab */}
                <TabsContent value="wallet" className="space-y-6" dir="rtl">
                  <div>
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Wallet className="h-5 w-5" />
                      Apple Wallet
                    </h3>
                    
                    <div className="space-y-4">
                      {/* Loyalty Card */}
                      <Card>
                        <CardContent className="p-6">
                          <div className="flex items-start gap-4">
                            <div className="h-12 w-12 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                              <Trophy className="h-6 w-6 text-amber-600 dark:text-amber-500" />
                            </div>
                            <div className="flex-1 space-y-3">
                              <div>
                                <h4 className="font-semibold">بطاقة العضوية</h4>
                                <p className="text-sm text-muted-foreground mt-1">
                                  احصل على بطاقة عضوية رقمية تعرض نقاط الولاء ورتبتك
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="gap-1">
                                  <Coins className="h-3 w-3" />
                                  {loyaltyPoints?.totalPoints || 0} نقطة
                                </Badge>
                                <Badge variant="outline">
                                  {loyaltyPoints?.currentRank || "القارئ الجديد"}
                                </Badge>
                              </div>
                              <Button
                                onClick={() => issueLoyaltyCardMutation.mutate()}
                                disabled={issueLoyaltyCardMutation.isPending}
                                className="gap-2"
                                data-testid="button-download-loyalty-card"
                              >
                                {issueLoyaltyCardMutation.isPending ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    جاري الإصدار...
                                  </>
                                ) : (
                                  <>
                                    <Download className="h-4 w-4" />
                                    تحميل بطاقة العضوية
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Press Card (if eligible) */}
                      {user.hasPressCard && (
                        <Card>
                          <CardContent className="p-6">
                            <div className="flex items-start gap-4">
                              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <IdCard className="h-6 w-6 text-primary" />
                              </div>
                              <div className="flex-1 space-y-3">
                                <div>
                                  <h4 className="font-semibold">البطاقة الصحفية</h4>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    بطاقة صحفية رقمية معتمدة من سبق للصحفيين
                                  </p>
                                </div>
                                <Badge variant="default" className="gap-1">
                                  <Check className="h-3 w-3" />
                                  صحفي معتمد
                                </Badge>
                                <Button
                                  onClick={() => issuePressCardMutation.mutate()}
                                  disabled={issuePressCardMutation.isPending}
                                  className="gap-2"
                                  data-testid="button-download-press-card"
                                >
                                  {issuePressCardMutation.isPending ? (
                                    <>
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                      جاري الإصدار...
                                    </>
                                  ) : (
                                    <>
                                      <Download className="h-4 w-4" />
                                      تحميل البطاقة الصحفية
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Sidebar */}
          <aside className="space-y-6">
            {/* Smart Interests */}
            <div>
              <SmartInterestsBlock userId={user.id} />
            </div>

            {/* Followed Keywords */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  كلماتي المتابعة
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingKeywords ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-8" />
                    ))}
                  </div>
                ) : followedKeywords.length > 0 ? (
                  <div className="space-y-2">
                    {followedKeywords.slice(0, 5).map((keyword) => (
                      <div
                        key={keyword.tagId}
                        className="flex items-center justify-between gap-2 p-2 rounded-md hover-elevate"
                      >
                        <Link href={`/keyword/${keyword.tagName}`}>
                          <span className="flex items-center gap-2 flex-1 cursor-pointer" data-testid={`link-keyword-${keyword.tagId}`}>
                            <Tag className="h-3.5 w-3.5 text-primary" />
                            <span className="text-sm font-medium">{keyword.tagName}</span>
                            <Badge variant="secondary" className="text-xs">
                              {keyword.articleCount}
                            </Badge>
                          </span>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => unfollowKeywordMutation.mutate(keyword.tagId)}
                          disabled={unfollowKeywordMutation.isPending}
                          data-testid={`button-unfollow-keyword-${keyword.tagId}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Tag className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      لم تتابع أي كلمات بعد
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <LoyaltyBlock />
          </aside>
        </div>
      </div>
    </div>
  );
}
