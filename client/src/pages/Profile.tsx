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
import { computeTier } from "@shared/loyalty";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
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

export default function Profile() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("activity");
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  const { data: user } = useQuery<UserType>({
    queryKey: ["/api/auth/user"],
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
    enabled: !!user && activeTab === 'followers',
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
    enabled: !!user && activeTab === 'following',
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

        {/* Clean vertical sections — no tabs, no sidebar */}
        <div className="space-y-5 max-w-3xl mx-auto">

          {/* Bookmarks */}
          {bookmarkedArticles.length > 0 && (
            <Card>
              <CardContent className="p-5" dir="rtl">
                <h3 className="text-base font-bold mb-3 flex items-center gap-2">
                  <Bookmark className="h-4 w-4 text-blue-500" />
                  المحفوظات
                  <Badge variant="secondary" className="text-xs mr-auto">{bookmarkedArticles.length}</Badge>
                </h3>
                <div className="divide-y divide-border">
                  {bookmarkedArticles.slice(0, 5).map((article) => (
                    <Link key={article.id} href={`/article/${(article as any).slug || (article as any).englishSlug || article.id}`}>
                      <div className="flex items-center gap-3 py-3 cursor-pointer hover:bg-muted/40 -mx-2 px-2 rounded-lg transition-colors">
                        {(article as any).imageUrl && (
                          <img src={(article as any).imageUrl} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold line-clamp-2 leading-relaxed">{article.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">{(article as any).categoryName || ""}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Liked */}
          {likedArticles.length > 0 && (
            <Card>
              <CardContent className="p-5" dir="rtl">
                <h3 className="text-base font-bold mb-3 flex items-center gap-2">
                  <Heart className="h-4 w-4 text-red-500" />
                  إعجاباتي
                  <Badge variant="secondary" className="text-xs mr-auto">{likedArticles.length}</Badge>
                </h3>
                <div className="divide-y divide-border">
                  {likedArticles.slice(0, 5).map((article) => (
                    <Link key={article.id} href={`/article/${(article as any).slug || (article as any).englishSlug || article.id}`}>
                      <div className="flex items-center gap-3 py-3 cursor-pointer hover:bg-muted/40 -mx-2 px-2 rounded-lg transition-colors">
                        {(article as any).imageUrl && (
                          <img src={(article as any).imageUrl} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold line-clamp-2 leading-relaxed">{article.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">{(article as any).categoryName || ""}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Reading History */}
          {readingHistory.length > 0 && (
            <Card>
              <CardContent className="p-5" dir="rtl">
                <h3 className="text-base font-bold mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-green-500" />
                  سجل القراءة
                  <Badge variant="secondary" className="text-xs mr-auto">{readingHistory.length}</Badge>
                </h3>
                <div className="divide-y divide-border">
                  {readingHistory.slice(0, 5).map((article) => (
                    <Link key={article.id} href={`/article/${(article as any).slug || (article as any).englishSlug || article.id}`}>
                      <div className="flex items-center gap-3 py-3 cursor-pointer hover:bg-muted/40 -mx-2 px-2 rounded-lg transition-colors">
                        {(article as any).imageUrl && (
                          <img src={(article as any).imageUrl} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold line-clamp-2 leading-relaxed">{article.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">{(article as any).categoryName || ""}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Followed Keywords */}
          {followedKeywords.length > 0 && (
            <Card>
              <CardContent className="p-5" dir="rtl">
                <h3 className="text-base font-bold mb-3 flex items-center gap-2">
                  <Tag className="h-4 w-4 text-primary" />
                  كلماتي المتابعة
                </h3>
                <div className="flex flex-wrap gap-2">
                  {followedKeywords.map((kw) => (
                    <Link key={kw.tagId} href={`/keyword/${kw.tagName}`}>
                      <Badge variant="secondary" className="gap-1.5 py-1.5 px-3 text-sm cursor-pointer hover:bg-muted transition-colors" data-testid={`link-keyword-${kw.tagId}`}>
                        #{kw.tagName}
                        <span className="text-muted-foreground text-xs">({kw.articleCount})</span>
                        <button
                          className="mr-1 hover:text-destructive"
                          onClick={(e) => { e.preventDefault(); unfollowKeywordMutation.mutate(kw.tagId); }}
                          data-testid={`button-unfollow-keyword-${kw.tagId}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Followers & Following — combined */}
          {((followStats?.followersCount || 0) > 0 || (followStats?.followingCount || 0) > 0) && (
            <Card>
              <CardContent className="p-5" dir="rtl">
                <div className="flex items-center gap-4 mb-4">
                  <button
                    className={`text-base font-bold pb-1 border-b-2 transition-colors ${activeTab === 'followers' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
                    onClick={() => setActiveTab('followers')}
                    data-testid="button-show-followers"
                  >
                    المتابعون ({followStats?.followersCount || 0})
                  </button>
                  <button
                    className={`text-base font-bold pb-1 border-b-2 transition-colors ${activeTab === 'following' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
                    onClick={() => setActiveTab('following')}
                    data-testid="button-show-following"
                  >
                    المتابَعون ({followStats?.followingCount || 0})
                  </button>
                </div>

                {activeTab === 'followers' && (
                  isLoadingFollowers ? (
                    <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14" />)}</div>
                  ) : followers.length > 0 ? (
                    <div className="divide-y divide-border">
                      {followers.map((f) => (
                        <div key={f.id} className="flex items-center gap-3 py-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={f.profileImageUrl || ""} />
                            <AvatarFallback className="text-sm">{getFollowerInitials(f)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{getFollowerDisplayName(f)}</p>
                            {f.bio && <p className="text-xs text-muted-foreground line-clamp-1">{f.bio}</p>}
                          </div>
                          <Button variant="outline" size="sm" asChild data-testid={`button-view-profile-${f.id}`}>
                            <Link href={`/user/${f.id}`}>عرض</Link>
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-6">لا يوجد متابعون بعد</p>
                  )
                )}

                {activeTab === 'following' && (
                  isLoadingFollowing ? (
                    <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14" />)}</div>
                  ) : following.length > 0 ? (
                    <div className="divide-y divide-border">
                      {following.map((f) => (
                        <div key={f.id} className="flex items-center gap-3 py-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={f.profileImageUrl || ""} />
                            <AvatarFallback className="text-sm">{getFollowerInitials(f)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{getFollowerDisplayName(f)}</p>
                          </div>
                          <Button variant="outline" size="sm" asChild data-testid={`button-view-profile-${f.id}`}>
                            <Link href={`/user/${f.id}`}>عرض</Link>
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => unfollowUserMutation.mutate(f.id)} disabled={unfollowUserMutation.isPending} data-testid={`button-unfollow-user-${f.id}`}>
                            <UserMinus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-6">لا تتابع أحدًا بعد</p>
                  )
                )}
              </CardContent>
            </Card>
          )}

          {/* Security */}
          <Card>
            <CardContent className="p-5" dir="rtl">
              <h3 className="text-base font-bold mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4" />
                الخصوصية والأمان
              </h3>
              <TwoFactorSettings />
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
